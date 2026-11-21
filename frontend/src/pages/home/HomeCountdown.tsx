import { useEffect, useState } from "react";

export function HomeCountdown({ endsAt, status, compact = false }: { endsAt: string; status: string; compact?: boolean }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (status !== "active") return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [status]);

  if (status !== "active") return <span className="nv-clock-pending">Hamarosan indul</span>;
  const remaining = Math.max(0, new Date(endsAt).getTime() - now);
  if (remaining <= 0) return <span className="nv-clock-pending">Lejárt</span>;
  const seconds = Math.floor(remaining / 1000);
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  const urgency = remaining <= 15 * 60_000 ? "is-urgent" : remaining <= 60 * 60_000 ? "is-soon" : "";
  if (compact) {
    const value = days
      ? `${days} nap ${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`
      : `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
    return <time className={`nv-clock-compact ${urgency}`} dateTime={endsAt} aria-label={`Hátralévő idő: ${days} nap, ${hours} óra, ${minutes} perc, ${secs} másodperc`}><span aria-hidden="true">◷</span> {value}</time>;
  }
  const items = days ? [[String(days), "NAP"], [String(hours).padStart(2, "0"), "ÓRA"], [String(minutes).padStart(2, "0"), "PERC"]] : [[String(hours).padStart(2, "0"), "ÓRA"], [String(minutes).padStart(2, "0"), "PERC"], [String(secs).padStart(2, "0"), "MP"]];
  return <time className={`nv-clock ${urgency} ${compact ? "is-compact" : ""}`} dateTime={endsAt} aria-label={`Hátralévő idő: ${days} nap, ${hours} óra, ${minutes} perc, ${secs} másodperc`}>
    {items.map(([value, label]) => <span className="nv-clock-unit" key={label}><strong>{value}</strong><small>{label}</small></span>)}
  </time>;
}
