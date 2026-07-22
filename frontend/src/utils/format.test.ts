import { describe, expect, it } from "vitest";
import { formatAuctionStatus } from "./format";

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
