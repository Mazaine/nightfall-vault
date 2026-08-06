from html import escape

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import HTMLResponse
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.core.config import settings
from app.db.session import get_db
from app.models.auction import Auction
from app.storage.paths import media_url

router = APIRouter(tags=["social-preview"])


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
    base = settings.app_frontend_url.rstrip("/")
    canonical = f"{base}/auctions/{auction.id}"
    cover = next((image for image in auction.images if image.is_cover), auction.images[0] if auction.images else None)
    image_path = media_url((cover.list_storage_key or cover.storage_key) if cover else None)
    image = f"{base}{image_path}" if image_path else f"{base}/assets/nightfall-castle-background.png"
    status_labels = {"scheduled": "Hamarosan indul", "active": "Aktív", "ended": "Lezárás alatt", "sold": "Eladott", "unsold": "Eladatlan"}
    title = f"{auction.title} | Nightfall Vault"
    description = (
        f"{status_labels.get(auction.status, auction.status)} aukció · "
        f"Jelenlegi ár: {auction.current_price:,.0f} Ft · Zárás: {auction.ends_at:%Y. %m. %d. %H:%M}"
    ).replace(",", " ")
    html = f"""<!doctype html><html lang="hu"><head><meta charset="utf-8">
<title>{escape(title)}</title><meta name="description" content="{escape(description)}">
<link rel="canonical" href="{escape(canonical)}"><meta property="og:type" content="website">
<meta property="og:site_name" content="Nightfall Vault"><meta property="og:locale" content="hu_HU">
<meta property="og:title" content="{escape(title)}"><meta property="og:description" content="{escape(description)}">
<meta property="og:url" content="{escape(canonical)}"><meta property="og:image" content="{escape(image)}">
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="{escape(title)}">
<meta name="twitter:description" content="{escape(description)}"><meta name="twitter:image" content="{escape(image)}">
</head><body><main><h1>{escape(auction.title)}</h1><p>{escape(description)}</p><a href="{escape(canonical)}">Aukció megnyitása</a></main></body></html>"""
    return HTMLResponse(html, headers={"Cache-Control": "public, max-age=60, stale-while-revalidate=300"})
