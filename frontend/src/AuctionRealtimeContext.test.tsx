import { act, screen, waitFor } from "@testing-library/react";
import { useEffect, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuctionRealtimeProvider, useAuctionRealtime } from "./AuctionRealtimeContext";
import { renderWithProviders } from "./test/renderWithProviders";

const mocks = vi.hoisted(() => ({ getMe: vi.fn() }));
vi.mock("./api/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./api/auth")>()),
  getMe: mocks.getMe,
}));

function PriceConsumer() {
  const { subscribe } = useAuctionRealtime();
  const [price, setPrice] = useState("nincs adat");
  useEffect(() => subscribe((snapshot) => setPrice(snapshot.current_price)), [subscribe]);
  return <span>{price}</span>;
}

describe("AuctionRealtimeProvider", () => {
  const pendingReads: Array<(result: { done: boolean; value?: Uint8Array }) => void> = [];

  beforeEach(() => {
    pendingReads.length = 0;
    mocks.getMe.mockReset();
    mocks.getMe.mockResolvedValue({ id: 1, email: "realtime@example.invalid", username: "realtime", full_name: "Realtime Teszt", role: "user", is_vip: false, vip_expires_at: null });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      body: { getReader: () => ({ read: () => new Promise((resolve) => pendingReads.push(resolve)) }) },
    }));
  });
  afterEach(() => vi.unstubAllGlobals());

  it("egyetlen közös SSE eseményt továbbít a feliratkozó oldalaknak és unmountkor megszakítja a kapcsolatot", async () => {
    const view = renderWithProviders(<AuctionRealtimeProvider><PriceConsumer /></AuctionRealtimeProvider>);

    await waitFor(() => expect(pendingReads.length).toBeGreaterThan(0));
    const event = `id: 1-0\nevent: auction_update\ndata: ${JSON.stringify({ auction_id: 1, status: "active", current_price: "1500", highest_bid_id: 9, bid_count: 3, winner_id: null, ends_at: "2026-07-14T10:00:00Z", bids: [] })}\n\n`;
    act(() => pendingReads[pendingReads.length - 1]?.({ done: false, value: new TextEncoder().encode(event) }));

    expect(await screen.findByText("1500")).toBeInTheDocument();
    const fetchCalls = vi.mocked(fetch).mock.calls;
    const signal = (fetchCalls[fetchCalls.length - 1]?.[1] as RequestInit | undefined)?.signal;
    view.unmount();
    expect(signal?.aborted).toBe(true);
  });
});
