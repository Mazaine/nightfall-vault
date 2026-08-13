from html import escape
from urllib.parse import urlsplit
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import HTMLResponse
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.core.config import settings
from app.db.session import get_db
from app.models.auction import Auction
from app.storage.paths import media_url

router = APIRouter(tags=["social-preview"])

CONDITION_LABELS = {
    "M": "M", "NM": "NM", "EX": "EX", "GD": "GD", "LP": "LP", "PL": "PL", "PO": "PO",
    "fresh": "NM", "like_new": "NM", "played": "PL", "damaged": "PO", "worn": "PO", "misprint": "PO",
}
CLOSED_STATUSES = {"ended", "sold", "unsold"}


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


@router.get("/auctions/{auction_id}", response_class=HTMLResponse, include_in_schema=False)
def auction_social_preview(auction_id: int, db: Session = Depends(get_db)) -> HTMLResponse:
    auction = db.scalar(select(Auction).where(
        Auction.id == auction_id,
        Auction.deleted_at.is_(None),
        Auction.status.notin_({"draft", "cancelled", "suspended"}),
        Auction.demo_batch_id.is_(None),
    ).options(selectinload(Auction.images)))
    if auction is None:
        raise HTTPException(status_code=404, detail="Az aukció nem található.")

    base = _public_base_url()
    canonical = f"{base}/auctions/{auction.id}"
    cover = next((item for item in auction.images if item.is_cover), auction.images[0] if auction.images else None)
    image_key = (cover.detail_storage_key or cover.list_storage_key or cover.storage_key) if cover else None
    image_path = media_url(image_key)
    image = f"{base}{image_path}" if image_path else f"{base}/assets/nightfall-vault-logo.png"

    closed = auction.status in CLOSED_STATUSES
    state = "Lezárult" if closed else ("Hamarosan indul" if auction.status == "scheduled" else "Aktív")
    price_label = "Végső ár" if closed else "Jelenlegi ár"
    condition = CONDITION_LABELS.get(auction.condition, auction.condition)
    ends_at = auction.ends_at.astimezone(ZoneInfo("Europe/Budapest"))
    description = " · ".join((
        state,
        f"{price_label}: {_money(auction.current_price)}",
        f"Licitlépcső: {_money(auction.bid_increment)}",
        condition,
        f"Lejár: {ends_at:%Y.%m.%d. %H:%M}",
    ))
    title = f"{auction.title} | Nightfall Vault"

    html = f"""<!doctype html><html lang="hu"><head><meta charset="utf-8">
<title>{escape(title)}</title><meta name="description" content="{escape(description)}">
<link rel="canonical" href="{escape(canonical)}"><meta property="og:type" content="website">
<meta property="og:site_name" content="Nightfall Vault"><meta property="og:locale" content="hu_HU">
<meta property="og:title" content="{escape(title)}"><meta property="og:description" content="{escape(description)}">
<meta property="og:url" content="{escape(canonical)}"><meta property="og:image" content="{escape(image)}">
<meta property="og:image:secure_url" content="{escape(image)}"><meta property="og:image:alt" content="{escape(auction.title)}">
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="{escape(title)}">
<meta name="twitter:description" content="{escape(description)}"><meta name="twitter:image" content="{escape(image)}">
</head><body><main><h1>{escape(auction.title)}</h1><p>{escape(description)}</p><a href="{escape(canonical)}">Aukció megnyitása</a></main></body></html>"""
    return HTMLResponse(html, headers={"Cache-Control": "public, max-age=60, stale-while-revalidate=300"})
