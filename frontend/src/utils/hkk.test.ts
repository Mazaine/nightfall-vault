import { describe, expect, it } from "vitest";
import { canUseFoil, formatHkkRarity, hkkCardImageUrl, normalizeHkkRarity, preferredHkkImageVariant } from "./hkk";

describe("HKK megjelenítési segédek", () => {
  it("a stabil numerikus HKK ID-t saját kép-proxy URL-re alakítja", () => {
    expect(hkkCardImageUrl("9888", "https://lapkereso.hkk.hu/HKKCardImage.php?cardID=9888"))
      .toBe("http://localhost:8000/api/vault/hkk/images/9888");
  });

  it("nem numerikus régi azonosítónál megtartja a fallback URL-t", () => {
    expect(hkkCardImageUrl("legacy-id", "/media/card.jpg"))
      .toBe("http://localhost:8000/media/card.jpg");
  });

  it("az igazolt FA/GFA képet a változat-paraméteres saját proxyból tölti", () => {
    expect(hkkCardImageUrl("12064", null, "fa")).toBe("http://localhost:8000/api/vault/hkk/images/12064?variant=fa");
    expect(hkkCardImageUrl("12064", null, "gfa")).toBe("http://localhost:8000/api/vault/hkk/images/12064?variant=gfa");
  });

  it("a kép Normál → FA → GFA → FA → Normál sorrendben követi a zseb mennyiségeit", () => {
    const images = { fa: "fa.jpg", gfa: "gfa.jpg" };
    expect(preferredHkkImageVariant({ normal: 1, fa: 0, gfa: 0 }, images)).toBe("normal");
    expect(preferredHkkImageVariant({ normal: 1, fa: 1, gfa: 0 }, images)).toBe("fa");
    expect(preferredHkkImageVariant({ normal: 1, fa: 1, gfa: 1 }, images)).toBe("gfa");
    expect(preferredHkkImageVariant({ normal: 1, fa: 1, gfa: 0 }, images)).toBe("fa");
    expect(preferredHkkImageVariant({ normal: 1, fa: 0, gfa: 0 }, images)).toBe("normal");
    expect(preferredHkkImageVariant({ normal: 1, fa: 1, gfa: 1 }, { fa: "fa.jpg" })).toBe("fa");
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
