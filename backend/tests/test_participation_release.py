import sys

import pytest

from app.core.config import settings
from app.scripts.generate_test_data import build_specs, main as generate_test_data
from tests.test_bid_domain import cleanup_test_data, client, create_active_auction, create_test_user


def test_seed_specs_are_deterministic_and_generator_is_forbidden_in_production(monkeypatch) -> None:
    assert build_specs(42, 20) == build_specs(42, 20)
    assert build_specs(42, 20) != build_specs(43, 20)
    monkeypatch.setattr(settings, "environment", "production")
    monkeypatch.setattr(sys, "argv", ["generate_test_data", "--dry-run"])
    with pytest.raises(SystemExit, match="production környezetben tiltott"):
        generate_test_data()


def test_auction_social_preview_contains_current_public_metadata_only() -> None:
    cleanup_test_data()
    seller = create_test_user("social-preview-seller@bid-test.local")
    auction = create_active_auction(seller)
    response = client.get(f"/auctions/{auction['id']}")
    assert response.status_code == 200
    assert response.headers["cache-control"] == "public, max-age=60, stale-while-revalidate=300"
    html = response.text
    for marker in ("og:title", "og:description", "og:image", "og:url", "twitter:card", "twitter:title", "twitter:description", "twitter:image", "canonical"):
        assert marker in html
    assert auction["title"] in html
    assert seller.email not in html
    cleanup_test_data()
