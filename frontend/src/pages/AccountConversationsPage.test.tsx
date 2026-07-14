import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AccountConversationsPage } from "./AccountConversationsPage";

const mocks = vi.hoisted(() => ({ listMyAuctionConversations: vi.fn() }));

vi.mock("../api/auctions", async (importOriginal) => {
  const original = await importOriginal<typeof import("../api/auctions")>();
  return { ...original, listMyAuctionConversations: mocks.listMyAuctionConversations };
});

describe("AccountConversationsPage", () => {
  beforeEach(() => {
    mocks.listMyAuctionConversations.mockReset().mockResolvedValue([{
      auction_id: 42,
      auction_title: "Megnyert gyűjtői kártya",
      auction_image_key: null,
      role: "winner",
      counterparty: { id: 2, username: "elado", full_name: "Teszt Eladó" },
      message_count: 1,
      last_message: "Egyeztessük a részleteket.",
      last_message_at: "2026-07-14T10:00:00Z",
      finalized_at: "2026-07-14T09:00:00Z",
    }]);
  });

  it("a lezárt aukció beszélgetését mutatja webshopos műveletek nélkül", async () => {
    render(<MemoryRouter><AccountConversationsPage /></MemoryRouter>);
    expect(await screen.findByText("Megnyert gyűjtői kártya")).toBeInTheDocument();
    expect(screen.getByText("Egyeztessük a részleteket.")).toBeInTheDocument();
    expect(screen.getByText(/nem kezel fizetést, rendelést vagy szállítást/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Beszélgetés megnyitása" })).toHaveAttribute("href", "/auctions/42#auction-conversation");
  });
});
