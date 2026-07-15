from io import BytesIO

import pytest
from PIL import Image
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.session import SessionLocal
from app.services.media_audit import audit_media
from app.storage import storage
from app.storage.base import StorageHealth
from app.storage.exceptions import InvalidStorageKey
from app.storage.local import LocalStorageProvider
from test_auction_domain import auth_headers, auction_payload, cleanup_test_data, client, create_test_user


def image_bytes(image_format: str, size: tuple[int, int] = (80, 40), mode: str = "RGB") -> bytes:
    image = Image.new(mode, size, (120, 40, 180, 160) if mode == "RGBA" else (120, 40, 180))
    buffer = BytesIO()
    image.save(buffer, format=image_format)
    return buffer.getvalue()


def create_draft(email: str):
    seller = create_test_user(email)
    auction = client.post("/api/auctions", json=auction_payload(), headers=auth_headers(seller)).json()
    return seller, auction


@pytest.mark.parametrize(("filename", "content_type", "image_format"), [
    ("card.jpg", "image/jpeg", "JPEG"),
    ("card.png", "image/png", "PNG"),
    ("card.webp", "image/webp", "WEBP"),
])
def test_supported_uploads_create_four_immutable_webp_variants(filename: str, content_type: str, image_format: str) -> None:
    cleanup_test_data()
    seller, auction = create_draft(f"sprint15-{image_format.lower()}@auction-test.local")
    response = client.post(
        f"/api/auctions/{auction['id']}/images",
        headers=auth_headers(seller),
        files={"image": (filename, image_bytes(image_format), content_type)},
    )
    assert response.status_code == 201
    data = response.json()
    keys = [data["storage_key"], data["detail_storage_key"], data["list_storage_key"], data["thumbnail_storage_key"]]
    assert all(key.endswith(".webp") for key in keys)
    assert all(f"/{auction['id']}/" in key for key in keys)
    assert all(storage.exists(key) for key in keys)
    assert data["url"].startswith("/media/auctions/")
    for key in keys:
        with Image.open(BytesIO(storage.read_bytes(key))) as generated:
            assert generated.format == "WEBP"
            assert generated.width / generated.height == pytest.approx(2.0)


@pytest.mark.parametrize(("filename", "content", "content_type"), [
    ("mismatch.jpg", image_bytes("PNG"), "image/jpeg"),
    ("vector.svg", b"<svg xmlns='http://www.w3.org/2000/svg'/>", "image/svg+xml"),
    ("archive.png", b"PK\x03\x04not-an-image", "image/png"),
    ("broken.png", b"\x89PNG\r\n\x1a\ninvalid", "image/png"),
])
def test_malicious_or_invalid_uploads_are_rejected(filename: str, content: bytes, content_type: str) -> None:
    cleanup_test_data()
    seller, auction = create_draft(f"sprint15-invalid-{filename.replace('.', '-')}@auction-test.local")
    before = storage.iter_files("auctions")
    response = client.post(
        f"/api/auctions/{auction['id']}/images",
        headers=auth_headers(seller),
        files={"image": (filename, content, content_type)},
    )
    assert response.status_code == 400
    assert storage.iter_files("auctions") == before


def test_pixel_limit_is_enforced(monkeypatch) -> None:
    cleanup_test_data()
    seller, auction = create_draft("sprint15-pixels@auction-test.local")
    monkeypatch.setattr(settings, "max_image_pixels", 100)
    response = client.post(
        f"/api/auctions/{auction['id']}/images",
        headers=auth_headers(seller),
        files={"image": ("large.png", image_bytes("PNG", (20, 20)), "image/png")},
    )
    assert response.status_code == 413


def test_file_size_limit_is_enforced_without_leaving_files(monkeypatch) -> None:
    cleanup_test_data()
    seller, auction = create_draft("sprint15-size@auction-test.local")
    before = storage.iter_files("auctions")
    monkeypatch.setattr(settings, "max_image_file_size_bytes", 10)
    response = client.post(
        f"/api/auctions/{auction['id']}/images",
        headers=auth_headers(seller),
        files={"image": ("large.png", image_bytes("PNG"), "image/png")},
    )
    assert response.status_code == 413
    assert storage.iter_files("auctions") == before


def test_database_commit_failure_rolls_back_new_variant_files(monkeypatch) -> None:
    cleanup_test_data()
    seller, auction = create_draft("sprint15-db-rollback@auction-test.local")
    before = storage.iter_files("auctions")

    def fail_commit(_session) -> None:
        raise RuntimeError("simulated database failure")

    monkeypatch.setattr(Session, "commit", fail_commit)
    with pytest.raises(RuntimeError, match="simulated database failure"):
        client.post(
            f"/api/auctions/{auction['id']}/images",
            headers=auth_headers(seller),
            files={"image": ("rollback.png", image_bytes("PNG"), "image/png")},
        )
    assert storage.iter_files("auctions") == before


