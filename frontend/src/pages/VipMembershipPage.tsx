import { FormEvent, useEffect, useState } from "react";
import { activateVipCode, getVipStatus, type VipStatus } from "../api/membership";
import { useAuth } from "../AuthContext";
import { ErrorState, LoadingState } from "../components/AsyncStates";

function formatExpiry(value: string | null) {
  return value ? new Intl.DateTimeFormat("hu-HU", { dateStyle: "long", timeStyle: "short" }).format(new Date(value)) : "Nincs aktív VIP-tagság";
}

export function VipMembershipPage() {
  const { refreshMe } = useAuth();
  const [status, setStatus] = useState<VipStatus | null>(null);
  const [code, setCode] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);

  const load = async () => {
    setLoading(true);
    setMessage("");
    try { setStatus(await getVipStatus()); }
    catch (error) { setMessage(error instanceof Error ? error.message : "A VIP-adatok betöltése nem sikerült."); }
    finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, []);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setMessage("");
    try {
      const result = await activateVipCode(code);
      setStatus(result);
      setCode("");
      setMessage(result.message ?? "A VIP-tagság sikeresen aktiválva lett.");
      await refreshMe();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "A VIP-kód aktiválása nem sikerült.");
    } finally { setPending(false); }
  };

  if (loading) return <LoadingState label="VIP-tagság betöltése" />;
  if (!status) return <ErrorState message={message || "A VIP-adatok nem érhetők el."} onRetry={() => void load()} />;

  return (
    <section className="vip-membership-page" aria-labelledby="vip-title">
      <p className="eyebrow">Nightfall Vault VIP</p>
      <h1 id="vip-title">Lépj a gyűjtők legendái közé</h1>
      <div className={`vip-status-card${status.is_vip ? " is-active" : ""}`}>
        <div>
          <span className="status-badge">{status.is_vip ? "Aktív VIP" : "Normál tagság"}</span>
          <h2>{status.is_vip ? "A kiemelésed aktív" : "Versenydíjként kapott kódod van?"}</h2>
          <p>{status.is_vip ? `Érvényes eddig: ${formatExpiry(status.vip_expires_at)}` : `Egyszerre ${status.active_auction_limit} saját aktív vagy időzített aukciód lehet.`}</p>
        </div>
        <ul>
          <li>Korlátlan számú saját aktív és időzített aukció</li>
          <li>VIP-kiemelés az aukciólistákon</li>
          <li>A licitálás normál tagsággal is korlátlan</li>
        </ul>
      </div>
      <form className="form-panel vip-activation-form" onSubmit={submit}>
        <label htmlFor="vip-code">12 karakteres VIP-kód</label>
        <input id="vip-code" value={code} onChange={(event) => setCode(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12))} inputMode="text" autoCapitalize="characters" autoComplete="one-time-code" pattern="[A-Z0-9]{12}" minLength={12} maxLength={12} placeholder="A7KM2P9R4XQ8" required />
        <button className="button button-primary" disabled={pending || code.length !== 12} type="submit">{pending ? "Aktiválás..." : "VIP-tagság aktiválása"}</button>
        {message ? <p className="form-message" role="status" aria-live="polite">{message}</p> : null}
      </form>
      <p className="muted-text">A VIP-kódok nem vásárolhatók meg: partneri kártyaversenyek nyereményalapjában jelennek meg.</p>
    </section>
  );
}
