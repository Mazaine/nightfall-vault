from __future__ import annotations

import argparse
import io
from pathlib import Path

from PIL import Image, ImageOps
from pypdf import PdfReader, PdfWriter
from pypdf.generic import RectangleObject
from reportlab.lib.colors import CMYKColor, Color, white
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas
from reportlab.lib.units import mm

ROOT = Path(__file__).resolve().parents[1]
BACKGROUND = ROOT / "frontend/public/assets/nightfall-vip-voucher-background.png"
LOGO = ROOT / "frontend/public/assets/nightfall-vault-logo-transparent.png"

MEDIA_W, MEDIA_H = 100 * mm, 60 * mm
TRIM_X, TRIM_Y = 5 * mm, 5 * mm
TRIM_W, TRIM_H = 90 * mm, 50 * mm
BLEED_X, BLEED_Y = 3 * mm, 3 * mm
BLEED_W, BLEED_H = 94 * mm, 54 * mm
SAFE_X, SAFE_Y = 8 * mm, 8 * mm

GOLD = CMYKColor(0.08, 0.22, 0.72, 0.05)
CREAM = CMYKColor(0.01, 0.03, 0.10, 0)
MUTED = CMYKColor(0.07, 0.09, 0.13, 0.25)
PURPLE = CMYKColor(0.38, 0.72, 0, 0.10)


def register_fonts() -> None:
    fonts = Path("C:/Windows/Fonts")
    pdfmetrics.registerFont(TTFont("NVSerif", str(fonts / "georgia.ttf")))
    pdfmetrics.registerFont(TTFont("NVSerifBold", str(fonts / "georgiab.ttf")))
    pdfmetrics.registerFont(TTFont("NVSans", str(fonts / "arial.ttf")))
    pdfmetrics.registerFont(TTFont("NVSansBold", str(fonts / "arialbd.ttf")))


def cropped_image(path: Path, width: float, height: float, *, mirror: bool = False) -> ImageReader:
    image = Image.open(path).convert("RGB")
    target_ratio = width / height
    source_ratio = image.width / image.height
    if source_ratio > target_ratio:
        crop_width = round(image.height * target_ratio)
        left = (image.width - crop_width) // 2
        image = image.crop((left, 0, left + crop_width, image.height))
    else:
        crop_height = round(image.width / target_ratio)
        top = (image.height - crop_height) // 2
        image = image.crop((0, top, image.width, top + crop_height))
    if mirror:
        image = ImageOps.mirror(image)
    buffer = io.BytesIO()
    image.save(buffer, format="JPEG", quality=95, subsampling=0)
    buffer.seek(0)
    return ImageReader(buffer)


def draw_crop_marks(pdf: canvas.Canvas) -> None:
    pdf.saveState()
    pdf.setStrokeColor(CMYKColor(0, 0, 0, 1))
    pdf.setLineWidth(0.18 * mm)
    gap = 0.5 * mm
    outer = 0.8 * mm
    # Horizontal marks aligned to the trim corners, outside the bleed area.
    for y in (TRIM_Y, TRIM_Y + TRIM_H):
        pdf.line(outer, y, BLEED_X - gap, y)
        pdf.line(BLEED_X + BLEED_W + gap, y, MEDIA_W - outer, y)
    # Vertical marks aligned to the trim corners, outside the bleed area.
    for x in (TRIM_X, TRIM_X + TRIM_W):
        pdf.line(x, outer, x, BLEED_Y - gap)
        pdf.line(x, BLEED_Y + BLEED_H + gap, x, MEDIA_H - outer)
    pdf.restoreState()


def draw_background(pdf: canvas.Canvas, *, mirror: bool, darkness: float) -> None:
    image = cropped_image(BACKGROUND, BLEED_W, BLEED_H, mirror=mirror)
    pdf.drawImage(image, BLEED_X, BLEED_Y, BLEED_W, BLEED_H, mask="auto")
    pdf.saveState()
    pdf.setFillColor(Color(0.018, 0.014, 0.035, alpha=darkness))
    pdf.rect(BLEED_X, BLEED_Y, BLEED_W, BLEED_H, stroke=0, fill=1)
    pdf.restoreState()


def draw_logo(pdf: canvas.Canvas, x: float, y: float, width: float) -> None:
    ratio = 2048 / 704
    pdf.drawImage(str(LOGO), x, y, width, width / ratio, mask="auto", preserveAspectRatio=True)


def draw_front(pdf: canvas.Canvas) -> None:
    draw_background(pdf, mirror=False, darkness=0.22)
    # A restrained left veil keeps the message legible without hiding the artwork.
    pdf.saveState()
    pdf.setFillColor(Color(0.012, 0.010, 0.025, alpha=0.64))
    pdf.rect(BLEED_X, BLEED_Y, 57 * mm, BLEED_H, stroke=0, fill=1)
    pdf.restoreState()

    draw_logo(pdf, SAFE_X, 43 * mm, 34 * mm)
    pdf.setFillColor(GOLD)
    pdf.setFont("NVSansBold", 5.2)
    pdf.drawString(SAFE_X, 37.3 * mm, "VERSENYDÍJ  |  NEM ÉRTÉKESÍTHETŐ")

    pdf.setFillColor(CREAM)
    pdf.setFont("NVSerifBold", 13.2)
    pdf.drawString(SAFE_X, 29.7 * mm, "LÉPJ A GYŰJTŐK")
    pdf.drawString(SAFE_X, 23.5 * mm, "LEGENDÁI KÖZÉ.")

    pdf.setStrokeColor(GOLD)
    pdf.setLineWidth(0.35 * mm)
    pdf.line(SAFE_X, 18.3 * mm, 47 * mm, 18.3 * mm)
    pdf.setFillColor(CREAM)
    pdf.setFont("NVSansBold", 5.5)
    pdf.drawString(SAFE_X, 14.8 * mm, "NIGHTFALL VAULT VIP")
    pdf.setFillColor(MUTED)
    pdf.setFont("NVSans", 4.6)
    pdf.drawString(SAFE_X, 11.5 * mm, "Korlátlan saját aukció  |  VIP-kiemelés")
    draw_crop_marks(pdf)


