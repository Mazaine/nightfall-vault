import { createContext, useCallback, useContext, useEffect, useMemo, useRef, type ReactNode } from "react";
import { auctionListStreamUrl, type AuctionRealtimeSnapshot } from "./api/auctions";

type AuctionUpdateListener = (snapshot: AuctionRealtimeSnapshot) => void;
type AuctionRealtimeContextValue = { subscribe: (listener: AuctionUpdateListener) => () => void };

const EMPTY_CONTEXT: AuctionRealtimeContextValue = { subscribe: () => () => undefined };
const AuctionRealtimeContext = createContext<AuctionRealtimeContextValue>(EMPTY_CONTEXT);

export function AuctionRealtimeProvider({ children }: { children: ReactNode }) {
  const listeners = useRef(new Set<AuctionUpdateListener>());

  useEffect(() => {
    if (typeof EventSource === "undefined") return;
    const source = new EventSource(auctionListStreamUrl());
    source.addEventListener("auction_update", (event) => {
      try {
        const snapshot = JSON.parse((event as MessageEvent).data) as AuctionRealtimeSnapshot;
        listeners.current.forEach((listener) => listener(snapshot));
      } catch {
        // A hibás realtime esemény nem szakíthatja meg a későbbi frissítéseket.
      }
    });
    return () => source.close();
  }, []);

  const subscribe = useCallback((listener: AuctionUpdateListener) => {
    listeners.current.add(listener);
    return () => { listeners.current.delete(listener); };
  }, []);
  const value = useMemo(() => ({ subscribe }), [subscribe]);

  return <AuctionRealtimeContext.Provider value={value}>{children}</AuctionRealtimeContext.Provider>;
}

export function useAuctionRealtime() {
  return useContext(AuctionRealtimeContext);
}
