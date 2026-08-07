import { createContext, useCallback, useContext, useEffect, useMemo, useRef, type ReactNode } from "react";
import { auctionListStreamUrl, type AuctionRealtimeSnapshot } from "./api/auctions";
import { getStoredToken } from "./api/client";
import { useAuth } from "./AuthContext";

type AuctionUpdateListener = (snapshot: AuctionRealtimeSnapshot) => void;
type AuctionRealtimeContextValue = { subscribe: (listener: AuctionUpdateListener) => () => void };

const EMPTY_CONTEXT: AuctionRealtimeContextValue = { subscribe: () => () => undefined };
const AuctionRealtimeContext = createContext<AuctionRealtimeContextValue>(EMPTY_CONTEXT);

export function AuctionRealtimeProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated, user } = useAuth();
  const listeners = useRef(new Set<AuctionUpdateListener>());

  useEffect(() => {
    let stopped = false;
    let controller: AbortController | null = null;
    let retryMs = 1000;
    const eventStorageKey = `nightfall:last-auction-event:${user?.id ?? "anonymous"}`;

    const connect = async () => {
      while (!stopped) {
        controller = new AbortController();
        try {
          const headers = new Headers({ Accept: "text/event-stream" });
          const token = getStoredToken();
          if (token) headers.set("Authorization", `Bearer ${token}`);
          const lastId = sessionStorage.getItem(eventStorageKey);
          if (lastId) headers.set("Last-Event-ID", lastId);
          const response = await fetch(auctionListStreamUrl(), { headers, credentials: "include", cache: "no-store", signal: controller.signal });
          if (!response.ok || !response.body) throw new Error("Az aukciós realtime kapcsolat nem érhető el.");
          retryMs = 1000;
          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let buffer = "";
          while (!stopped) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n");
            let boundary = buffer.indexOf("\n\n");
            while (boundary >= 0) {
              const block = buffer.slice(0, boundary);
              buffer = buffer.slice(boundary + 2);
              boundary = buffer.indexOf("\n\n");
              const id = block.split("\n").find((line) => line.startsWith("id:"))?.slice(3).trim();
              const type = block.split("\n").find((line) => line.startsWith("event:"))?.slice(6).trim();
              const data = block.split("\n").filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trim()).join("\n");
              if (id) sessionStorage.setItem(eventStorageKey, id);
              if (type !== "auction_update" || !data) continue;
              try {
                const snapshot = JSON.parse(data) as AuctionRealtimeSnapshot;
                listeners.current.forEach((listener) => listener(snapshot));
              } catch {
                // Egy hibás esemény nem szakíthatja meg a streamet.
              }
            }
          }
        } catch (error) {
          if (stopped || (error instanceof DOMException && error.name === "AbortError")) break;
        }
        if (!stopped) {
          await new Promise((resolve) => window.setTimeout(resolve, retryMs));
          retryMs = Math.min(retryMs * 2, 15000);
        }
      }
    };
    void connect();
    return () => { stopped = true; controller?.abort(); };
  }, [isAuthenticated, user?.id]);

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
