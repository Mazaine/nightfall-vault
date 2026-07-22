import { useEffect, useMemo, useState } from "react";
import { formatRemainingTime } from "../utils/format";

const FIVE_MINUTES_MS = 5 * 60 * 1000;
const CLOSED_STATUSES = ["ended", "sold", "unsold", "cancelled", "suspended"];

type AuctionCountdownProps = {
  endsAt: string;
  status: string;
  fiveMinuteRuleEnabled?: boolean;
  className?: string;
  fallback?: string;
};

export function AuctionCountdown({ endsAt, status, fiveMinuteRuleEnabled = false, className = "", fallback }: AuctionCountdownProps) {
  const [now, setNow] = useState(() => Date.now());
  const endTime = useMemo(() => new Date(endsAt).getTime(), [endsAt]);
  const remainingMs = endTime - now;
  const isClosed = CLOSED_STATUSES.includes(status);
  const isProtectedWindow = status === "active" && fiveMinuteRuleEnabled && remainingMs > 0 && remainingMs <= FIVE_MINUTES_MS;

  useEffect(() => {
    if (isClosed || !Number.isFinite(endTime) || remainingMs <= 0) return;
    const delay = isProtectedWindow
      ? Math.max(100, 1000 - (Date.now() % 1000))
      : Math.max(100, Math.min(60_000, remainingMs - FIVE_MINUTES_MS));
    const timer = window.setTimeout(() => setNow(Date.now()), delay);
    return () => window.clearTimeout(timer);
  }, [endTime, isClosed, isProtectedWindow, now, remainingMs]);

  const regularText = remainingMs <= 0 ? "Lejárt" : fallback ?? formatRemainingTime(endsAt, status);
  if (!isProtectedWindow) {
    return <time className={`auction-countdown ${className}`.trim()} dateTime={endsAt}>{regularText}</time>;
  }

  const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const clock = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  return (
    <time className={`auction-countdown auction-countdown-urgent ${className}`.trim()} dateTime={endsAt} role="timer" aria-label={`Az ötperces licitvédelemből ${minutes} perc ${seconds} másodperc van hátra. Új licitnél a számláló ismét öt percről indul.`}>
      <span>5 perces licitvédelem</span>
      <strong>{clock}</strong>
    </time>
  );
}
