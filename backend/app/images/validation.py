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


def validate_image_upload(content: bytes, declared_content_type: str | None) -> str:
    if not content:
        raise HTTPException(status_code=400, detail="A feltöltött képfájl üres.")
    if len(content) > settings.max_image_file_size_bytes:
        raise HTTPException(status_code=413, detail="A kép legfeljebb 5 MB méretű lehet.")
    if declared_content_type not in ALLOWED_INPUT_FORMATS.values():
        raise HTTPException(status_code=400, detail="Csak JPEG, PNG vagy WEBP kép tölthető fel.")
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(BytesIO(content)) as image:
                detected_format = image.format
                width, height = image.size
                frames = getattr(image, "n_frames", 1)
                image.verify()
    except (Image.DecompressionBombError, Image.DecompressionBombWarning):
        raise HTTPException(status_code=413, detail="A kép pixelszáma biztonsági okból túl nagy.")
    except (UnidentifiedImageError, OSError, SyntaxError, ValueError):
        raise HTTPException(status_code=400, detail="Sérült vagy nem támogatott képfájl.")
    detected_content_type = ALLOWED_INPUT_FORMATS.get(str(detected_format))
    if detected_content_type is None or detected_content_type != declared_content_type:
        raise HTTPException(status_code=400, detail="A kép tartalma nem egyezik a megadott MIME-típussal.")
    if frames != 1:
        raise HTTPException(status_code=400, detail="Animált kép nem tölthető fel.")
    if width <= 0 or height <= 0 or width > settings.max_image_width or height > settings.max_image_height:
        raise HTTPException(status_code=413, detail="A kép szélessége vagy magassága túl nagy.")
    if width * height > settings.max_image_pixels:
        raise HTTPException(status_code=413, detail="A kép pixelszáma túl nagy.")
    return detected_content_type