def test_exif_orientation_and_png_alpha_are_preserved() -> None:
    cleanup_test_data()
    seller, auction = create_draft("sprint15-exif@auction-test.local")
    jpeg = Image.new("RGB", (40, 80), (20, 80, 140))
    exif = jpeg.getexif()
    exif[274] = 6
    jpeg_buffer = BytesIO()
    jpeg.save(jpeg_buffer, format="JPEG", exif=exif)
    oriented = client.post(f"/api/auctions/{auction['id']}/images", headers=auth_headers(seller), files={"image": ("rotated.jpg", jpeg_buffer.getvalue(), "image/jpeg")}).json()
    transparent = client.post(f"/api/auctions/{auction['id']}/images", headers=auth_headers(seller), files={"image": ("alpha.png", image_bytes("PNG", mode="RGBA"), "image/png")}).json()
    with Image.open(BytesIO(storage.read_bytes(transparent["detail_storage_key"]))) as generated:
        assert generated.mode == "RGBA"
    assert (oriented["width"], oriented["height"]) == (80, 40)


def test_delete_removes_every_variant_and_keeps_cover_consistent() -> None:
    cleanup_test_data()
    seller, auction = create_draft("sprint15-delete@auction-test.local")
    first = client.post(f"/api/auctions/{auction['id']}/images", headers=auth_headers(seller), files={"image": ("one.png", image_bytes("PNG"), "image/png")}).json()
    second = client.post(f"/api/auctions/{auction['id']}/images", headers=auth_headers(seller), files={"image": ("two.jpg", image_bytes("JPEG"), "image/jpeg")}).json()
    keys = [first["storage_key"], first["detail_storage_key"], first["list_storage_key"], first["thumbnail_storage_key"]]
    response = client.delete(f"/api/auctions/{auction['id']}/images/{first['id']}", headers=auth_headers(seller))
    remaining = client.get(f"/api/auctions/{auction['id']}/images", headers=auth_headers(seller)).json()
    assert response.status_code == 200
    assert not any(storage.exists(key) for key in keys)
    assert len(remaining) == 1 and remaining[0]["id"] == second["id"] and remaining[0]["is_cover"] is True


def test_media_cache_headers_conditional_request_and_traversal_protection() -> None:
    cleanup_test_data()
    seller, auction = create_draft("sprint15-cache@auction-test.local")
    image = client.post(f"/api/auctions/{auction['id']}/images", headers=auth_headers(seller), files={"image": ("card.webp", image_bytes("WEBP"), "image/webp")}).json()
    first = client.get(image["list_url"])
    conditional = client.get(image["list_url"], headers={"If-None-Match": first.headers["etag"]})
    traversal = client.get("/media/%2e%2e/app/main.py")
    assert first.status_code == 200
    assert first.headers["cache-control"] == "public, max-age=31536000, immutable"
    assert first.headers["content-type"].startswith("image/webp")
    assert first.headers["last-modified"] and first.headers["etag"]
    assert conditional.status_code == 304
    assert traversal.status_code in {400, 404}


def test_local_provider_rejects_unsafe_paths_is_persistent_and_reports_health(tmp_path) -> None:
    root = tmp_path / "media"
    provider = LocalStorageProvider(root)
    provider.save_many_atomic({"auctions/2026/07/1/test/original.webp": b"webp"})
    restarted = LocalStorageProvider(root)
    assert restarted.read_bytes("auctions/2026/07/1/test/original.webp") == b"webp"
    assert restarted.check_health().healthy is True
    for unsafe in ("../secret", "/etc/passwd", "..\\secret", "C:\\secret"):
        with pytest.raises(InvalidStorageKey):
            restarted.resolve(unsafe)


def test_readiness_rejects_unhealthy_storage_without_leaking_path(monkeypatch) -> None:
    monkeypatch.setattr(storage, "check_health", lambda: StorageHealth(readable=False, writable=False))
    response = client.get("/health/ready")
    assert response.status_code == 503
    assert response.json()["checks"]["storage"] == "error"
    assert settings.media_root not in response.text


def test_orphan_audit_lists_unreferenced_and_missing_files() -> None:
    cleanup_test_data()
    orphan_key = "auctions/2099/01/999/orphan/original.webp"
    storage.delete(orphan_key)
    storage.save_many_atomic({orphan_key: b"orphan"})
    try:
        with SessionLocal() as db:
            result = audit_media(db, storage)
        assert orphan_key in result.orphan_files
    finally:
        storage.delete(orphan_key)
