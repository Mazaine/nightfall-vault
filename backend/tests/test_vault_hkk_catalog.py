import httpx
import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.core.config import settings
from app.main import app
from app.services import vault


client = TestClient(app)


class FakeResponse:
    def __init__(self, payload: object, *, status_error: bool = False, content: bytes = b"", content_type: str = "application/json"):
        self.payload = payload
        self.status_error = status_error
        self.content = content
        self.headers = {"content-type": content_type}

    def raise_for_status(self) -> None:
        if self.status_error:
            raise httpx.HTTPStatusError("upstream failed", request=httpx.Request("GET", "https://lapkereso.hkk.hu"), response=httpx.Response(503))

    def json(self) -> object:
        return self.payload


@pytest.fixture(autouse=True)
def configure_catalog(monkeypatch):
    monkeypatch.setattr(settings, "hkk_catalog_base_url", "https://lapkereso.hkk.hu")
    monkeypatch.setattr(settings, "hkk_catalog_request_timeout_seconds", 3.0)
    monkeypatch.setattr(vault, "_hkk_constants_cache", None)


def test_search_uses_magusiskola_protocol_and_maps_stable_id(monkeypatch) -> None:
    calls: list[tuple[str, float]] = []

    def fake_get(url: str, *, timeout: float):
        calls.append((url, timeout))
        if "cardConstants" in url:
            return FakeResponse({"subTypes": ["xenó"], "editions": [{"id": 220, "nev": "Résföld"}]})
        return FakeResponse({"cards": [
            {"ID": 9965, "name": "Xenó lárva (2022)", "link": "xeno_larva_2022", "type": ["Szörny", "xenó", "ősmágia"], "color": ["Chara-din", "Nincs"], "commonness": "rare", "editions": [220]},
            {"ID": 9965, "name": "Duplikált rekord"},
            {"ID": "hibás", "name": "Hibás rekord"},
        ]})

    monkeypatch.setattr(vault.httpx, "get", fake_get)
    result = vault.search_hkk_cards("Xenó lárva & próba", 20)

    assert len(result) == 1
    card = result[0]
    assert card["external_card_id"] == "9965"
    assert card["card_name"] == "Xenó lárva (2022)"
    assert card["image_url"] == "https://lapkereso.hkk.hu/HKKCardImage.php?cardID=9965"
    assert card["edition"] == "Résföld"
    assert card["card_type"] == "Szörny · ősmágia"
    assert card["subtype"] == "xenó"
    assert card["color"] == "Chara-din · Nincs"
    assert card["rarity"] == "rare"
    assert card["source_token"] == vault.sign_card_snapshot(card)
    assert calls[0] == ("https://lapkereso.hkk.hu/api/api.php?lapkereso/cardConstants", 3.0)
    assert calls[1][0].endswith("?lapkereso/kereses&nev=Xen%C3%B3+l%C3%A1rva+%26+pr%C3%B3ba")


def test_search_returns_empty_list_for_valid_empty_response(monkeypatch) -> None:
    monkeypatch.setattr(vault.httpx, "get", lambda url, timeout: FakeResponse({"subTypes": [], "editions": []}) if "cardConstants" in url else FakeResponse({"cards": []}))
    assert vault.search_hkk_cards("nincs ilyen lap", 20) == []


def test_search_can_be_limited_to_an_edition(monkeypatch) -> None:
    calls: list[str] = []

    def fake_get(url: str, *, timeout: float):
        calls.append(url)
        if "cardConstants" in url:
            return FakeResponse({"subTypes": [], "editions": [{"id": 220, "nev": "Résföld"}, {"id": 221, "nev": "Másik"}]})
        return FakeResponse({"cards": [
            {"ID": 1, "name": "Résföldi lap", "editions": [220]},
            {"ID": 2, "name": "Másik lap", "editions": [221]},
        ]})

    monkeypatch.setattr(vault.httpx, "get", fake_get)
    result = vault.search_hkk_cards("lap", 20, "220")

    assert [card["external_card_id"] for card in result] == ["1"]
    assert calls[-1].endswith("?lapkereso/kereses&nev=lap&kiegeszito=220")


