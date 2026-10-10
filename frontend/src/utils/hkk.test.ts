import { describe, expect, it } from "vitest";
import { canUseFoil, formatHkkRarity, hkkCardImageUrl, normalizeHkkRarity } from "./hkk";

describe("HKK megjelenítési segédek", () => {
  it("a stabil numerikus HKK ID-t saját kép-proxy URL-re alakítja", () => {
    expect(hkkCardImageUrl("9888", "https://lapkereso.hkk.hu/HKKCardImage.php?cardID=9888"))
      .toBe("http://localhost:8000/api/vault/hkk/images/9888");
  });

  it("nem numerikus régi azonosítónál megtartja a fallback URL-t", () => {
    expect(hkkCardImageUrl("legacy-id", "/media/card.jpg"))
      .toBe("http://localhost:8000/media/card.jpg");
  });

  it("magyarítja az ismert gyakoriságokat", () => {
    expect(formatHkkRarity("rare")).toBe("rare – Ritka");
    expect(formatHkkRarity("common")).toBe("common – Gyakori");
    expect(formatHkkRarity("uncommun")).toBe("uncommun – Nem gyakori");
    expect(formatHkkRarity("ultrarare")).toBe("ultrarare – Ultraritka");
  });

  it("a valós API gyakoriságértékeit normalizálja és csak ritkánál enged foilt", () => {
    expect(normalizeHkkRarity("uncommon")).toBe("uncommun");
    expect(normalizeHkkRarity("ultraRare")).toBe("ultrarare");
    expect(canUseFoil("rare")).toBe(true);
    expect(canUseFoil("ultraRare")).toBe(true);
    expect(canUseFoil("common")).toBe(false);
    expect(canUseFoil("uncommon")).toBe(false);
  });
});
