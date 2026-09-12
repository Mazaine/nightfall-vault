from datetime import datetime, timedelta, timezone

import pytest
from fastapi import HTTPException

from app.services.auction_lifecycle import normalize_start_for_activation


FIXED_NOW = datetime(2026, 9, 12, 12, 0, 0, tzinfo=timezone.utc)


@pytest.mark.parametrize(
    ("requested_start", "expected_start"),
    [
        (FIXED_NOW, FIXED_NOW),
        (FIXED_NOW - timedelta(minutes=1), FIXED_NOW),
        (FIXED_NOW - timedelta(minutes=10), FIXED_NOW),
        (FIXED_NOW + timedelta(minutes=15), FIXED_NOW + timedelta(minutes=15)),
        (datetime(2026, 9, 12, 14, 5, tzinfo=timezone(timedelta(hours=2))), FIXED_NOW + timedelta(minutes=5)),
    ],
)
def test_normalize_start_for_activation_is_utc_safe_and_clamps_tolerated_past(
    requested_start: datetime,
    expected_start: datetime,
) -> None:
    assert normalize_start_for_activation(requested_start, FIXED_NOW) == expected_start


def test_normalize_start_for_activation_rejects_more_than_ten_minutes_in_the_past() -> None:
    with pytest.raises(HTTPException) as caught:
        normalize_start_for_activation(FIXED_NOW - timedelta(minutes=10, seconds=1), FIXED_NOW)

    assert caught.value.status_code == 422
    assert caught.value.detail == "A kezdési idő legfeljebb 10 perccel lehet korábbi a jelenlegi időpontnál."