def draw_field(pdf: canvas.Canvas, x: float, y: float, width: float, height: float, label: str, value: str, value_size: float) -> None:
    pdf.setFillColor(Color(0.02, 0.015, 0.04, alpha=0.88))
    pdf.setStrokeColor(GOLD)
    pdf.setLineWidth(0.25 * mm)
    pdf.roundRect(x, y, width, height, 1.2 * mm, stroke=1, fill=1)
    pdf.setFillColor(GOLD)
    pdf.setFont("NVSansBold", 4.2)
    pdf.drawString(x + 2 * mm, y + height - 3.5 * mm, label)
    pdf.setFillColor(CREAM)
    pdf.setFont("Courier-Bold", value_size)
    pdf.drawCentredString(x + width / 2, y + 2.4 * mm, value)


def draw_back(pdf: canvas.Canvas) -> None:
    draw_background(pdf, mirror=True, darkness=0.72)
    pdf.saveState()
    pdf.setFillColor(Color(0.018, 0.012, 0.038, alpha=0.72))
    pdf.roundRect(TRIM_X + 1.5 * mm, TRIM_Y + 1.5 * mm, TRIM_W - 3 * mm, TRIM_H - 3 * mm, 2 * mm, stroke=0, fill=1)
    pdf.restoreState()

    draw_logo(pdf, SAFE_X, 43.5 * mm, 27 * mm)
    pdf.setFillColor(GOLD)
    pdf.setFont("NVSansBold", 4.5)
    pdf.drawString(SAFE_X, 38.1 * mm, "A KÖVETKEZŐ LEGENDA RÁD VÁR.")

    pdf.setFillColor(CREAM)
    pdf.setFont("NVSansBold", 5.2)
    pdf.drawString(SAFE_X, 32.3 * mm, "AKTIVÁLÁS")
    pdf.setFont("NVSans", 4.7)
    steps = ("1. Lépj be vagy regisztrálj.", "2. Nyisd meg: Fiók > VIP-tagság.", "3. Add meg az aktiváló kódot.")
    for index, step in enumerate(steps):
        pdf.drawString(SAFE_X, (28.5 - index * 4.1) * mm, step)

    draw_field(pdf, 52 * mm, 31.5 * mm, 40 * mm, 12.5 * mm, "VIP-TAGSÁG IDŐTARTAMA", "<<idotartam_honap>>", 6.8)
    draw_field(pdf, 52 * mm, 15.3 * mm, 40 * mm, 13.5 * mm, "AKTIVÁLÓ KÓD", "<<kod>>", 9.2)

    pdf.setFillColor(MUTED)
    pdf.setFont("NVSans", 4.1)
    pdf.drawString(SAFE_X, 10.3 * mm, "A kód egyszer használható. A tagság nem értékesíthető.")
    pdf.setFillColor(PURPLE)
    pdf.setFont("NVSansBold", 4.1)
    pdf.drawRightString(TRIM_X + TRIM_W - 3 * mm, 10.3 * mm, "NIGHTFALL VAULT")
    draw_crop_marks(pdf)


def set_print_boxes(source: Path, destination: Path) -> None:
    reader = PdfReader(str(source))
    writer = PdfWriter()
    trim = RectangleObject([TRIM_X, TRIM_Y, TRIM_X + TRIM_W, TRIM_Y + TRIM_H])
    bleed = RectangleObject([BLEED_X, BLEED_Y, BLEED_X + BLEED_W, BLEED_Y + BLEED_H])
    media = RectangleObject([0, 0, MEDIA_W, MEDIA_H])
    for page in reader.pages:
        page.mediabox = media
        page.cropbox = media
        page.trimbox = trim
        page.bleedbox = bleed
        page.artbox = trim
        writer.add_page(page)
    writer.add_metadata({
        "/Title": "Nightfall Vault VIP - kétoldalas nyomdai kártyasablon",
        "/Subject": "90 x 50 mm vágott méret, 2 mm kifutó, CSV-adatösszefésülési mezők",
        "/Creator": "Nightfall Vault",
    })
    with destination.open("wb") as output:
        writer.write(output)


def generate(output: Path) -> None:
    register_fonts()
    output.parent.mkdir(parents=True, exist_ok=True)
    temporary = output.with_suffix(".source.pdf")
    pdf = canvas.Canvas(str(temporary), pagesize=(MEDIA_W, MEDIA_H), pageCompression=1)
    pdf.setTitle("Nightfall Vault VIP - kétoldalas nyomdai kártyasablon")
    draw_front(pdf)
    pdf.showPage()
    draw_back(pdf)
    pdf.showPage()
    pdf.save()
    set_print_boxes(temporary, output)
    temporary.unlink()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Kétoldalas Nightfall Vault VIP nyomdai kártyasablon készítése.")
    parser.add_argument("--output", type=Path, default=ROOT / "output/pdf/NIGHTFALL_VIP_KARTYA_90x50_KETOLDALAS.pdf")
    arguments = parser.parse_args()
    generate(arguments.output.resolve())
    print(arguments.output.resolve())
