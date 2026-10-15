from app.services import vault


class _Response:
    def __init__(self, data: list[dict[str, object]]) -> None:
        self._data = data

    def raise_for_status(self) -> None:
        return None

    def json(self) -> dict[str, list[dict[str, object]]]:
        return {"data": self._data}


def test_market_price_uses_exact_card_edition_variant_and_stock(monkeypatch) -> None:
    vault._hkk_market_cache.clear()
    offers = [
        {"name": "Ősi áldozat", "edition": "Roxat céhei", "graphicType": "NORMAL", "price": 300, "inStock": True, "deleted": False},
        {"name": "Ősi áldozat", "edition": "Roxat céhei", "graphicType": "NORMAL", "price": 400, "inStock": True, "deleted": False},
        {"name": "FOIL Ősi áldozat", "edition": "Roxat céhei", "graphicType": "FOIL", "price": 900, "inStock": True, "deleted": False},
        {"name": "Ősi áldozat", "edition": "Másik kiegészítő", "graphicType": "NORMAL", "price": 50, "inStock": True, "deleted": False},
        {"name": "Ősi áldozat", "edition": "Roxat céhei", "graphicType": "NORMAL", "price": 100, "inStock": False, "deleted": False},
        {"name": "Hasonló lap", "edition": "Roxat céhei", "graphicType": "NORMAL", "price": 1, "inStock": True, "deleted": False},
    ]
    monkeypatch.setattr(vault.httpx, "get", lambda *args, **kwargs: _Response(offers))

    result = vault.hkk_market_price_suggestion("Ősi áldozat", "Roxat céhei", "normal")

    assert result == {"recommended_price": 350, "minimum_price": 300, "maximum_price": 400, "offer_count": 2}


def test_market_price_does_not_guess_without_exact_match(monkeypatch) -> None:
    vault._hkk_market_cache.clear()
    monkeypatch.setattr(vault.httpx, "get", lambda *args, **kwargs: _Response([
        {"name": "Másik lap", "edition": "Roxat céhei", "graphicType": "NORMAL", "price": 300, "inStock": True, "deleted": False},
    ]))

    assert vault.hkk_market_price_suggestion("Ősi áldozat", "Roxat céhei", "normal")["recommended_price"] is None
