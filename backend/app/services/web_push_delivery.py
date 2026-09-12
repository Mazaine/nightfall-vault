import hashlib
import json
from collections.abc import Callable
from datetime import datetime, timezone
from typing import Literal

import requests
from pydantic import BaseModel, Field, ValidationError
from pywebpush import WebPushException, webpush

from app.core.config import settings
from app.models.notification import Notification, WebPushSubscription
from app.services.notification_targets import validate_notification_target_url
from app.services.web_push_security import PushEndpointValidationError, validate_push_service_endpoint


SAFE_COPY: dict[str, tuple[str, str]] = {
    "bids": ("Licitfrissítés", "Változás történt az egyik licitednél."),
    "chat": ("Új üzenet", "Új üzeneted érkezett a Nightfall Vaultban."),
    "follows": ("Új követési értesítés", "Új értesítés érkezett egy követett eladótól."),
    "transactions": ("Tranzakciós frissítés", "Új tranzakciós értesítésed érkezett."),
    "reviews": ("Új értékelési értesítés", "Új értékelési értesítésed érkezett."),
    "moderation": ("Fontos fiókértesítés", "Új fiókértesítésed érkezett. Nyisd meg az alkalmazást a részletekért."),
    "system": ("Nightfall Vault értesítés", "Új értesítésed érkezett."),
}


class WebPushPayload(BaseModel):
    schema_version: Literal[1]
    notification_id: int = Field(gt=0)
    event_key: str = Field(min_length=1, max_length=220)
    title: str = Field(min_length=1, max_length=80)
    body: str = Field(min_length=1, max_length=180)
    target_url: str = Field(min_length=1, max_length=500)
    category: Literal["bids", "chat", "follows", "transactions", "reviews", "moderation", "system"]
    tag: str = Field(pattern=r"^nightfall-notification-[1-9][0-9]*$", max_length=64)
    timestamp: str = Field(min_length=20, max_length=40)


class WebPushDeliveryError(Exception):
    def __init__(self, code: str, *, transient: bool, expired: bool = False) -> None:
        super().__init__(code)
        self.code = code
        self.transient = transient
        self.expired = expired


class NoRedirectSession(requests.Session):
    def __init__(self) -> None:
        super().__init__()
        self.trust_env = False

    def request(self, method, url, **kwargs):  # type: ignore[no-untyped-def]
        kwargs["allow_redirects"] = False
        return super().request(method, url, **kwargs)


def build_web_push_payload(notification: Notification) -> str:
    if notification.id is None:
        raise WebPushDeliveryError("push_notification_missing_id", transient=False)
    try:
        target_url = validate_notification_target_url(notification.target_url or "/account/notifications")
        title, body = SAFE_COPY[notification.category]
        payload = WebPushPayload(
            schema_version=1,
            notification_id=notification.id,
            event_key=notification.event_key or f"notification:{notification.id}",
            title=title,
            body=body,
            target_url=target_url,
            category=notification.category,
            tag=f"nightfall-notification-{notification.id}",
            timestamp=(notification.created_at or datetime.now(timezone.utc)).isoformat(),
        )
    except (KeyError, ValueError, ValidationError) as exc:
        raise WebPushDeliveryError("push_payload_invalid", transient=False) from exc
    serialized = json.dumps(payload.model_dump(), ensure_ascii=False, separators=(",", ":"))
    if len(serialized.encode("utf-8")) > 3072:
        raise WebPushDeliveryError("push_payload_too_large", transient=False)
    return serialized


def _topic(event_key: str) -> str:
    return hashlib.sha256(event_key.encode("utf-8")).hexdigest()[:32]


def send_web_push(
    subscription: WebPushSubscription,
    payload: str,
    *,
    send: Callable = webpush,
    resolver: Callable = __import__("socket").getaddrinfo,
) -> None:
    if not (settings.web_push_enabled and settings.vapid_private_key and settings.vapid_subject):
        raise WebPushDeliveryError("web_push_configuration_invalid", transient=False)
    try:
        validate_push_service_endpoint(subscription.endpoint, resolve_dns=True, resolver=resolver)
    except PushEndpointValidationError as exc:
        raise WebPushDeliveryError(exc.code, transient=exc.transient) from exc

    session = NoRedirectSession()
    try:
        response = send(
            subscription_info={
                "endpoint": subscription.endpoint,
                "keys": {"p256dh": subscription.p256dh, "auth": subscription.auth},
            },
            data=payload,
            vapid_private_key=settings.vapid_private_key,
            vapid_claims={"sub": settings.vapid_subject},
            ttl=300,
            timeout=settings.web_push_request_timeout_seconds,
            headers={"Topic": _topic(f"notification:{subscription.id}:{hashlib.sha256(payload.encode()).hexdigest()[:16]}")},
            requests_session=session,
        )
        status_code = int(getattr(response, "status_code", 201))
        if status_code not in (200, 201, 202):
            raise WebPushDeliveryError("push_unexpected_status", transient=status_code == 429 or status_code >= 500)
    except WebPushDeliveryError:
        raise
    except WebPushException as exc:
        status_code = getattr(getattr(exc, "response", None), "status_code", None)
        if status_code in (404, 410):
            raise WebPushDeliveryError("push_subscription_expired", transient=False, expired=True) from exc
        if status_code == 429:
            raise WebPushDeliveryError("push_rate_limited", transient=True) from exc
        if status_code is not None and status_code >= 500:
            raise WebPushDeliveryError("push_service_unavailable", transient=True) from exc
        raise WebPushDeliveryError("push_request_rejected", transient=False) from exc
    except (requests.Timeout, requests.ConnectionError) as exc:
        raise WebPushDeliveryError("push_network_error", transient=True) from exc
    finally:
        session.close()
