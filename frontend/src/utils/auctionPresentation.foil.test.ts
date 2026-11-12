import { describe, expect, it } from "vitest";
import type { Auction } from "../api/auctions";
import { toAuctionCardItem } from "./auctionPresentation";

const listing = {
  id: 91,
  seller_id: 2,
  title: "HKK tesztlap",
  category: "Hatalom Kártyái Kártyajáték",
  condition: "NM",
  status: "active",
  listing_type: "fixed",
  listing_format: "single",
  starting_price: "100",
  current_price: "100",
  buy_now_price: "100",
  bid_increment: "100",
  ends_at: "2027-01-01T00:00:00Z",
  images: [],
  vault_external_card_id: "12064",
  vault_print_variant: "foil",
  shop_source: null,
} as unknown as Auction;

describe("HKK hirdetési képváltozatok", () => {
  it("saját foil: normál hivatalos kép + külön szivárványkeret", () => {
    const item = toAuctionCardItem(listing);
    expect(item.foilFrame).toBe(true);
    expect(item.imageUrl).toContain("/api/vault/hkk/images/12064");
    expect(item.imageUrl).not.toContain("variant=foil");
  });

  it.each(["fa", "gfa"] as const)("a %s változathoz másodlagos hivatalos képet és nem foil keretet ad", (variant) => {
    const item = toAuctionCardItem({ ...listing, vault_print_variant: variant });
    expect(item.foilFrame).toBe(false);
    expect(item.imageUrl).toContain(`/api/vault/hkk/images/12064?variant=${variant}`);
  });

  it("a normál, saját fotós és DiceMagic képekre soha nem tesz foil keretet", () => {
    expect(toAuctionCardItem({ ...listing, vault_print_variant: "normal" }).foilFrame).toBe(false);
    expect(toAuctionCardItem({ ...listing, images: [{ id: 1, is_cover: true, url: "/media/my-foil.jpg" }] } as Auction).foilFrame).toBe(false);
    expect(toAuctionCardItem({ ...listing, shop_source: "dicemagic", shop_image_url: "https://dicemagic.hu/foil.jpg" }).foilFrame).toBe(false);
  });
});
