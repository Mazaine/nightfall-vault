"""Public DiceMagic launch gate, disabled until consciously enabled by the operator."""
from app.core.config import settings


def dicemagic_public() -> bool:
    return bool(settings.dicemagic_enabled and settings.dicemagic_visibility == "public")


def can_buy_dicemagic(user) -> bool:
    return bool(user is not None and (user.role == "admin" or dicemagic_public()))
