"""Bounded, harmless image security regressions; no slow exploit payloads."""
from io import BytesIO
from types import SimpleNamespace
from importlib.metadata import version

import pytest
from fastapi import HTTPException
from PIL import Image

from app.core.config import settings
from app.images.processing import process_image
from app.images.validation import validate_image_upload


def encoded(image_format, size=(16, 24)):
    buffer = BytesIO()
    Image.new("RGB", size, (120, 40, 180)).save(buffer, format=image_format)
    return buffer.getvalue()


def test_pillow_runtime_contains_advisory_fix():
    assert tuple(int(part) for part in version("Pillow").split(".")[:2]) >= (13, 0)


@pytest.mark.parametrize("content", [b"GIF89a", b"BMnot-a-png", b"II*\x00fake-tiff", b"<svg/>", b"RIFFxxxxWAVE", b"#define image_width 1"])
def test_disallowed_content_never_calls_a_pillow_parser(monkeypatch, content):
    monkeypatch.setattr(Image, "open", lambda *args, **kwargs: pytest.fail("Unsupported parser dispatch"))
    with pytest.raises(HTTPException) as error:
        validate_image_upload(content, "image/png")
    assert error.value.status_code == 400


@pytest.mark.parametrize("image_format,mime", [("JPEG", "image/jpeg"), ("PNG", "image/png"), ("WEBP", "image/webp")])
def test_valid_card_upload_uses_only_the_content_selected_decoder(monkeypatch, image_format, mime):
    content = encoded(image_format)
    original, calls = Image.open, []
    def limited(*args, **kwargs):
        calls.append(kwargs.get("formats"))
        return original(*args, **kwargs)
    monkeypatch.setattr(Image, "open", limited)
    processed = process_image(content, mime)
    assert calls == [[image_format], [image_format]]
    assert (processed.source_width, processed.source_height) == (16, 24)
    assert len(processed.variants) == 4
    for data in processed.variants.values():
        with original(BytesIO(data), formats=["WEBP"]) as image:
            image.load()
            assert image.format == "WEBP" and image.width / image.height == pytest.approx(2 / 3)


def test_content_and_declared_mime_must_agree():
    with pytest.raises(HTTPException) as error:
        validate_image_upload(encoded("PNG"), "image/jpeg")
    assert error.value.status_code == 400


@pytest.mark.parametrize("field,limit", [("max_image_width", 15), ("max_image_height", 23), ("max_image_pixels", 383)])
def test_resource_limits_precede_verification_and_decode(monkeypatch, field, limit):
    data = encoded("PNG")
    original = Image.open
    def open_without_verification(*args, **kwargs):
        image = original(*args, **kwargs)
        image.verify = lambda: pytest.fail("Oversized image reached verification")
        image.load = lambda: pytest.fail("Oversized image reached pixel decoding")
        return image
    monkeypatch.setattr(Image, "open", open_without_verification)
    monkeypatch.setattr(settings, field, limit)
    with pytest.raises(HTTPException) as error:
        validate_image_upload(data, "image/png")
    assert error.value.status_code == 413


def test_file_size_precedes_parser_dispatch(monkeypatch):
    content = encoded("PNG")
    monkeypatch.setattr(settings, "max_image_file_size_bytes", len(content)-1)
    monkeypatch.setattr(Image, "open", lambda *args, **kwargs: pytest.fail("Oversized file reached parser"))
    with pytest.raises(HTTPException) as error:
        validate_image_upload(content, "image/png")
    assert error.value.status_code == 413


@pytest.mark.parametrize("image_format,mime", [("JPEG", "image/jpeg"), ("PNG", "image/png"), ("WEBP", "image/webp")])
def test_corrupt_supported_headers_fail_safely(image_format, mime):
    prefixes = {"JPEG": b"\xff\xd8\xff", "PNG": b"\x89PNG\r\n\x1a\n", "WEBP": b"RIFF\x10\x00\x00\x00WEBP"}
    with pytest.raises(HTTPException) as error:
        process_image(prefixes[image_format] + b"invalid", mime)
    assert error.value.status_code == 400


@pytest.mark.parametrize("image_format,mime", [("PNG", "image/png"), ("WEBP", "image/webp")])
def test_animated_supported_format_is_rejected(image_format, mime):
    buffer = BytesIO()
    Image.new("RGB", (8, 8), "red").save(buffer, format=image_format, save_all=True,
        append_images=[Image.new("RGB", (8, 8), "blue")], duration=10, loop=0)
    with pytest.raises(HTTPException) as error:
        process_image(buffer.getvalue(), mime)
    assert error.value.status_code == 400


def test_legacy_share_image_uses_safe_fallback_for_disallowed_content(monkeypatch):
    from app.services import auction_share_image
    monkeypatch.setattr(auction_share_image.storage, "exists", lambda *_: True)
    monkeypatch.setattr(auction_share_image.storage, "read_bytes", lambda *_: b"#define image_width 1")
    monkeypatch.setattr(Image, "open", lambda *args, **kwargs: pytest.fail("Share image reached unsupported parser"))
    image = auction_share_image._background(SimpleNamespace(storage_key="audit/fixture"))
    assert image.size == (1200, 630)
