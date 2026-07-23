import { FormEvent, useEffect, useState } from "react";
import { generateVipCodes, getAdminVipCodes, type VipCodeAdminItem, type VipCodeBatch } from "../../api/membership";

const quantities = [10, 50, 100, 150, 200, 500] as const;

function grouped(code: string) { return code.replace(/(.{4})(?=.)/g, "$1 "); }

function formatDate(value: string | null) {
  return value ? new Intl.DateTimeFormat("hu-HU", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "—";
}

function saveCsv(rows: string[], filename: string) {
  const url = URL.createObjectURL(new Blob(["\ufeff", rows.join("\r\n")], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function downloadCsv(batch: VipCodeBatch) {
  saveCsv(
    ["kod;idotartam_honap;batch_azonosito;generalva", ...batch.codes.map((item) => `${item.code};${item.duration_months};${batch.batch_id};${batch.created_at}`)],
    `nightfall-vip-${batch.duration_months}ho-${batch.batch_id}.csv`,
  );
}

function downloadArchivedCsv(items: VipCodeAdminItem[], filename: string) {
  saveCsv(
    ["kod;idotartam_honap;batch_azonosito;generalva", ...items.filter((item) => item.code).map((item) => `${item.code};${item.duration_months};${item.batch_id};${item.created_at}`)],
    filename,
  );
}

export function AdminVipCodesPage() {
  const [quantity, setQuantity] = useState<(typeof quantities)[number]>(10);
  const [duration, setDuration] = useState<1 | 3>(1);
  const [codes, setCodes] = useState<VipCodeAdminItem[]>([]);
  const [pending, setPending] = useState(false);
  const [loadingCodes, setLoadingCodes] = useState(true);
  const [message, setMessage] = useState("");

  const loadCodes = async () => {
    setLoadingCodes(true);
    try { setCodes(await getAdminVipCodes()); }
    catch (error) { setMessage(error instanceof Error ? error.message : "A korábbi VIP-kódok betöltése nem sikerült."); }
    finally { setLoadingCodes(false); }
  };

  useEffect(() => { void loadCodes(); }, []);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setMessage("");
    try {
      const result = await generateVipCodes(quantity, duration);
      downloadCsv(result);
      setMessage(`${result.quantity} egyedi VIP-kód elkészült, a CSV mentése elindult.`);
      await loadCodes();
    } catch (error) { setMessage(error instanceof Error ? error.message : "A kódgenerálás nem sikerült."); }
    finally { setPending(false); }
  };

  const availablePrintable = codes.filter((item) => item.code && !item.redeemed_at);

  return (
    <section className="admin-page vip-code-admin" aria-labelledby="vip-code-title">
      <div><p className="eyebrow">Versenydíjak</p><h1 id="vip-code-title">VIP-kódgenerátor</h1><p>A nyomdai kártyasablon külön, kétoldalas PDF. Itt a kódokat tartalmazó CSV készül el a nyomdai adatösszefésüléshez.</p></div>
      <form className="form-panel vip-generator-form" onSubmit={submit}>
        <label htmlFor="vip-duration">Tagság időtartama</label>
        <select id="vip-duration" value={duration} onChange={(event) => setDuration(Number(event.target.value) as 1 | 3)}><option value={1}>1 hónap</option><option value={3}>3 hónap</option></select>
        <label htmlFor="vip-quantity">Kódok száma</label>
        <select id="vip-quantity" value={quantity} onChange={(event) => setQuantity(Number(event.target.value) as (typeof quantities)[number])}>{quantities.map((value) => <option key={value} value={value}>{value} darab</option>)}</select>
        <button className="button button-primary" type="submit" disabled={pending}>{pending ? "Generálás..." : "Kódok generálása és CSV mentése"}</button>
        {message ? <p className="form-message" role="status" aria-live="polite">{message}</p> : null}
      </form>

      <section className="vip-code-archive" aria-labelledby="vip-code-archive-title">
        <div><p className="eyebrow">Kódnyilvántartás</p><h2 id="vip-code-archive-title">Meglévő VIP-kódok</h2><p>A teljesen archivált, felhasználható kódok CSV-je újra letölthető. A beváltott kódokat az export kihagyja.</p></div>
        <div className="vip-batch-actions"><button className="button button-primary" type="button" onClick={() => downloadArchivedCsv(availablePrintable, "nightfall-vip-felhasznalhato-kodok.csv")} disabled={!availablePrintable.length}>Felhasználható kódok CSV mentése</button></div>
        {loadingCodes ? <p>VIP-kódok betöltése…</p> : codes.length ? <div className="admin-table-panel"><table className="admin-table vip-code-table"><thead><tr><th>Kód</th><th>Időtartam</th><th>Állapot</th><th>Generálva</th><th>Felhasználó</th><th>Batch</th><th>Művelet</th></tr></thead><tbody>
          {codes.map((item) => <tr key={item.id}><td><code>{item.code ? grouped(item.code) : item.masked_code}</code></td><td>{item.duration_months} hónap</td><td><span className={`status-badge${item.redeemed_at ? " is-muted" : " is-success"}`}>{item.redeemed_at ? "Felhasználva" : "Felhasználható"}</span>{item.redeemed_at ? <small>{formatDate(item.redeemed_at)}</small> : null}</td><td>{formatDate(item.created_at)}</td><td>{item.redeemed_by_username ? `@${item.redeemed_by_username}` : "—"}</td><td><code>{item.batch_id.slice(0, 8)}</code></td><td><button className="button button-secondary" type="button" onClick={() => downloadArchivedCsv(codes.filter((code) => code.batch_id === item.batch_id && code.code && !code.redeemed_at), `nightfall-vip-batch-${item.batch_id}.csv`)} disabled={!item.code}>Batch CSV</button></td></tr>)}
        </tbody></table></div> : <p className="empty-state">Még nincs generált VIP-kód.</p>}
      </section>
    </section>
  );
}
