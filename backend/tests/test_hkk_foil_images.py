"""Foil artwork resolution uses an exact matching partner edition/card id."""
from fastapi.responses import RedirectResponse, Response
from app.api import vault as vault_api


class ImagesDb:
    def __init__(self, partner_url):
        self.partner_url = partner_url

    def scalar(self, _statement):
        return self.partner_url


def test_foil_redirects_only_to_known_partner_image(monkeypatch):
    monkeypatch.setattr(vault_api, "fetch_hkk_card_image", lambda *_args, **_kwargs: (_ for _ in ()).throw(AssertionError("unexpected fallback")))
    value = vault_api.hkk_card_image(12064, variant="foil", db=ImagesDb("https://dicemagic.hu/images/foil/12064.jpg"))
    assert isinstance(value, RedirectResponse)
    assert value.status_code == 307
    assert value.headers["location"] == "https://dicemagic.hu/images/foil/12064.jpg"


def test_foil_without_valid_partner_image_falls_back_to_normal(monkeypatch):
    calls = []
    def image(card_id, *, secondary):
        calls.append((card_id, secondary))
        return b"official-normal", "image/jpeg"
    monkeypatch.setattr(vault_api, "fetch_hkk_card_image", image)
    for candidate in (None, "https://untrusted.invalid/fake-foil.png"):
        response = vault_api.hkk_card_image(12064, variant="foil", db=ImagesDb(candidate))
        assert isinstance(response, Response)
        assert response.body == b"official-normal"
    assert calls == [(12064, False), (12064, False)]


def test_normal_card_does_not_redirect(monkeypatch):
    monkeypatch.setattr(vault_api, "fetch_hkk_card_image", lambda card_id, *, secondary: (b"normal", "image/png"))
    response = vault_api.hkk_card_image(12064, variant="normal", db=ImagesDb("https://dicemagic.hu/foil.png"))
    assert response.body == b"normal"
