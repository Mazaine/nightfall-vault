import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { formatAuctionEndDate, formatAuctionStatus, formatRemainingTime } from "./format";
describe("formatAuctionStatus", () => {
  it("minden aukcióállapotot magyarul jelenít meg", () => {
    expect(formatAuctionStatus("draft")).toBe("Piszkozat");
    expect(formatAuctionStatus("scheduled")).toBe("Hamarosan indul");
    expect(formatAuctionStatus("active")).toBe("Aktív");
    expect(formatAuctionStatus("ended")).toBe("Lezárult");
    expect(formatAuctionStatus("sold")).toBe("Eladott");
    expect(formatAuctionStatus("unsold")).toBe("Eladatlan");
    expect(formatAuctionStatus("cancelled")).toBe("Megszakítva");
    expect(formatAuctionStatus("suspended")).toBe("Felfüggesztve");
  });
});

describe("formatRemainingTime", () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date("2026-09-13T12:00:00.000Z")); });
  afterEach(() => vi.useRealTimers());

  it("53 órát napokra, órákra és percekre bont", () => {
    expect(formatRemainingTime("2026-09-15T17:27:00.000Z", "active")).toBe("2 nap 5 óra 27 perc");
  });

  it("24 óra alatt nem ír ki nulla napot", () => {
    expect(formatRemainingTime("2026-09-13T20:16:00.000Z", "active")).toBe("8 óra 16 perc");
  });

  it("egy óra alatt csak percet ír ki", () => {
    expect(formatRemainingTime("2026-09-13T12:42:00.000Z", "active")).toBe("42 perc");
  });

  it("lejárt és lezárt állapotot elkülönít", () => {
    expect(formatRemainingTime("2026-09-13T11:59:00.000Z", "active")).toBe("Lejárt");
    expect(formatRemainingTime("2026-09-15T12:00:00.000Z", "sold")).toBe("Lezárva");
  });

  it("magyar locale szerint, a böngésző helyi időzónájában formáz", () => {
    const value = "2026-09-15T16:30:00.000Z";
    expect(formatAuctionEndDate(value)).toBe(new Intl.DateTimeFormat("hu-HU", {
      weekday: "long", year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit",
    }).format(new Date(value)));
  });
});
