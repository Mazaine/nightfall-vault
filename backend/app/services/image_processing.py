from io import BytesIO

from fastapi import HTTPException
from PIL import Image, ImageOps, UnidentifiedImageError

from app.core.config import settings

VARIANTS = {
    "thumbnail": (320, 320),
    "list": (800, 800),
    "detail": (1600, 1600),
}


def optimize_image_variants(content: bytes, content_type: str) -> tuple[int, int, dict[str, bytes]]:
    try:
        image = Image.open(BytesIO(content))
        image.verify()
        image = Image.open(BytesIO(content))
    except (UnidentifiedImageError, OSError, SyntaxError):
        raise HTTPException(status_code=400, detail="Serult vagy nem tamogatott kepfajl.")

    image = ImageOps.exif_transpose(image)
    width, height = image.size
    if width > settings.max_image_width * 4 or height > settings.max_image_height * 4:
        raise HTTPException(status_code=413, detail="A kep felbontasa tul nagy.")

    if image.mode not in {"RGB", "RGBA"}:
        image = image.convert("RGB")

    output_format = "JPEG" if content_type == "image/jpeg" else "PNG"
    variants: dict[str, bytes] = {}
    for name, size in VARIANTS.items():
        variant = image.copy()
        variant.thumbnail(size)
        buffer = BytesIO()
        save_image = variant.convert("RGB") if output_format == "JPEG" else variant
        save_image.save(buffer, format=output_format, optimize=True)
        variants[name] = buffer.getvalue()
    return width, height, variants
