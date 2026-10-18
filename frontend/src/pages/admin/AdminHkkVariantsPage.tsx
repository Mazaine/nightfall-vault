import { ChangeEvent, useEffect, useState } from "react";
import { getHkkVariantSummary, importManualHkkVariants, importOfficialHkkVariants, type HkkVariantSummary } from "../../api/admin";

const CSV_COLUMNS = ["external_card_id", "card_name", "edition_id", "edition_name", "variant", "status", "image_url", "source_url"];

function parseCsv(text: string): Record<string, string | null>[] {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim());
  if (!lines.length) return [];
  const parseLine = (line: string) => {
    const cells: string[] = []; let value = ""; let quoted = false;
    for (let index = 0; index < line.length; index += 1) {
      const char = line[index];
      if (char === '"' && quoted && line[index + 1] === '"') { value += '"'; index += 1; }
      else if (char === '"') quoted = !quoted;
      else if (char === "," && !quoted) { cells.push(value.trim()); value = ""; }
      else value += char;
    }
    cells.push(value.trim()); return cells;
  };
  const headers = parseLine(lines[0]);
  if (CSV_COLUMNS.some((column) => !headers.includes(column))) throw new Error(`Hiányzó CSV-oszlop. Kötelező: ${CSV_COLUMNS.join(", ")}`);
  return lines.slice(1).map((line) => Object.fromEntries(headers.map((header, index) => [header, parseLine(line)[index] || null])));
}

export function AdminHkkVariantsPage() {
  const [summary, setSummary] = useState<HkkVariantSummary | null>(null);
  const [editionId, setEditionId] = useState(""); const [editionName, setEditionName] = useState("");
  const [rows, setRows] = useState<Record<string, string | null>[]>([]); const [result, setResult] = useState(""); const [busy, setBusy] = useState(false);
  const load = () => getHkkVariantSummary().then(setSummary).catch((error) => setResult(error instanceof Error ? error.message : "Nem sikerült betölteni az adatokat."));
  useEffect(() => { void load(); }, []);
  async function official(dry_run: boolean) { setBusy(true); try { const data = await importOfficialHkkVariants({ edition_id: editionId, edition_name: editionName, dry_run }); setResult(JSON.stringify(data, null, 2)); if (!dry_run) await load(); } catch (error) { setResult(error instanceof Error ? error.message : "Az import sikertelen."); } finally { setBusy(false); } }
  async function manual(dry_run: boolean) { setBusy(true); try { const data = await importManualHkkVariants({ rows, dry_run }); setResult(JSON.stringify(data, null, 2)); if (!dry_run) await load(); } catch (error) { setResult(error instanceof Error ? error.message : "A CSV-import sikertelen."); } finally { setBusy(false); } }
  async function readCsv(event: ChangeEvent<HTMLInputElement>) { const file = event.target.files?.[0]; if (!file) return; try { const parsed = parseCsv(await file.text()); setRows(parsed); setResult(`${file.name}: ${parsed.length} sor beolvasva.`); } catch (error) { setRows([]); setResult(error instanceof Error ? error.message : "Hibás CSV."); } }
  return <section className="admin-page"><header><p className="eyebrow">Admin</p><h1>HKK-lapváltozatok hitelesítése</h1><p>A hivatalos import előnézhető. A kézzel ellenőrzött CSV-sorokat az automatikus import nem írja felül.</p></header>
    {summary ? <div className="admin-stat-grid"><article><strong>{summary.checked_editions}</strong><span>ellenőrzött kiadás</span></article><article><strong>{summary.checked_cards}</strong><span>ellenőrzött lap</span></article><article><strong>{summary.unknown_rows}</strong><span>ismeretlen státusz</span></article><article><strong>{summary.review_conflicts.length}</strong><span>felülvizsgálandó rekord</span></article></div> : null}
    <section className="panel"><h2>Hivatalos kiadásimport</h2><div className="vault-inline-form"><label>Kiadás ID<input value={editionId} onChange={(event) => setEditionId(event.target.value)} pattern="[1-9][0-9]*"/></label><label>Kiadás neve<input value={editionName} onChange={(event) => setEditionName(event.target.value)}/></label><button className="button button-secondary" disabled={busy || !editionId || !editionName} onClick={() => void official(true)}>Előnézet</button><button className="button button-primary" disabled={busy || !editionId || !editionName} onClick={() => void official(false)}>Importálás</button></div></section>
    <section className="panel"><h2>Kézzel ellenőrzött CSV</h2><p><code>{CSV_COLUMNS.join(",")}</code></p><input aria-label="HKK-változat CSV" type="file" accept=".csv,text/csv" onChange={(event) => void readCsv(event)}/><div className="vault-card-actions"><button className="button button-secondary" disabled={busy || !rows.length} onClick={() => void manual(true)}>CSV előnézet</button><button className="button button-primary" disabled={busy || !rows.length} onClick={() => void manual(false)}>Hitelesített CSV alkalmazása</button></div></section>
    {summary?.review_conflicts.length ? <section className="panel"><h2>Felülvizsgálandó korábbi adatok</h2>{summary.review_conflicts.map((item) => <p key={`${item.source}-${item.record_id}`}><strong>{item.card_name}</strong> · HKK #{item.external_card_id} · {item.variant.toUpperCase()} · {item.quantity} db · felhasználó #{item.user_id}</p>)}</section> : null}
    {result ? <pre className="admin-json-result">{result}</pre> : null}
  </section>;
}
