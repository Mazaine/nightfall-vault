import json
from decimal import Decimal

from app.services.realtime import publish_event


class FakeRedis:
    def __init__(self) -> None:
        self.fields: dict[str, str] = {}

    def xadd(self, _stream: str, fields: dict[str, str], **_kwargs: object) -> str:
        self.fields = fields
        return "1-0"


def test_publish_event_serializes_decimal_money_as_string(monkeypatch) -> None:
    redis = FakeRedis()
    monkeypatch.setattr("app.services.realtime.redis_client", lambda: redis)

    event_id = publish_event("nightfall:realtime:auctions", "auction_update", {"auction_id": 989, "current_price": Decimal("49000.00")})

    assert event_id == "1-0"
    assert json.loads(redis.fields["data"])["current_price"] == "49000.00"