def test_editions_and_full_edition_cards_use_real_lapkereso_parameter(monkeypatch) -> None:
    calls: list[str] = []

    def fake_get(url: str, *, timeout: float):
        calls.append(url)
        if "cardConstants" in url:
            return FakeResponse({"subTypes": [], "editions": [{"id": 220, "nev": "Résföld"}, {"id": 221, "nev": "Másik"}]})
        return FakeResponse({"cards": [
            {"ID": 9965, "name": "Xenó lárva", "type": ["Szörny"], "color": ["Chara-din"], "commonness": "rare", "editions": [220]},
            {"ID": 9965, "name": "Duplikált", "editions": [220]},
            {"ID": 7106, "name": "Másik kiadás lapja", "editions": [221]},
        ]})

    monkeypatch.setattr(vault.httpx, "get", fake_get)
    assert vault.list_hkk_editions() == [{"id": "220", "name": "Résföld"}, {"id": "221", "name": "Másik"}]
    edition, cards = vault.hkk_edition_cards("220")
    assert edition == {"id": "220", "name": "Résföld"}
    assert [card["external_card_id"] for card in cards] == ["9965"]
    assert cards[0]["source_token"] == vault.sign_card_snapshot(cards[0])
    assert calls[-1].endswith("?lapkereso/kereses&kiegeszito=220")


@pytest.mark.parametrize("failure", ["network", "malformed_constants", "malformed_search"])
def test_search_translates_upstream_failures_to_503(monkeypatch, failure: str) -> None:
    def fake_get(url: str, *, timeout: float):
        if failure == "network":
            raise httpx.ConnectError("dns", request=httpx.Request("GET", url))
        if "cardConstants" in url:
            return FakeResponse([] if failure == "malformed_constants" else {"subTypes": [], "editions": []})
        return FakeResponse({"unexpected": []})

    monkeypatch.setattr(vault.httpx, "get", fake_get)
    with pytest.raises(HTTPException) as exc_info:
        vault.search_hkk_cards("teszt", 20)
    assert exc_info.value.status_code == 503


def test_signed_snapshot_rejects_changed_or_invalid_card_id(monkeypatch) -> None:
    card = {"external_card_id": "9965", "card_name": "Xenó lárva", "image_url": None, "edition": None, "card_type": None, "subtype": None, "color": None, "rarity": None}
    token = vault.sign_card_snapshot(card)
    payload = type("Payload", (), {**card, "source_token": token})()
    vault.require_valid_card_snapshot(payload)
    payload.card_name = "Hamis név"
    with pytest.raises(HTTPException) as exc_info:
        vault.require_valid_card_snapshot(payload)
    assert exc_info.value.status_code == 422
    assert vault.parse_hkk_item({"ID": "-1", "name": "Hibás"}, (frozenset(), {})) is None


def test_hkk_card_image_proxy_accepts_only_valid_bounded_images(monkeypatch) -> None:
    calls: list[str] = []

    def fake_get(url: str, *, timeout: float):
        calls.append(url)
        return FakeResponse({}, content=b"jpeg-data", content_type="image/jpg")

    monkeypatch.setattr(vault.httpx, "get", fake_get)
    content, media_type = vault.fetch_hkk_card_image(9888)
    assert content == b"jpeg-data"
    assert media_type == "image/jpeg"
    assert calls == ["https://lapkereso.hkk.hu/HKKCardImage.php?cardID=9888"]

    monkeypatch.setattr(vault.httpx, "get", lambda url, timeout: FakeResponse({}, content=b"not-an-image", content_type="text/html"))
    with pytest.raises(HTTPException) as exc_info:
        vault.fetch_hkk_card_image(9888)
    assert exc_info.value.status_code == 502

    monkeypatch.setattr(vault.httpx, "get", lambda url, timeout: FakeResponse({}, content=b"x" * (vault.HKK_CARD_IMAGE_MAX_BYTES + 1), content_type="image/jpeg"))
    with pytest.raises(HTTPException) as exc_info:
        vault.fetch_hkk_card_image(9888)
    assert exc_info.value.status_code == 502


def test_hkk_card_image_endpoint_is_same_origin_and_publicly_cacheable(monkeypatch) -> None:
    monkeypatch.setattr("app.api.vault.fetch_hkk_card_image", lambda card_id: (b"jpeg-data", "image/jpeg"))
    response = client.get("/api/vault/hkk/images/9888")
    assert response.status_code == 200
    assert response.content == b"jpeg-data"
    assert response.headers["content-type"] == "image/jpeg"
    assert response.headers["cache-control"] == "public, max-age=86400, stale-while-revalidate=604800"
    assert client.get("/api/vault/hkk/images/0").status_code == 422
