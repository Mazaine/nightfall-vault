"""Fixed-origin client; never logs response bodies or credentials."""
import threading
import time
import httpx
from app.core.config import settings


class DiceMagicError(Exception):
    def __init__(self, code: str, status: int = 502):
        self.code, self.status = code, status
        super().__init__(code)


class DiceMagicClient:
    def __init__(self, transport=None):
        self.transport = transport
        self.token = None
        self.expires = 0
        self.lock = threading.RLock()

    def request(self, method: str, path: str, **kwargs):
        if path not in {"token", "products", "orders"}:
            raise DiceMagicError("invalid_endpoint")
        if not settings.dicemagic_enabled:
            raise DiceMagicError("integration_disabled", 409)
        try:
            with httpx.Client(timeout=20, follow_redirects=False, transport=self.transport) as client:
                return client.request(method, "https://dicemagic.hu/sync/v1/" + path, **kwargs)
        except httpx.HTTPError:
            raise DiceMagicError("network_result_unknown") from None

    def get_token(self):
        with self.lock:
            if self.token and self.expires > time.monotonic():
                return self.token
            if not settings.dicemagic_client_id or not settings.dicemagic_client_secret:
                raise DiceMagicError("credentials_missing", 409)
            response = self.request("POST", "token", auth=(settings.dicemagic_client_id, settings.dicemagic_client_secret))
            if response.status_code != 200:
                raise DiceMagicError("authentication_failed", response.status_code)
            try:
                data = response.json()
                token, lifetime = data["access_token"], int(data["expires_in"])
                if not isinstance(token, str) or not token or lifetime <= 60:
                    raise ValueError()
            except (ValueError, KeyError, TypeError):
                raise DiceMagicError("invalid_token_response") from None
            self.token, self.expires = token, time.monotonic() + lifetime - 60
            return token

    def authorized(self, method, path, **kwargs):
        # One refresh retry only; orders retain the identical external_order_id/body.
        for attempt in range(2):
            response = self.request(method, path, headers={"Authorization": "Bearer " + self.get_token()}, **kwargs)
            if response.status_code != 401 or attempt:
                return response
            self.token = None
        raise DiceMagicError("authentication_failed", 401)

    def products(self):
        response = self.authorized("GET", "products", params={"type": "all"})
        if response.status_code != 200:
            raise DiceMagicError("products_http_" + str(response.status_code), response.status_code)
        try:
            return response.json()
        except ValueError:
            raise DiceMagicError("invalid_products_response") from None


client = DiceMagicClient()
