import ntpath
import posixpath
import warnings
from io import BytesIO

from fastapi import HTTPException
from PIL import Image, UnidentifiedImageError

from app.core.config import settings

ALLOWED_INPUT_FORMATS = {"JPEG": "image/jpeg", "PNG": "image/png", "WEBP": "image/webp"}


def safe_original_filename(value: str | None) -> str:
    cleaned = (value or "auction-image").replace("\x00", "")
    return posixpath.basename(ntpath.basename(cleaned))[:255] or "auction-image"


def open_supported_image(content: bytes) -> Image.Image:
    """Select one supported decoder from magic bytes, before any Pillow parser.

    Headers are only a dispatch allowlist; Pillow still verifies the actual file.
    Never let MIME/extension or Pillow's default plugin discovery choose a codec.
    """
    if not content:
        raise HTTPException(status_code=400, detail="A feltöltött képfájl üres.")
    if len(content) > settings.max_image_file_size_bytes:
        max_megabytes = settings.max_image_file_size_bytes // (1024 * 1024)
        raise HTTPException(status_code=413, detail=f"A kép legfeljebb {max_megabytes} MB méretű lehet.")
    if content.startswith(b"\xff\xd8\xff"):
        image_format = "JPEG"
    elif content.startswith(b"\x89PNG\r\n\x1a\n"):
        image_format = "PNG"
    elif len(content) >= 12 and content[:4] == b"RIFF" and content[8:12] == b"WEBP":
        image_format = "WEBP"
    else:
        raise HTTPException(status_code=400, detail="Csak JPEG, PNG vagy WEBP kép tölthető fel.")
    return Image.open(BytesIO(content), formats=[image_format])


def validate_image_dimensions(image: Image.Image) -> None:
    # Check headers before verification, animation scans or pixel allocation.
    width, height = image.size
    if width <= 0 or height <= 0 or width > settings.max_image_width or height > settings.max_image_height:
        raise HTTPException(status_code=413, detail="A kép szélessége vagy magassága túl nagy.")
    if width * height > settings.max_image_pixels:
        raise HTTPException(status_code=413, detail="A kép pixelszáma túl nagy.")


def validate_image_upload(content: bytes, declared_content_type: str | None) -> str:
    if declared_content_type not in ALLOWED_INPUT_FORMATS.values():
        raise HTTPException(status_code=400, detail="Csak JPEG, PNG vagy WEBP kép tölthető fel.")
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with open_supported_image(content) as image:
                detected_format = image.format
                detected_content_type = ALLOWED_INPUT_FORMATS.get(str(detected_format))
                if detected_content_type != declared_content_type:
                    raise HTTPException(status_code=400, detail="A kép tartalma nem egyezik a megadott MIME-típussal.")
                validate_image_dimensions(image)
                if getattr(image, "n_frames", 1) != 1:
                    raise HTTPException(status_code=400, detail="Animált kép nem tölthető fel.")
                image.verify()
    except (Image.DecompressionBombError, Image.DecompressionBombWarning):
        raise HTTPException(status_code=413, detail="A kép pixelszáma biztonsági okból túl nagy.")
    except (UnidentifiedImageError, OSError, SyntaxError, ValueError):
        raise HTTPException(status_code=400, detail="Sérült vagy nem támogatott képfájl.")
    return detected_content_type
