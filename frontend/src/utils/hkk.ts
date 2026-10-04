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
