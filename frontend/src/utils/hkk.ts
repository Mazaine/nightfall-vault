import { apiAssetUrl } from "../api/client";

const rarityLabels: Record<string, string> = {
  rare: "Ritka",
  common: "Gyakori",
  uncommon: "Nem gyakori",
  uncommun: "Nem gyakori",
};

export function formatHkkRarity(value: string | null | undefined): string | null {
  if (!value) return null;
  const normalized = value.trim().toLocaleLowerCase("hu-HU");
  const label = rarityLabels[normalized];
  return label ? `${value} – ${label}` : value;
}

export function hkkCardImageUrl(externalCardId: string, fallback: string | null | undefined): string {
  const normalizedId = externalCardId.trim();
  if (/^[1-9][0-9]*$/.test(normalizedId)) {
    return apiAssetUrl(`/api/vault/hkk/images/${normalizedId}`);
  }
  return apiAssetUrl(fallback);
}
