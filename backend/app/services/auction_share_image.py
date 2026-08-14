from __future__ import annotations

from hashlib import sha256
from io import BytesIO
import json
from pathlib import Path
import re
import textwrap

from PIL import Image, ImageDraw, ImageFont, ImageOps

from app.models.auction import Auction, AuctionImage
from app.storage import storage
from app.storage.exceptions import StorageUnavailable


SHARE_IMAGE_SIZE = (1200, 630)
SHARE_VERSION_PATTERN = re.compile(r"^[0-9a-f]{16}$")
FONT_PATH = Path("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf")
FONT_BOLD_PATH = Path("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf")


def _font(size: int, *, bold: bool = False):
    path = FONT_BOLD_PATH if bold else FONT_PATH
    if path.is_file():
        return ImageFont.truetype(str(path), size=size)
    return ImageFont.load_default(size=size)


def share_image_version(auction: Auction, cover: AuctionImage | None, bid_count: int) -> str:
    relevant_data = {
        "title": auction.title,
        "status": auction.status,
        "current_price": str(auction.current_price),
        "condition": auction.condition,
        "bid_count": bid_count,
        "buy_now_enabled": auction.buy_now_enabled,
        "buy_now_price": str(auction.buy_now_price) if auction.buy_now_price is not None else None,
        "ends_at": auction.ends_at.isoformat(),
        "cover": cover.storage_key if cover else None,
    }
    encoded = json.dumps(relevant_data, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return sha256(encoded).hexdigest()[:16]


def share_image_storage_key(auction_id: int, version: str) -> str:
    if not SHARE_VERSION_PATTERN.fullmatch(version):
        raise ValueError("Érvénytelen megosztásikép-verzió.")
    return f"share/auctions/{auction_id}/{version}.jpg"


def _background(cover: AuctionImage | None) -> Image.Image:
    canvas = Image.new("RGB", SHARE_IMAGE_SIZE, "#08060f")
    cover_rendered = False
    if cover:
        try:
            if storage.exists(cover.storage_key):
                with Image.open(BytesIO(storage.read_bytes(cover.storage_key))) as source:
                    source = ImageOps.exif_transpose(source).convert("RGB")
                    fitted = ImageOps.contain(source, (720, 630), Image.Resampling.LANCZOS)
                    x = (720 - fitted.width) // 2
                    y = (630 - fitted.height) // 2
                    canvas.paste(fitted, (x, y))
                    cover_rendered = True
        except (FileNotFoundError, OSError):
            cover_rendered = False
    if not cover_rendered:
        draw = ImageDraw.Draw(canvas)
        for y in range(630):
            ratio = y / 629
            color = (int(17 + 20 * ratio), int(8 + 5 * ratio), int(35 + 35 * ratio))
            draw.line((0, y, 720, y), fill=color)
        draw.text((72, 260), "NIGHTFALL\nVAULT", font=_font(62, bold=True), fill="#f7f1e8", spacing=2)

    overlay = Image.new("RGBA", SHARE_IMAGE_SIZE, (0, 0, 0, 0))
    overlay_draw = ImageDraw.Draw(overlay)
    overlay_draw.rectangle((680, 0, 1200, 630), fill=(8, 6, 15, 246))
    overlay_draw.rectangle((0, 0, 1200, 630), outline=(137, 63, 232, 150), width=4)
    return Image.alpha_composite(canvas.convert("RGBA"), overlay).convert("RGB")


def _fit_title(draw: ImageDraw.ImageDraw, title: str) -> tuple[str, ImageFont.FreeTypeFont | ImageFont.ImageFont]:
    for size, width in ((48, 18), (42, 21), (36, 25)):
        font = _font(size, bold=True)
        lines = textwrap.wrap(title.strip(), width=width, break_long_words=True)[:3]
        rendered = "\n".join(lines)
        if draw.multiline_textbbox((0, 0), rendered, font=font, spacing=6)[3] <= 155:
            return rendered, font
    return textwrap.shorten(title.strip(), width=72, placeholder="…"), _font(34, bold=True)


def render_share_image(
    auction: Auction,
    cover: AuctionImage | None,
    bid_count: int,
    condition_label: str,
    price_label: str,
    price: str,
    expiry: str | None,
) -> bytes:
    image = _background(cover)
    draw = ImageDraw.Draw(image)
    panel_x = 730

    draw.text((panel_x, 38), "NIGHTFALL VAULT", font=_font(22, bold=True), fill="#c985ff")
    status = "LEZÁRULT" if auction.status in {"ended", "sold", "unsold"} else "AUKCIÓ"
    draw.text((panel_x, 82), status, font=_font(19, bold=True), fill="#d9cfe4")

    title, title_font = _fit_title(draw, auction.title)
    draw.multiline_text((panel_x, 118), title, font=title_font, fill="#fffaf3", spacing=6)

    draw.text((panel_x, 287), price_label, font=_font(20), fill="#aaa0b7")
    draw.text((panel_x, 319), price, font=_font(46, bold=True), fill="#ffffff")

    draw.rounded_rectangle((panel_x, 390, 1160, 438), radius=20, fill="#28163b", outline="#8c3fe7", width=2)
    draw.text((panel_x + 18, 401), condition_label, font=_font(21, bold=True), fill="#f4ecfb")
    draw.text((panel_x, 462), f"{bid_count} licit", font=_font(21, bold=True), fill="#ddd4e6")

    detail_y = 505
    if auction.buy_now_enabled and auction.buy_now_price is not None and auction.status not in {"ended", "sold", "unsold"}:
        draw.text((panel_x, detail_y), f"Villámár: {auction.buy_now_price:,.0f} Ft".replace(",", " "), font=_font(19), fill="#cbbfd5")
        detail_y += 35
    if expiry:
        draw.text((panel_x, detail_y), f"Lejár: {expiry}", font=_font(19), fill="#cbbfd5")

    output = BytesIO()
    image.save(output, format="JPEG", quality=90, optimize=True, progressive=True)
    return output.getvalue()


def get_or_create_share_image(
    auction: Auction,
    cover: AuctionImage | None,
    bid_count: int,
    condition_label: str,
    price_label: str,
    price: str,
    expiry: str | None,
    version: str,
) -> bytes:
    key = share_image_storage_key(auction.id, version)
    if storage.exists(key):
        return storage.read_bytes(key)

    content = render_share_image(auction, cover, bid_count, condition_label, price_label, price, expiry)
    try:
        storage.save_many_atomic({key: content})
    except StorageUnavailable:
        if not storage.exists(key):
            raise

    for stale_key in storage.iter_files(f"share/auctions/{auction.id}"):
        if stale_key != key:
            storage.delete(stale_key)
    return storage.read_bytes(key)
