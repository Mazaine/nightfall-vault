import ipaddress
import socket
from collections.abc import Callable
from urllib.parse import urlsplit

from app.core.config import settings


class PushEndpointValidationError(ValueError):
    def __init__(self, code: str, *, transient: bool = False) -> None:
        super().__init__(code)
        self.code = code
        self.transient = transient


Resolver = Callable[..., list[tuple]]


def _allowed_host(hostname: str) -> bool:
    normalized = hostname.rstrip(".").lower()
    for configured_suffix in settings.web_push_allowed_host_suffixes:
        suffix = configured_suffix.strip().rstrip(".").lower()
        if suffix and (normalized == suffix or normalized.endswith(f".{suffix}")):
            return True
    return False


def validate_push_service_endpoint(
    endpoint: str,
    *,
    resolve_dns: bool,
    resolver: Resolver = socket.getaddrinfo,
) -> str:
    parsed = urlsplit(endpoint)
    if (
        parsed.scheme != "https"
        or not parsed.hostname
        or parsed.username
        or parsed.password
        or parsed.fragment
    ):
        raise PushEndpointValidationError("push_endpoint_invalid")
    try:
        port = parsed.port
    except ValueError as exc:
        raise PushEndpointValidationError("push_endpoint_invalid_port") from exc
    if port not in (None, 443):
        raise PushEndpointValidationError("push_endpoint_invalid_port")

    hostname = parsed.hostname.rstrip(".").lower()
    try:
        ipaddress.ip_address(hostname)
    except ValueError:
        pass
    else:
        raise PushEndpointValidationError("push_endpoint_ip_not_allowed")
    if hostname == "localhost" or hostname.endswith((".localhost", ".local")):
        raise PushEndpointValidationError("push_endpoint_local_not_allowed")
    if not _allowed_host(hostname):
        raise PushEndpointValidationError("push_endpoint_host_not_allowed")
    if not resolve_dns:
        return endpoint

    try:
        answers = resolver(hostname, 443, type=socket.SOCK_STREAM)
    except (OSError, socket.gaierror) as exc:
        raise PushEndpointValidationError("push_endpoint_dns_error", transient=True) from exc
    addresses = {answer[4][0].split("%", 1)[0] for answer in answers if len(answer) >= 5 and answer[4]}
    if not addresses:
        raise PushEndpointValidationError("push_endpoint_dns_error", transient=True)
    try:
        resolved = [ipaddress.ip_address(address) for address in addresses]
    except ValueError as exc:
        raise PushEndpointValidationError("push_endpoint_dns_error", transient=True) from exc
    if any(not address.is_global for address in resolved):
        raise PushEndpointValidationError("push_endpoint_unsafe_dns")
    return endpoint
