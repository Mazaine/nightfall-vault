from __future__ import annotations

from datetime import datetime, timezone
from urllib.parse import urlencode

import httpx
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.vault import HkkCardVariantAttestation

VARIANTS = ("normal", "foil", "fa", "gfa")
STATUS_UNKNOWN = "unknown"
OFFICIAL_SOURCE = "https://verseny.hkk.hu/lapkereso"


def _api_url(params: dict[str, str]) -> str:
    return f"{settings.hkk_catalog_base_url.rstrip('/')}/api/api.php?lapkereso/kereses&{urlencode(params)}"


def _cards(params: dict[str, str]) -> dict[str, dict]:
    try:
        response = httpx.get(_api_url(params), timeout=settings.hkk_catalog_request_timeout_seconds)
        response.raise_for_status()
        payload = response.json()
    except (httpx.HTTPError, ValueError) as exc:
        raise HTTPException(status_code=503, detail="A hivatalos HKK lapkereső jelenleg nem érhető el.") from exc
    if not isinstance(payload, dict) or not isinstance(payload.get("cards"), list):
        raise HTTPException(status_code=503, detail="A hivatalos HKK lapkereső hibás választ adott.")
    result: dict[str, dict] = {}
    for card in payload["cards"]:
        card_id = str(card.get("ID", "")).strip() if isinstance(card, dict) else ""
        if card_id.isdigit() and int(card_id) > 0:
            result[str(int(card_id))] = card
    return result


def attestation_map(db: Session, external_card_id: str) -> dict[str, HkkCardVariantAttestation]:
    rows = db.scalars(select(HkkCardVariantAttestation).where(HkkCardVariantAttestation.external_card_id == external_card_id)).all()
    return {row.variant: row for row in rows}


def variant_metadata(db: Session, external_card_id: str) -> tuple[dict[str, str], dict[str, str], bool]:
    rows = attestation_map(db, external_card_id)
    statuses = {variant: rows[variant].status if variant in rows else STATUS_UNKNOWN for variant in VARIANTS}
    images = {variant: row.image_url for variant, row in rows.items() if row.image_url}
    verified = len(rows) == len(VARIANTS) and all(row.status != STATUS_UNKNOWN for row in rows.values())
    return statuses, images, verified


def require_attested_variant(
    db: Session,
    external_card_id: str,
    variant: str,
    *,
    previous_variant: str | None = None,
    previous_quantity: int | None = None,
    quantity: int | None = None,
) -> None:
    row = db.scalar(select(HkkCardVariantAttestation).where(
        HkkCardVariantAttestation.external_card_id == external_card_id,
        HkkCardVariantAttestation.variant == variant,
    ))
    if row is None or row.status != "absent":
        return
    if previous_variant == variant and (quantity is None or (previous_quantity is not None and quantity <= previous_quantity)):
        return
    raise HTTPException(status_code=422, detail=f"A(z) {variant.upper()} változat ennél a konkrét HKK-kiadásnál igazoltan nem létezik.")


def official_edition_preview(db: Session, edition_id: str) -> dict:
    all_cards = _cards({"kiegeszito": edition_id})
    filtered = {
        "foil": _cards({"kiegeszito": edition_id, "flags": "foilosujranyomas"}),
        "fa": _cards({"kiegeszito": edition_id, "flags": "vanFullart"}),
        "gfa": _cards({"kiegeszito": edition_id, "flags": "vanGold"}),
    }
    existing = {(row.external_card_id, row.variant): row for row in db.scalars(
        select(HkkCardVariantAttestation).where(HkkCardVariantAttestation.edition_id == edition_id)
    ).all()}
    changes: list[dict] = []
    checked_at = datetime.now(timezone.utc)
    for card_id, card in all_cards.items():
        editions = [str(value) for value in card.get("editions", [])]
        if edition_id not in editions:
            continue
        name = str(card.get("name") or card_id).strip()[:180]
        special_variants = {variant for variant in ("fa", "gfa") if card_id in filtered[variant]}
        for variant in VARIANTS:
            status = "exists" if variant == "normal" or card_id in filtered.get(variant, {}) else "absent"
            base = f"{settings.hkk_catalog_base_url.rstrip('/')}/HKKCardImage.php?{urlencode({'cardID': card_id})}"
            # The official source exposes one secondary image only. Assign it
            # automatically when it identifies exactly one special variant;
            # ambiguous FA+GFA images must be verified manually instead.
            image_url = (
                f"{base}&masodlagos=1"
                if variant in special_variants and len(special_variants) == 1
                else base if variant in {"normal", "foil"} and status == "exists"
                else None
            )
            previous = existing.get((card_id, variant))
            conflict = bool(previous and previous.manually_verified and (previous.status != status or previous.image_url != image_url))
            changed = previous is None or previous.status != status or previous.image_url != image_url
            changes.append({
                "external_card_id": card_id,
                "card_name": name,
                "edition_id": edition_id,
                "variant": variant,
                "status": status,
                "image_url": image_url,
                "source_url": _api_url({"kiegeszito": edition_id, **({"flags": {"foil": "foilosujranyomas", "fa": "vanFullart", "gfa": "vanGold"}[variant]} if variant != "normal" else {})}),
                "source_checked_at": checked_at,
                "changed": changed,
                "conflict": conflict,
            })
    return {"edition_id": edition_id, "checked_cards": len(all_cards), "changes": changes}


def apply_official_edition(db: Session, edition_id: str, edition_name: str) -> dict:
    preview = official_edition_preview(db, edition_id)
    applied = skipped_manual = 0
    for item in preview["changes"]:
        row = db.scalar(select(HkkCardVariantAttestation).where(
            HkkCardVariantAttestation.external_card_id == item["external_card_id"],
            HkkCardVariantAttestation.variant == item["variant"],
        ).with_for_update())
        if row is not None and row.manually_verified:
            skipped_manual += 1
            continue
        if row is None:
            row = HkkCardVariantAttestation(external_card_id=item["external_card_id"], variant=item["variant"])
            db.add(row)
        row.card_name = item["card_name"]
        row.edition_id = edition_id
        row.edition_name = edition_name
        row.status = item["status"]
        row.image_url = item["image_url"]
        row.source_url = item["source_url"]
        row.source_checked_at = item["source_checked_at"]
        row.verification_method = "official_api"
        row.manually_verified = False
        applied += 1
    db.flush()
    return {"checked_cards": preview["checked_cards"], "applied": applied, "skipped_manual": skipped_manual, "conflicts": sum(1 for item in preview["changes"] if item["conflict"])}
