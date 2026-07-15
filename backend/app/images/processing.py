import warnings
from dataclasses import dataclass
from io import BytesIO

from fastapi import HTTPException
from PIL import Image, ImageOps, UnidentifiedImageError

from app.images.validation import validate_image_upload
from app.images.variants import IMAGE_VARIANTS


@dataclass(frozen=True)
class ProcessedImage:
    source_width: int
    source_height: int
    variants: dict[str, bytes]


def process_image(content: bytes, declared_content_type: str | None) -> ProcessedImage:
    validate_image_upload(content, declared_content_type)
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(BytesIO(content)) as source:
                source.seek(0)
                image = ImageOps.exif_transpose(source)
                image.load()
                width, height = image.size
                normalized = image.convert("RGBA") if "A" in image.getbands() else image.convert("RGB")
    except (Image.DecompressionBombError, Image.DecompressionBombWarning):
        raise HTTPException(status_code=413, detail="A kép pixelszáma biztonsági okból túl nagy.")
    except (UnidentifiedImageError, OSError, ValueError):
        raise HTTPException(status_code=400, detail="A kép feldolgozása nem sikerült.")
    generated: dict[str, bytes] = {}
    for name, specification in IMAGE_VARIANTS.items():
        variant = normalized.copy()
        variant.thumbnail(specification.max_size, Image.Resampling.LANCZOS)
        output = BytesIO()
        variant.save(output, format="WEBP", quality=specification.quality, method=6, exif=b"")
        generated[name] = output.getvalue()
    return ProcessedImage(source_width=width, source_height=height, variants=generated)
