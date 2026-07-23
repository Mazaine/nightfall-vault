import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { VipMembershipPage } from "./VipMembershipPage";
import { AdminVipCodesPage } from "./admin/AdminVipCodesPage";

const mocks = vi.hoisted(() => ({
  getVipStatus: vi.fn(),
  activateVipCode: vi.fn(),
  generateVipCodes: vi.fn(),
  getAdminVipCodes: vi.fn(),
  refreshMe: vi.fn(),
}));

vi.mock("../api/membership", () => ({
  getVipStatus: mocks.getVipStatus,
  activateVipCode: mocks.activateVipCode,
  generateVipCodes: mocks.generateVipCodes,
  getAdminVipCodes: mocks.getAdminVipCodes,
}));
vi.mock("../AuthContext", () => ({ useAuth: () => ({ refreshMe: mocks.refreshMe }) }));

describe("VIP oldalak", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getVipStatus.mockResolvedValue({ is_vip: false, vip_expires_at: null, active_auction_limit: 3, active_auction_count: 2, featured_auctions: false });
    mocks.getAdminVipCodes.mockResolvedValue([]);
  });

  it("12 karakteres kóddal aktiválja a tagságot és frissíti a felhasználót", async () => {
    mocks.activateVipCode.mockResolvedValue({ is_vip: true, vip_expires_at: "2026-08-23T10:00:00Z", active_auction_limit: null, active_auction_count: 2, featured_auctions: true, message: "Sikeres aktiválás." });
    render(<VipMembershipPage />);
    const input = await screen.findByLabelText("12 karakteres VIP-kód");
    fireEvent.change(input, { target: { value: "a7km2p9r4xq8" } });
    fireEvent.click(screen.getByRole("button", { name: "VIP-tagság aktiválása" }));
    await waitFor(() => expect(mocks.activateVipCode).toHaveBeenCalledWith("A7KM2P9R4XQ8"));
    expect(await screen.findByText("Aktív VIP")).toBeInTheDocument();
    expect(mocks.refreshMe).toHaveBeenCalledOnce();
  });

  it("az admin csak a megengedett darabszámokból és időtartamokból választhat", async () => {
    render(<AdminVipCodesPage />);
    expect(await screen.findByText("Még nincs generált VIP-kód.")).toBeInTheDocument();
    expect(screen.getByLabelText("Tagság időtartama")).toHaveTextContent("1 hónap");
    expect(screen.getByLabelText("Tagság időtartama")).toHaveTextContent("3 hónap");
    expect(screen.getByLabelText("Kódok száma")).toHaveTextContent("500 darab");
    expect(screen.getByRole("button", { name: "Kódok generálása és CSV mentése" })).toBeEnabled();
  });

  it("az admin listában megkülönbözteti a felhasználható és beváltott kódot", async () => {
    mocks.getAdminVipCodes.mockResolvedValue([
      { id: 1, code: "A7KM2P9R4XQ8", masked_code: "•••• •••• 4XQ8", duration_months: 1, batch_id: "batch-one", created_at: "2026-07-23T10:00:00Z", redeemed_at: null, redeemed_by_username: null },
      { id: 2, code: "B8LN3Q7S5YW9", masked_code: "•••• •••• 5YW9", duration_months: 3, batch_id: "batch-two", created_at: "2026-07-23T10:00:00Z", redeemed_at: "2026-07-23T11:00:00Z", redeemed_by_username: "tesztelo" },
    ]);
    render(<AdminVipCodesPage />);
    expect(await screen.findByText("Felhasználható")).toBeInTheDocument();
    expect(screen.getByText("Felhasználva")).toBeInTheDocument();
    expect(screen.getByText("@tesztelo")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Felhasználható kódok CSV mentése" })).toBeEnabled();
  });
});
