import { useEffect, useRef, useState } from "react";
import { cleanupDemoAuctions, createDemoAuctions, getDemoAuctionStatus, previewDemoAuctions, previewDemoCleanup, resetDemoAuctions, type DemoAuctionPreview, type DemoAuctionStatus, type DemoCleanupPreview } from "../../api/admin";
import { formatLocalDateTime } from "../../utils/format";
import { ErrorState, LoadingState } from "../../components/AsyncStates";

const confirmations = { create: "DEMO AUKCIÓK LÉTREHOZÁSA", reset: "DEMO AUKCIÓK ÚJRAGENERÁLÁSA", cleanup: "DEMO AUKCIÓK TÖRLÉSE" } as const;
type Action = keyof typeof confirmations;
const statusLabels: Record<string, string> = { none: "Nincs batch", creating: "Létrehozás folyamatban", active: "Aktív", deleting: "Törlés folyamatban", deleted: "Törölve", failed: "Hibás" };

export function AdminDemoAuctionsPage() {
  const [status, setStatus] = useState<DemoAuctionStatus | null>(null);
  const [preview, setPreview] = useState<DemoAuctionPreview | null>(null);
  const [cleanupPreview, setCleanupPreview] = useState<DemoCleanupPreview | null>(null);
  const [regular, setRegular] = useState(80); const [featured, setFeatured] = useState(20);
  const [busy, setBusy] = useState(false); const [loading, setLoading] = useState(true);
  const [error, setError] = useState(""); const [message, setMessage] = useState("");
  const [action, setAction] = useState<Action | null>(null); const [confirmation, setConfirmation] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLElement>(null); const openerRef = useRef<HTMLElement | null>(null);
  const load = async () => { setLoading(true); setError(""); try { setStatus(await getDemoAuctionStatus()); } catch (reason) { setError(reason instanceof Error ? reason.message : "A demóaukciók állapota nem tölthető be."); } finally { setLoading(false); } };
  useEffect(() => { void load(); }, []);
  useEffect(() => { if (!action) return; inputRef.current?.focus(); const previous = document.body.style.overflow; document.body.style.overflow = "hidden"; return () => { document.body.style.overflow = previous; openerRef.current?.focus(); }; }, [action]);
  const openDialog = (next: Action) => { openerRef.current = document.activeElement as HTMLElement | null; setConfirmation(""); setAction(next); };
  const closeDialog = () => { if (!busy) setAction(null); };
  const trapKeys = (event: React.KeyboardEvent<HTMLElement>) => { if (event.key === "Escape") { event.preventDefault(); closeDialog(); return; } if (event.key !== "Tab") return; const items = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('input,button:not([disabled])') ?? []); if (!items.length) return; const first = items[0], last = items[items.length - 1]; if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); } };
  const showPreview = async () => { setBusy(true); setError(""); try { setPreview(await previewDemoAuctions(regular, featured)); setCleanupPreview(null); } catch (reason) { setError(reason instanceof Error ? reason.message : "Az előnézet nem készíthető el."); } finally { setBusy(false); } };
  const showCleanupPreview = async () => { setBusy(true); setError(""); try { setCleanupPreview(await previewDemoCleanup(status?.batch_key)); setPreview(null); } catch (reason) { setError(reason instanceof Error ? reason.message : "A törlési előnézet nem készíthető el."); } finally { setBusy(false); } };
  const execute = async () => {
    if (!action || confirmation !== confirmations[action]) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const result = action === "create" ? await createDemoAuctions(regular, featured, confirmation) : action === "reset" ? await resetDemoAuctions(regular, featured, confirmation) : await cleanupDemoAuctions(status?.batch_key ?? null, confirmation);
      setMessage(action === "cleanup" ? `A demóadatok törölve (${result.deleted_records} rekord).` : `A demóbatch elkészült: ${result.batch_key}.`);
      setAction(null); setConfirmation(""); setPreview(null); setCleanupPreview(null); await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "A művelet nem sikerült."); } finally { setBusy(false); }
  };
  return <section className="admin-page" aria-labelledby="demo-auctions-title">
    <div className="section-heading page-heading"><div><p className="eyebrow">Admin</p><h1 id="demo-auctions-title">Demóaukciók</h1><p className="section-note">Productionben elkülönített, kizárólag tesztelőknek látható demóadatok.</p></div></div>
    {loading ? <LoadingState label="Demóaukciók állapotának betöltése" /> : null}{error ? <ErrorState message={error} onRetry={() => void load()} /> : null}{message ? <p className="form-message" role="status">{message}</p> : null}
    {status ? <article className="side-panel demo-status-card"><h2>Aktuális állapot</h2><dl className="admin-user-meta"><div><dt>Batch</dt><dd>{status.batch_key ?? "Nincs"}</dd></div><div><dt>Állapot</dt><dd>{statusLabels[status.status] ?? "Ismeretlen"}</dd></div><div><dt>Normál / kiemelt / összes</dt><dd>{status.regular_count} / {status.featured_count} / {status.total_auctions}</dd></div><div><dt>Képek / médiaváltozatok</dt><dd>{status.image_count} / {status.media_variant_count}</dd></div><div><dt>Licitek / demófelhasználók</dt><dd>{status.bid_count} / {status.demo_user_count}</dd></div><div><dt>Létrehozás</dt><dd>{status.created_at ? formatLocalDateTime(status.created_at) : "Nincs"}</dd></div><div><dt>Létrehozó admin</dt><dd>{status.created_by_admin ?? "Operátori CLI"}</dd></div>{status.error_message ? <div><dt>Hiba</dt><dd>{status.error_message}</dd></div> : null}</dl></article> : null}
    <article className="side-panel demo-controls"><h2>Generálás</h2><div className="demo-count-fields"><label>Normál aukciók száma<input type="number" min={0} max={500} value={regular} onChange={(e) => setRegular(Number(e.target.value))} disabled={busy} /></label><label>Kiemelt aukciók száma<input type="number" min={0} max={500} value={featured} onChange={(e) => setFeatured(Number(e.target.value))} disabled={busy} /></label></div><div className="form-actions"><button className="button button-secondary" disabled={busy} onClick={() => void showPreview()}>Előnézet</button><button className="button button-primary" disabled={busy || status?.status === "active"} onClick={() => openDialog("create")}>Demóaukciók létrehozása</button><button className="button button-secondary" disabled={busy || status?.status !== "active"} onClick={() => openDialog("reset")}>Újragenerálás</button><button className="button button-secondary" disabled={busy || status?.status !== "active"} onClick={() => void showCleanupPreview()}>Törlési előnézet</button><button className="button button-danger" disabled={busy || status?.status !== "active"} onClick={() => openDialog("cleanup")}>Demóadatok törlése</button></div>{busy ? <p role="status">Művelet folyamatban…</p> : null}</article>
    {preview ? <article className="side-panel"><h2>Létrehozási előnézet</h2><p>{preview.regular_count} normál + {preview.featured_count} kiemelt = {preview.total_auctions} aukció, {preview.image_count} kép ({preview.media_variant_count} fájl), várhatóan {preview.expected_bid_count} licit és {preview.demo_user_count} demófelhasználó.</p><p>Kategóriák: {preview.categories.join(", ")}. Villámáras: {preview.buy_now_count}; 5 perces védelem: {preview.five_minute_rule_count}.</p></article> : null}
    {cleanupPreview ? <article className="side-panel"><h2>Törlési előnézet</h2><p>Batch: {cleanupPreview.batch_key}. Törlendő: {cleanupPreview.auctions} aukció, {cleanupPreview.media_files} médiafájl, {cleanupPreview.bids} licit, {cleanupPreview.watchlist_items} figyelés, {cleanupPreview.notifications} értesítés és {cleanupPreview.demo_users} demófelhasználó.</p></article> : null}
    {action ? <div className="dialog-backdrop" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) closeDialog(); }}><section ref={dialogRef} className="side-panel report-dialog" role="dialog" aria-modal="true" aria-labelledby="demo-confirm-title" onKeyDown={trapKeys}><h2 id="demo-confirm-title">Megerősítés szükséges</h2><p>A folytatáshoz írd be pontosan:</p><strong>{confirmations[action]}</strong><label htmlFor="demo-confirmation">Megerősítő szöveg</label><input ref={inputRef} id="demo-confirmation" value={confirmation} onChange={(e) => setConfirmation(e.target.value)} autoComplete="off" /><div className="form-actions"><button className="button button-secondary" disabled={busy} onClick={closeDialog}>Mégse</button><button className={action === "cleanup" ? "button button-danger" : "button button-primary"} disabled={busy || confirmation !== confirmations[action]} onClick={() => void execute()}>Megerősítés</button></div></section></div> : null}
  </section>;
}
