import re


ACCOUNT_TARGETS = {
    "/account/auctions",
    "/account/blocked-users",
    "/account/messages",
    "/account/notifications",
    "/account/profile",
    "/account/reports",
    "/account/transactions",
    "/account/vip",
}
AUCTION_TARGET = re.compile(r"^/auctions/[1-9][0-9]*$")
USER_TARGET = re.compile(r"^/users/[^/?#\\]+$")


def validate_notification_target_url(target_url: str) -> str:
    """Return a verified internal SPA route or reject it.

    Notification targets are persisted and later consumed by browser and native
    clients, so accepting a merely relative-looking URL is not sufficient.
    """
    if not isinstance(target_url, str) or not target_url or target_url != target_url.strip():
        raise ValueError("Notification target must be a non-empty internal route.")
    lowered = target_url.lower()
    if "\\" in target_url or target_url.startswith("//") or lowered.startswith(("http:", "https:")):
        raise ValueError("Notification target must not reference an external URL.")
    if "?" in target_url or "#" in target_url:
        raise ValueError("Notification target query strings and fragments are not allowed.")
    if "%" in target_url:
        raise ValueError("Notification target must not contain encoded path characters.")
    if any(segment in {".", ".."} for segment in target_url.split("/")):
        raise ValueError("Notification target contains path traversal.")
    if target_url in ACCOUNT_TARGETS or AUCTION_TARGET.fullmatch(target_url) or USER_TARGET.fullmatch(target_url):
        return target_url
    raise ValueError("Notification target is not an allowed Nightfall Vault route.")
