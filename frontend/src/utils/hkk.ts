import { apiAssetUrl } from "../api/client";

const rarityLabels: Record<string, string> = {
  rare: "Ritka",
  common: "Gyakori",
  uncommon: "Nem gyakori",
  uncommun: "Nem gyakori",
  ultrarare: "Ultraritka",
};

export function normalizeHkkRarity(value: string | null | undefined): string | null {
  if (!value) return null;
  const normalized = value.trim().toLocaleLowerCase("hu-HU").replace(/[^a-z0-9]/g, "");
  if (normalized === "uncommon" || normalized === "uncommun") return "uncommun";
  return normalized || null;
}

export function canUseFoil(value: string | null | undefined): boolean {
  const rarity = normalizeHkkRarity(value);
  return rarity === "rare" || rarity === "ultrarare";
}

export function formatHkkRarity(value: string | null | undefined): string | null {
  if (!value) return null;
  const normalized = normalizeHkkRarity(value);
  if (!normalized) return value;
  const label = rarityLabels[normalized];
  return label ? `${value} – ${label}` : value;
}

export function hkkCardImageUrl(externalCardId: string, fallback: string | null | undefined, variant: "normal" | "fa" | "gfa" = "normal"): string {
  const normalizedId = externalCardId.trim();
  if (/^[1-9][0-9]*$/.test(normalizedId)) {
    const search = variant === "normal" ? "" : `?variant=${variant}`;
    return apiAssetUrl(`/api/vault/hkk/images/${normalizedId}${search}`);
  }
  return apiAssetUrl(fallback);
}

export function preferredHkkImageVariant(
  quantities: Partial<Record<"normal" | "foil" | "fa" | "gfa", number>>,
  imageUrls: Partial<Record<"normal" | "foil" | "fa" | "gfa", string>> = {},
): "normal" | "fa" | "gfa" {
  if ((quantities.gfa || 0) > 0 && imageUrls.gfa) return "gfa";
  if ((quantities.fa || 0) > 0 && imageUrls.fa) return "fa";
  return "normal";
}
