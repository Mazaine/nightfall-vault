"""Foil artwork must be verified independently from DiceMagic inventory."""
from types import SimpleNamespace

from fastapi.responses import RedirectResponse, Response

from app.api import vault as vault_api


class ImagesDb:
    def __init__(self, *, foil=None, normal=None):
        self.variants = {}
        if foil is not None:
            self.variants["foil"] = foil
        if normal is not None:
            self.variants["normal"] = normal


def foil_record(url, *, verified=True):
    return SimpleNamespace(status="exists", image_url=url, manually_verified=verified)


def test_foil_uses_distinct_verified_official_artwork(monkeypatch):
    monkeypatch.setattr(
        vault_api, "attestation_map", lambda db, _card: db.variants
    )
    monkeypatch.setattr(
        vault_api, "fetch_hkk_card_image",
        lambda *_args, **_kwargs: (_ for _ in ()).throw(AssertionError("should redirect")),
    )
    db = ImagesDb(
        foil=foil_record("https://lapkereso.hkk.hu/foil/12064.jpg"),
        normal=foil_record("https://lapkereso.hkk.hu/HKKCardImage.php?cardID=12064"),
    )
    result = vault_api.hkk_card_image(12064, variant="foil", db=db)
    assert isinstance(result, RedirectResponse)
    assert result.headers["location"] == "https://lapkereso.hkk.hu/foil/12064.jpg"


def test_no_verified_unique_foil_image_uses_normal_reference(monkeypatch):
    monkeypatch.setattr(vault_api, "attestation_map", lambda db, _card: db.variants)
    calls = []
    def image(card_id, *, secondary):
        calls.append((card_id, secondary))
        return b"normal-image", "image/jpeg"
    monkeypatch.setattr(vault_api, "fetch_hkk_card_image", image)

    base = "https://lapkereso.hkk.hu/HKKCardImage.php?cardID=12064"
    for foil in [
        None,
        foil_record(base),
        foil_record("https://lapkereso.hkk.hu/foil/12064.jpg", verified=False),
        foil_record("https://dicemagic.hu/foil/12064.jpg"),
        foil_record("https://untrusted.invalid/foil/12064.jpg"),
    ]:
        db = ImagesDb(foil=foil, normal=foil_record(base))
        result = vault_api.hkk_card_image(12064, variant="foil", db=db)
        assert isinstance(result, Response)
        assert result.body == b"normal-image"
    assert calls == [(12064, False)] * 5


def test_normal_card_always_uses_official_normal_image(monkeypatch):
    monkeypatch.setattr(vault_api, "fetch_hkk_card_image",
                        lambda card_id, *, secondary: (b"normal", "image/png"))
    result = vault_api.hkk_card_image(12064, variant="normal", db=ImagesDb())
    assert result.body == b"normal"
