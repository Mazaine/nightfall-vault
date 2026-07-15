from dataclasses import dataclass


@dataclass(frozen=True)
class ImageVariant:
    max_size: tuple[int, int]
    quality: int


IMAGE_VARIANTS = {
    "original": ImageVariant((2200, 2200), 88),
    "detail": ImageVariant((1200, 1200), 85),
    "list": ImageVariant((700, 700), 82),
    "thumbnail": ImageVariant((320, 320), 80),
}
