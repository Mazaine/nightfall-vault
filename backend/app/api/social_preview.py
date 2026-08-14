from html import escape
from urllib.parse import urlsplit
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import HTMLResponse, Response
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.core.config import settings
from app.db.session import get_db
from app.models.auction import Auction, Bid
from app.services.auction_share_image import (
    SHARE_IMAGE_SIZE,
    SHARE_VERSION_PATTERN,
    get_or_create_share_image,
    share_image_version,
)

router = APIRouter(tags=["social-preview"])

CONDITION_LABELS = {
    "M": "M – Tökéletes", "NM": "NM – Újszerű", "EX": "EX – Kiváló", "GD": "GD – Jó",
    "LP": "LP – Enyhén játszott", "PL": "PL – Játszott", "PO": "PO – Rossz",
    "fresh": "NM – Újszerű", "like_new": "NM – Újszerű", "played": "PL – Játszott",
    "damaged": "PO – Rossz", "worn": "PO – Rossz", "misprint": "PO – Rossz",
}
CLOSED_STATUSES = {"ended", "sold", "unsold"}
HU_MONTHS = ("jan.", "febr.", "márc.", "ápr.", "máj.", "jún.", "júl.", "aug.", "szept.", "okt.", "nov.", "dec.")


def _money(value) -> str:
    return f"{value:,.0f}".replace(",", " ") + " Ft"


def _public_base_url() -> str:
    base = settings.app_frontend_url.rstrip("/")
    parsed = urlsplit(base)
    if settings.environment == "production" and (
        parsed.scheme != "https" or not parsed.hostname or parsed.hostname in {"localhost", "127.0.0.1"}
    ):
        raise HTTPException(status_code=503, detail="A megosztási előnézet publikus URL-je nincs megfelelően beállítva.")
    return base


def _hu_datetime(value) -> str:
    local = value.astimezone(ZoneInfo("Europe/Budapest"))
    return f"{local.year}. {HU_MONTHS[local.month - 1]} {local.day}. {local:%H:%M}"


def _description(parts: list[str]) -> str:
    text = " · ".join(parts)
    cta = "Nézd meg és licitálj a Nightfall Vaulton!"
    return f"{text} · {cta}" if len(text) + len(cta) + 3 <= 300 else text[:300].rstrip(" ·")


def _public_auction(auction_id: int, db: Session) -> Auction:
    auction = db.scalar(select(Auction).where(
        Auction.id == auction_id,
        Auction.deleted_at.is_(None),
        Auction.status.notin_({"draft", "cancelled", "suspended"}),
        Auction.demo_batch_id.is_(None),
    ).options(selectinload(Auction.images)))
    if auction is None:
        raise HTTPException(status_code=404, detail="Az aukció nem található.")
    return auction


def _cover(auction: Auction):
    return next((item for item in auction.images if item.is_cover), auction.images[0] if auction.images else None)


def _bid_count(auction_id: int, db: Session) -> int:
    return int(db.scalar(select(func.count(Bid.id)).where(Bid.auction_id == auction_id, Bid.status == "active")) or 0)


@router.get("/auctions/{auction_id}", response_class=HTMLResponse, include_in_schema=False)
def auction_social_preview(auction_id: int, db: Session = Depends(get_db)) -> HTMLResponse:
    auction = _public_auction(auction_id, db)

    base = _public_base_url()
    canonical = f"{base}/auctions/{auction.id}"
    cover = _cover(auction)
    bid_count = _bid_count(auction.id, db)
    version = share_image_version(auction, cover, bid_count)
    image = f"{base}/api/share/auctions/{auction.id}/{version}.jpg"

    closed = auction.status in CLOSED_STATUSES
    condition = CONDITION_LABELS.get(auction.condition)
    seller_name = auction.seller.full_name or auction.seller.username
    if closed:
        parts = ["Lezárult", f"Végső ár: {_money(auction.current_price)}"]
    else:
        parts = [
            "Hamarosan indul" if auction.status == "scheduled" else f"Aktuális ár: {_money(auction.current_price)}",
            f"Licitlépcső: {_money(auction.bid_increment)}",
        ]
    if condition:
        parts.append(f"Állapot: {condition}")
    if not closed and auction.buy_now_enabled and auction.buy_now_price is not None:
        parts.append(f"Villámár: {_money(auction.buy_now_price)}")
    if not closed:
        parts.append(f"Lejárat: {_hu_datetime(auction.ends_at)}")
    parts.append(f"Eladó: {seller_name}")
    description = _description(parts)
    title = f"{auction.title} | Nightfall Vault"

    html = f"""<!doctype html><html lang="hu"><head><meta charset="utf-8">
<title>{escape(title)}</title><meta name="description" content="{escape(description)}">
<link rel="canonical" href="{escape(canonical)}"><meta property="og:type" content="website">
<meta property="og:site_name" content="Nightfall Vault"><meta property="og:locale" content="hu_HU">
<meta property="og:title" content="{escape(title)}"><meta property="og:description" content="{escape(description)}">
<meta property="og:url" content="{escape(canonical)}"><meta property="og:image" content="{escape(image)}">
<meta property="og:image:secure_url" content="{escape(image)}"><meta property="og:image:alt" content="{escape(auction.title)}">
<meta property="og:image:type" content="image/jpeg"><meta property="og:image:width" content="{SHARE_IMAGE_SIZE[0]}">
<meta property="og:image:height" content="{SHARE_IMAGE_SIZE[1]}">
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="{escape(title)}">
<meta name="twitter:description" content="{escape(description)}"><meta name="twitter:image" content="{escape(image)}">
</head><body><main><h1>{escape(auction.title)}</h1><p>{escape(description)}</p><a href="{escape(canonical)}">Aukció megnyitása</a></main></body></html>"""
    return HTMLResponse(html, headers={
        "Cache-Control": "public, max-age=60, stale-while-revalidate=300",
        "Vary": "User-Agent",
    })


@router.get("/api/share/auctions/{auction_id}/{version}.jpg", include_in_schema=False)
def auction_share_image(auction_id: int, version: str, db: Session = Depends(get_db)) -> Response:
    if not SHARE_VERSION_PATTERN.fullmatch(version):
        raise HTTPException(status_code=404, detail="A megosztási kép nem található.")
    auction = _public_auction(auction_id, db)
    cover = _cover(auction)
    bid_count = _bid_count(auction.id, db)
    expected_version = share_image_version(auction, cover, bid_count)
    if version != expected_version:
        raise HTTPException(status_code=404, detail="A megosztási kép elavult.")

    closed = auction.status in CLOSED_STATUSES
    condition = CONDITION_LABELS.get(auction.condition, auction.condition)
    content = get_or_create_share_image(
        auction=auction,
        cover=cover,
        bid_count=bid_count,
        condition_label=condition,
        price_label="Végső ár" if closed else "Aktuális ár",
        price=_money(auction.current_price),
        expiry=None if closed else _hu_datetime(auction.ends_at).replace(f"{auction.ends_at.astimezone(ZoneInfo('Europe/Budapest')).year}. ", ""),
        version=version,
    )
    return Response(content=content, media_type="image/jpeg", headers={
        "Cache-Control": "public, max-age=31536000, immutable",
        "Content-Disposition": f'inline; filename="auction-{auction.id}-{version}.jpg"',
    })
