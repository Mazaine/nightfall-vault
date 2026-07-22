import { act, render, screen } from "@testing-library/react";
import { useEffect, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuctionRealtimeProvider, useAuctionRealtime } from "./AuctionRealtimeContext";

class FakeEventSource {
  static latest: FakeEventSource;
  listeners = new Map<string, EventListener>();
  close = vi.fn();

  constructor(_url: string) { FakeEventSource.latest = this; }
  addEventListener(type: string, listener: EventListener) { this.listeners.set(type, listener); }
  emit(type: string, data: unknown) { this.listeners.get(type)?.({ data: JSON.stringify(data) } as MessageEvent); }
}

function PriceConsumer() {
  const { subscribe } = useAuctionRealtime();
  const [price, setPrice] = useState("nincs adat");
  useEffect(() => subscribe((snapshot) => setPrice(snapshot.current_price)), [subscribe]);
  return <span>{price}</span>;
}

describe("AuctionRealtimeProvider", () => {
  beforeEach(() => vi.stubGlobal("EventSource", FakeEventSource));
  afterEach(() => vi.unstubAllGlobals());

  it("egyetlen közös SSE eseményt továbbít a feliratkozó oldalaknak", () => {
    render(<AuctionRealtimeProvider><PriceConsumer /></AuctionRealtimeProvider>);

    act(() => FakeEventSource.latest.emit("auction_update", { auction_id: 1, status: "active", current_price: "1500", highest_bid_id: 9, bid_count: 3, winner_id: null, ends_at: "2026-07-14T10:00:00Z", bids: [] }));

    expect(screen.getByText("1500")).toBeInTheDocument();
  });
});
