import { FormEvent, useCallback, useEffect, useState } from "react";
import { ApiError } from "../api/client";
import * as vaultApi from "../api/vault";
import type { HkkCard, PublicTradeCard, VaultCard, VaultCardLoan, VaultSummary, VaultTrade } from "../api/vault";
import { formatHkkRarity, hkkCardImageUrl } from "../utils/hkk";

type Tab = "collection" | "trade" | "wanted" | "matches" | "loans" | "points";
type AddMode = "card" | "edition";
type SortKey = "card_name" | "edition" | "card_type" | "subtype" | "color" | "rarity" | "external_card_id";
type SortDirection = "asc" | "desc";
const LAST_FOLDER_KEY = "nightfall-vault-last-folder";
const collator = new Intl.Collator("hu-HU", { numeric: true, sensitivity: "base" });
const RARITY_OPTIONS: { value: vaultApi.HkkRarity; label: string }[] = [
  { value: "common", label: "Gyakori" },
  { value: "uncommun", label: "Nem gyakori" },
  { value: "rare", label: "Ritka" },
  { value: "ultrarare", label: "Ultraritka" },
];
const PRINT_VARIANTS: { value: vaultApi.PrintVariant; label: string }[] = [
  { value: "normal", label: "Normál" },
  { value: "foil", label: "Foil" },
  { value: "fa", label: "FA – Full Art" },
  { value: "gfa", label: "GFA – Golden Full Art" },
];

function compareCards(left: VaultCard, right: VaultCard, sortKey: SortKey, direction: SortDirection) {
  const leftValue = left[sortKey]?.toString().trim() || "";
  const rightValue = right[sortKey]?.toString().trim() || "";
  if (!leftValue && rightValue) return 1;
  if (leftValue && !rightValue) return -1;
  const primary = sortKey === "external_card_id"
    ? Number(leftValue) - Number(rightValue)
    : collator.compare(leftValue, rightValue);
  const result = primary || collator.compare(left.card_name, right.card_name) || left.id - right.id;
  return direction === "asc" ? result : -result;
}

function CardImage({ card }: { card: Pick<VaultCard, "external_card_id" | "card_name" | "image_url"> }) {
  const imageUrl = hkkCardImageUrl(card.external_card_id, card.image_url);
  return imageUrl ? <img src={imageUrl} alt="" loading="lazy" /> : <div className="vault-card-placeholder" aria-hidden="true">HKK</div>;
}

function CardMeta({ card }: { card: Pick<VaultCard, "edition" | "card_type" | "subtype" | "color" | "rarity"> }) {
  return <small>{[card.edition, card.card_type, card.subtype, card.color, formatHkkRarity(card.rarity)].filter(Boolean).join(" · ") || "HKK lap"}</small>;
}

function localIsoDate() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

export function VirtualVaultPage() {
  const [tab, setTab] = useState<Tab>("collection");
  const [summary, setSummary] = useState<VaultSummary | null>(null);
  const [cards, setCards] = useState<VaultCard[]>([]);
  const [tradeCards, setTradeCards] = useState<PublicTradeCard[]>([]);
  const [negotiations, setNegotiations] = useState<VaultTrade[]>([]);
  const [loans, setLoans] = useState<VaultCardLoan[]>([]);
  const [offers, setOffers] = useState<PublicTradeCard[]>([]);
  const [points, setPoints] = useState<vaultApi.PointHistory | null>(null);
  const [selectedFolder, setSelectedFolder] = useState<number | undefined>();
  const [filter, setFilter] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("card_name");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [search, setSearch] = useState("");
  const [searchEdition, setSearchEdition] = useState("");
  const [results, setResults] = useState<HkkCard[]>([]);
  const [resultVariants, setResultVariants] = useState<Record<string, vaultApi.PrintVariant>>({});
  const [addMode, setAddMode] = useState<AddMode>("card");
  const [editions, setEditions] = useState<vaultApi.HkkEdition[]>([]);
  const [selectedEdition, setSelectedEdition] = useState("");
  const [editionPreview, setEditionPreview] = useState<vaultApi.HkkEditionPreview | null>(null);
  const [editionQuantity, setEditionQuantity] = useState(1);
  const [selectedRarities, setSelectedRarities] = useState<vaultApi.HkkRarity[]>(RARITY_OPTIONS.map((option) => option.value));
  const [collectionEdition, setCollectionEdition] = useState("");
  const [collectionRarity, setCollectionRarity] = useState("");
  const [folderToDelete, setFolderToDelete] = useState<vaultApi.VaultFolder | null>(null);
  const [deleteTargetFolder, setDeleteTargetFolder] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const report = (error: unknown) => setMessage(error instanceof ApiError ? error.message : "A művelet nem sikerült.");
  const reload = useCallback(async () => {
    try {
      const [nextSummary, nextCards, nextTrade, nextNegotiations, nextPoints, nextLoans] = await Promise.all([
        vaultApi.getVaultSummary(), vaultApi.listVaultCards(), vaultApi.listTradeCards(), vaultApi.listNegotiations(), vaultApi.getPointHistory(), vaultApi.listCardLoans(),
      ]);
      setSummary(nextSummary); setCards(nextCards); setTradeCards(nextTrade); setNegotiations(nextNegotiations); setPoints(nextPoints); setLoans(nextLoans);
      setSelectedFolder((current) => {
        if (current || !nextSummary.folders.length) return current;
        const remembered = Number(localStorage.getItem(LAST_FOLDER_KEY));
        return nextSummary.folders.some((folder) => folder.id === remembered) ? remembered : nextSummary.folders[0].id;
      });
    } catch (error) { report(error); }
  }, []);

  useEffect(() => { void reload(); }, [reload]);
  useEffect(() => { void vaultApi.listHkkEditions().then(setEditions).catch((error) => report(error)); }, []);

  async function createFolder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget; const data = new FormData(form);
    try {
      setBusy(true);
      const created = await vaultApi.createVaultFolder({ name: String(data.get("name")), capacity: Number(data.get("capacity")), color: String(data.get("color")) || null });
      setSummary((current) => current ? { ...current, assigned_collection_capacity: current.assigned_collection_capacity + created.capacity, free_collection_capacity: Math.max(current.free_collection_capacity - created.capacity, 0), folders: [...current.folders, created] } : current);
      setSelectedFolder(created.id); localStorage.setItem(LAST_FOLDER_KEY, String(created.id)); setMessage(`${created.name} létrehozva.`); form.reset();
    }
    catch (error) { report(error); } finally { setBusy(false); }
  }

  async function runSearch(event: FormEvent) {
    event.preventDefault();
    if (!searchEdition && search.trim().length < 2) { setMessage("Adj meg legalább két karaktert vagy válassz kiegészítőt."); return; }
    if (search.trim() && search.trim().length < 2) { setMessage("A keresőkifejezés legalább két karakter legyen."); return; }
    try { setBusy(true); setResults(await vaultApi.searchHkk(search.trim(), searchEdition || undefined)); setMessage(""); }
    catch (error) { report(error); } finally { setBusy(false); }
  }

  async function selectAddMode(mode: AddMode) {
    setAddMode(mode); setMessage("");
  }

  async function chooseEdition(editionId: string) {
    setSelectedEdition(editionId); setEditionPreview(null); setMessage("");
    if (!editionId) return;
    try { setBusy(true); setEditionPreview(await vaultApi.previewHkkEdition(editionId)); }
    catch (error) { report(error); } finally { setBusy(false); }
  }

  async function importEdition(missingOnly: boolean) {
    if (!selectedEdition || !selectedFolder) { setMessage("Válassz kiegészítőt és cél-almappát."); return; }
    if (!selectedRarities.length) { setMessage("Válassz legalább egy gyakoriságot."); return; }
    try {
      setBusy(true);
      const result = await vaultApi.importHkkEdition({ edition_id: selectedEdition, folder_id: selectedFolder, quantity: editionQuantity, missing_only: missingOnly, rarities: selectedRarities });
      setMessage(`${result.edition.name}: ${result.added_cards} új, ${result.updated_cards} frissített, ${result.skipped_cards} kihagyott lap.`);
      localStorage.setItem(LAST_FOLDER_KEY, String(selectedFolder));
      await reload();
    } catch (error) { report(error); } finally { setBusy(false); }
  }

  async function addResult(card: HkkCard, target: "collection" | "trade") {
    if (target === "collection" && !selectedFolder) { setMessage("Előbb hozz létre és válassz ki egy almappát."); return; }
    const raw = window.prompt("Példányszám (1–3)", "1"); if (raw === null) return;
    const quantity = Number(raw); if (![1, 2, 3].includes(quantity)) { setMessage("A példányszám 1, 2 vagy 3 lehet."); return; }
    try {
      setBusy(true);
      const variant = resultVariants[card.external_card_id] || "normal";
      if (target === "collection") { await vaultApi.addVaultCard(card, selectedFolder!, quantity, variant); localStorage.setItem(LAST_FOLDER_KEY, String(selectedFolder)); }
      else await vaultApi.addTradeCard(card, quantity, variant);
      setMessage(`${card.card_name} elmentve.`); await reload();
    } catch (error) { report(error); } finally { setBusy(false); }
  }

  async function addWantedResult(card: HkkCard) {
    if (!selectedFolder) { setMessage("Előbb hozz létre és válassz ki egy almappát."); return; }
    try {
      setBusy(true);
      await vaultApi.addWantedCard(card, selectedFolder, resultVariants[card.external_card_id] || "normal");
      setMessage(`${card.card_name} felkerült a Keresem listára.`);
      localStorage.setItem(LAST_FOLDER_KEY, String(selectedFolder));
      await reload();
    } catch (error) { report(error); } finally { setBusy(false); }
  }

  async function toggleWanted(card: VaultCard) {
    try { setBusy(true); await vaultApi.setVaultWanted(card.id, !card.wanted, card.wanted ? undefined : 3 - card.quantity); await reload(); }
    catch (error) { report(error); } finally { setBusy(false); }
  }

  async function moveCard(card: VaultCard, folderId: number) {
    try { setBusy(true); await vaultApi.updateVaultCard(card.id, { folder_id: folderId }); await reload(); }
    catch (error) { report(error); } finally { setBusy(false); }
  }

  async function editFolder(folder: vaultApi.VaultFolder) {
    const name = window.prompt("Mappa neve", folder.name); if (name === null) return;
    const capacityRaw = window.prompt("Kiosztott zsebek", String(folder.capacity)); if (capacityRaw === null) return;
    const capacity = Number(capacityRaw); if (!Number.isInteger(capacity) || capacity < folder.used_slots) { setMessage("A kapacitás nem lehet kisebb a használt zsebek számánál."); return; }
    try { setBusy(true); await vaultApi.updateVaultFolder(folder.id, { name, capacity }); await reload(); } catch (error) { report(error); } finally { setBusy(false); }
  }

  function removeFolder(folder: vaultApi.VaultFolder) {
    if (!summary) return;
    const firstTarget = summary.folders.find((item) => item.id !== folder.id);
    setDeleteTargetFolder(firstTarget ? String(firstTarget.id) : "");
    setFolderToDelete(folder);
  }

  async function confirmFolderDelete(deleteContents: boolean) {
    if (!summary || !folderToDelete) return;
    const folder = folderToDelete;
    const target = summary.folders.find((item) => item.id === Number(deleteTargetFolder));
    if (!deleteContents && folder.used_slots > 0 && !target) { setMessage("Válassz célmappát az áthelyezéshez."); return; }
    if (deleteContents && folder.used_slots > 0) {
      const confirmation = window.prompt(`A(z) „${folder.name}” mappa és ${folder.used_slots} lapbejegyzés végleg törlődik. A kölcsönzési előzmények megmaradnak. A megerősítéshez írd be a mappa nevét:`, "");
      if (confirmation !== folder.name) { if (confirmation !== null) setMessage("A mappanév nem egyezik, a törlés elmaradt."); return; }
    }
    try {
      setBusy(true); await vaultApi.deleteVaultFolder(folder.id, { moveToFolderId: deleteContents ? undefined : target?.id, deleteContents });
      setCards((current) => target ? current.map((card) => card.folder_id === folder.id ? { ...card, folder_id: target!.id } : card) : current);
      setSummary((current) => current ? { ...current, assigned_collection_capacity: target ? current.assigned_collection_capacity : current.assigned_collection_capacity - folder.capacity, free_collection_capacity: target ? current.free_collection_capacity : current.free_collection_capacity + folder.capacity, folders: current.folders.filter((item) => item.id !== folder.id).map((item) => item.id === target?.id ? { ...item, capacity: item.capacity + folder.capacity, used_slots: item.used_slots + folder.used_slots } : item) } : current);
      const nextFolderId = target?.id ?? summary.folders.find((item) => item.id !== folder.id)?.id; setSelectedFolder(nextFolderId); if (nextFolderId) localStorage.setItem(LAST_FOLDER_KEY, String(nextFolderId)); else localStorage.removeItem(LAST_FOLDER_KEY); setFolderToDelete(null); setMessage(`${folder.name} törölve.`);
    } catch (error) { report(error); } finally { setBusy(false); }
  }

  async function lendCard(card: VaultCard) {
    const borrowerName = window.prompt("Kinek adtad kölcsön?", ""); if (!borrowerName?.trim()) return;
    const rawQuantity = window.prompt(`Hány példány? (1–${card.quantity})`, "1"); if (rawQuantity === null) return;
    const quantity = Number(rawQuantity); if (!Number.isInteger(quantity) || quantity < 1 || quantity > card.quantity) { setMessage("Érvénytelen kölcsönadott mennyiség."); return; }
    const lentAt = window.prompt("Kölcsönadás dátuma (ÉÉÉÉ-HH-NN)", localIsoDate()); if (!lentAt) return;
    const dueAt = window.prompt("Tervezett visszaadás (ÉÉÉÉ-HH-NN, opcionális)", "") ?? "";
    const note = window.prompt("Megjegyzés (opcionális)", "") ?? "";
    try { setBusy(true); await vaultApi.createCardLoan(card.id, { quantity, borrower_name: borrowerName.trim(), lent_at: lentAt, due_at: dueAt || null, note: note || null }); setMessage(`${card.card_name}: kölcsönadás rögzítve.`); await reload(); }
    catch (error) { report(error); } finally { setBusy(false); }
  }

  async function moveFolder(folderId: number, direction: -1 | 1) {
    if (!summary) return; const ids = summary.folders.map((folder) => folder.id); const index = ids.indexOf(folderId); const target = index + direction;
    if (target < 0 || target >= ids.length) return; [ids[index], ids[target]] = [ids[target], ids[index]];
    try { await vaultApi.reorderVaultFolders(ids); await reload(); } catch (error) { report(error); }
  }

  async function reviewTrade(trade: VaultTrade) {
    const raw = window.prompt("Értékelés 1–5 csillag", "5"); if (raw === null) return; const rating = Number(raw);
    if (![1, 2, 3, 4, 5].includes(rating)) { setMessage("Az értékelés 1 és 5 közötti egész szám lehet."); return; }
    const comment = window.prompt("Rövid szöveges értékelés (opcionális)", "") ?? "";
    try { await vaultApi.reviewVaultTrade(trade.id, rating, comment); setMessage("Köszönjük az értékelést! +5 VP jóváírva."); await reload(); } catch (error) { report(error); }
  }

  const collectionEditions = Array.from(new Set(cards.flatMap((card) => (card.edition || "").split(" · ").map((value) => value.trim()).filter(Boolean)))).sort(collator.compare);
  const selectedEditionCards = editionPreview?.cards.filter((card) => selectedRarities.includes((card.rarity || "").toLocaleLowerCase("hu-HU") as vaultApi.HkkRarity)) || [];
  const visibleCards = cards
    .filter((card) => !selectedFolder || card.folder_id === selectedFolder)
    .filter((card) => !filter || card.card_name.toLocaleLowerCase("hu-HU").includes(filter.trim().toLocaleLowerCase("hu-HU")))
    .filter((card) => !collectionEdition || (card.edition || "").split(" · ").map((value) => value.trim()).includes(collectionEdition))
    .filter((card) => !collectionRarity || (card.rarity || "").toLocaleLowerCase("hu-HU") === collectionRarity)
    .sort((left, right) => compareCards(left, right, sortKey, sortDirection));
  const wantedCards = cards.filter((card) => card.wanted);
  const matchedWantedCards = wantedCards.filter((card) => card.offer_count > 0);
  const unmatchedWantedCount = wantedCards.length - matchedWantedCards.length;
  const tabs: [Tab, string][] = [["collection", "Gyűjtemény"], ["trade", "Cseremappa"], ["wanted", "Keresem"], ["matches", "Match-ek"], ["loans", "Kölcsönadott lapjaim"], ["points", "VP / kapacitás"]];

  return <section className="container page-shell virtual-vault-page">
    <header className="vault-hero"><div><p className="eyebrow">Nightfall Vault</p><h1>Virtuális HKK Mappa</h1><p>Rendezd a playseteidet, tedd közzé a cserelapjaidat, és találd meg, ami hiányzik.</p></div>
      {summary ? <div className="vault-capacity-compact"><strong>{summary.vault_unlimited ? "∞ Korlátlan" : `${summary.used_collection_slots} / ${summary.total_collection_capacity}`}</strong><span>{summary.vault_unlimited ? "Kapacitás" : "gyűjtőzseb használatban"}</span><small>{summary.vault_unlimited ? `${summary.used_collection_slots} lap · ${summary.vp_balance} VP` : `${summary.free_collection_capacity} szabad · ${summary.vp_balance} VP`}</small></div> : null}</header>
    <nav className="vault-tabs" aria-label="Virtuális mappa nézetei">{tabs.map(([value, label]) => <button type="button" className={tab === value ? "is-active" : ""} aria-pressed={tab === value} onClick={() => setTab(value)} key={value}>{label}</button>)}</nav>
    {message ? <p className="form-message" role="status">{message}</p> : null}
    {folderToDelete ? <div className="vault-confirm-backdrop" role="presentation"><section className="vault-confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="vault-delete-title"><h2 id="vault-delete-title">Almappa törlése</h2><p><strong>{folderToDelete.name}</strong> · {folderToDelete.used_slots} lapbejegyzés</p><p>Áthelyezheted a lapokat egy másik mappába, vagy a mappa teljes tartalmát végleg törölheted.</p>{folderToDelete.used_slots > 0 && summary && summary.folders.length > 1 ? <label>Áthelyezés ide<select aria-label="Törlés előtti célmappa" value={deleteTargetFolder} onChange={(event) => setDeleteTargetFolder(event.target.value)}>{summary.folders.filter((folder) => folder.id !== folderToDelete.id).map((folder) => <option key={folder.id} value={folder.id}>{folder.name}</option>)}</select></label> : null}<div className="vault-card-actions"><button className="button button-ghost" type="button" onClick={() => setFolderToDelete(null)}>Mégse</button>{folderToDelete.used_slots > 0 && deleteTargetFolder ? <button className="button button-secondary" type="button" disabled={busy} onClick={() => void confirmFolderDelete(false)}>Lapok áthelyezése és mappa törlése</button> : null}<button className="button button-danger" type="button" disabled={busy} onClick={() => void confirmFolderDelete(true)}>{folderToDelete.used_slots ? `Mappa és ${folderToDelete.used_slots} lap törlése` : "Üres mappa törlése"}</button></div></section></div> : null}

    {tab === "collection" ? <section className="vault-search-panel" aria-labelledby="hkk-search-title"><div><h2 id="hkk-search-title">HKK lapfelvitel</h2><p>A találatot közvetlenül a gyűjteményedbe, a Keresem listádra vagy a publikus cseremappádba teheted.</p></div>
      <div className="vault-add-mode" role="tablist" aria-label="Lapfelvitel módja"><button type="button" role="tab" aria-selected={addMode === "card"} className={addMode === "card" ? "is-active" : ""} onClick={() => void selectAddMode("card")}>Lap keresése</button><button type="button" role="tab" aria-selected={addMode === "edition"} className={addMode === "edition" ? "is-active" : ""} onClick={() => void selectAddMode("edition")}>Kiegészítő hozzáadása</button></div>
      {addMode === "card" ? <><form onSubmit={runSearch}><label className="visually-hidden" htmlFor="vault-card-search">Lap neve</label><input id="vault-card-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Keresés lapnévre…" /><label className="vault-search-edition">Kiegészítő<select aria-label="Lapkeresés kiegészítője" value={searchEdition} onChange={(event) => setSearchEdition(event.target.value)}><option value="">Minden kiegészítő</option>{editions.map((edition) => <option key={edition.id} value={edition.id}>{edition.name}</option>)}</select></label><button className="button button-primary" disabled={busy}>{searchEdition && !search.trim() ? "Kiegészítő lapjai" : "Keresés"}</button></form>
      {results.length ? <div className="vault-search-results"><div className="vault-search-results-heading"><strong>{results.length} találat</strong><button className="button button-ghost" type="button" onClick={() => setResults([])}>Találatok törlése</button></div>{results.map((card) => <article className="vault-search-result" key={card.external_card_id}><CardImage card={card} /><div><strong>{card.card_name}</strong><CardMeta card={card} /><label className="vault-result-variant">Változat<select aria-label={`${card.card_name} hozzáadandó változata`} value={resultVariants[card.external_card_id] || "normal"} onChange={(event) => setResultVariants((current) => ({ ...current, [card.external_card_id]: event.target.value as vaultApi.PrintVariant }))}>{PRINT_VARIANTS.map((variant) => <option key={variant.value} value={variant.value}>{variant.label}</option>)}</select></label></div><div className="vault-card-actions"><button className="button button-secondary" disabled={busy} onClick={() => void addResult(card, "collection")}>Mappába teszem</button><button className="button button-ghost" disabled={busy} onClick={() => void addWantedResult(card)}>Keresem</button><button className="button button-ghost" disabled={busy} onClick={() => void addResult(card, "trade")}>Cseremappába teszem</button></div></article>)}</div> : null}</> : <div className="vault-edition-import"><div className="vault-edition-fields"><label>Kiegészítő<select value={selectedEdition} onChange={(event) => void chooseEdition(event.target.value)}><option value="">Válassz kiegészítőt…</option>{editions.map((edition) => <option key={edition.id} value={edition.id}>{edition.name}</option>)}</select></label><label>Cél-almappa<select value={selectedFolder ?? ""} onChange={(event) => setSelectedFolder(Number(event.target.value))}><option value="">Válassz almappát…</option>{summary?.folders.map((folder) => <option key={folder.id} value={folder.id}>{folder.name}</option>)}</select></label><label>Alapértelmezett darabszám<select value={editionQuantity} onChange={(event) => setEditionQuantity(Number(event.target.value))}>{[1, 2, 3].map((value) => <option key={value} value={value}>{value}</option>)}</select></label></div><fieldset className="vault-rarity-options"><legend>Importálandó gyakoriságok</legend>{RARITY_OPTIONS.map((option) => <label key={option.value}><input type="checkbox" checked={selectedRarities.includes(option.value)} onChange={(event) => setSelectedRarities((current) => event.target.checked ? [...current, option.value] : current.filter((value) => value !== option.value))} /><span>{option.label}</span>{editionPreview ? <small>{editionPreview.cards.filter((card) => (card.rarity || "").toLocaleLowerCase("hu-HU") === option.value).length} lap</small> : null}</label>)}</fieldset>{editionPreview ? <><p><strong>{selectedEditionCards.length}</strong> lap kerül feldolgozásra a(z) {editionPreview.edition.name} kiegészítőből.</p><div className="vault-card-actions"><button className="button button-primary" type="button" disabled={busy || !selectedFolder || !selectedRarities.length} onClick={() => void importEdition(false)}>Kiválasztott gyakoriságok hozzáadása</button><button className="button button-secondary" type="button" disabled={busy || !selectedFolder || !selectedRarities.length} onClick={() => void importEdition(true)}>Csak a hiányzó lapok hozzáadása</button></div></> : selectedEdition ? <p>Lapok betöltése…</p> : null}</div>}
    </section> : null}

    {tab === "collection" ? <div className="vault-layout"><aside className="vault-folder-panel"><div className="section-heading"><h2>Almappák</h2></div>{summary?.folders.map((folder, index) => <div className="vault-folder-row" key={folder.id}><button type="button" className={selectedFolder === folder.id ? "vault-folder is-active" : "vault-folder"} style={{ borderLeftColor: folder.color || undefined }} onClick={() => { setSelectedFolder(folder.id); localStorage.setItem(LAST_FOLDER_KEY, String(folder.id)); }}><span>{folder.name}</span><strong>{folder.used_slots} / {folder.capacity}</strong></button><div className="vault-folder-actions"><button type="button" aria-label={`${folder.name} feljebb`} disabled={index === 0} onClick={() => void moveFolder(folder.id, -1)}>↑</button><button type="button" aria-label={`${folder.name} lejjebb`} disabled={index === (summary?.folders.length || 0) - 1} onClick={() => void moveFolder(folder.id, 1)}>↓</button><button type="button" aria-label={`${folder.name} szerkesztése`} onClick={() => void editFolder(folder)}>✎</button><button type="button" aria-label={`${folder.name} törlése`} onClick={() => void removeFolder(folder)}>×</button></div></div>)}
      <form className="vault-folder-create" onSubmit={createFolder}><h3>Új almappa</h3><input name="name" required maxLength={80} placeholder="Mappa neve" /><div><input name="capacity" required type="number" min={0} placeholder="Zsebek" /><input name="color" type="color" defaultValue="#7c3aed" aria-label="Mappa színe" /></div><button className="button button-secondary" disabled={busy}>Létrehozás</button></form></aside>
      <section className="vault-content"><div className="vault-toolbar"><div><h2>{summary?.folders.find((folder) => folder.id === selectedFolder)?.name || "Gyűjtemény"}</h2><small>Keresés és szűrés a kiválasztott mappában.</small></div><div className="vault-toolbar-controls"><input aria-label="Gyűjtemény keresése" value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Gyorskeresés…" /><label className="vault-sort-control"><span>Kiegészítő</span><select aria-label="Gyűjtemény kiegészítő szűrő" value={collectionEdition} onChange={(event) => setCollectionEdition(event.target.value)}><option value="">Mind</option>{collectionEditions.map((edition) => <option key={edition} value={edition}>{edition}</option>)}</select></label><label className="vault-sort-control"><span>Gyakoriság</span><select aria-label="Gyűjtemény gyakoriság szűrő" value={collectionRarity} onChange={(event) => setCollectionRarity(event.target.value)}><option value="">Mind</option>{RARITY_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label><label className="vault-sort-control"><span>Rendezés</span><select aria-label="Mappa rendezése" value={sortKey} onChange={(event) => setSortKey(event.target.value as SortKey)}><option value="card_name">Név</option><option value="edition">Kiegészítő</option><option value="card_type">Típus</option><option value="subtype">Altípus</option><option value="color">Szín</option><option value="rarity">Gyakoriság</option><option value="external_card_id">HKK ID</option></select></label><button className="button button-ghost vault-sort-direction" type="button" aria-label={sortDirection === "asc" ? "Csökkenő sorrend" : "Növekvő sorrend"} onClick={() => setSortDirection((current) => current === "asc" ? "desc" : "asc")}>{sortDirection === "asc" ? "A–Z" : "Z–A"}</button></div></div>
      <div className="vault-card-grid">{visibleCards.map((card) => <article className="vault-card" key={card.id}><CardImage card={card} /><div className="vault-card-body"><div><strong>{card.card_name}</strong><span className={`playset-badge q${card.quantity}`}>{card.quantity}/3</span></div><CardMeta card={card} />{card.quantity < 3 ? <p>{3 - card.quantity} példány hiányzik</p> : <p className="complete-playset">Teljes playset</p>}
      <div className="vault-card-fields"><label>Példányszám<select value={card.quantity} onChange={(event) => void vaultApi.updateVaultCard(card.id, { quantity: Number(event.target.value) }).then(reload).catch(report)}>{[0, 1, 2, 3].map((value) => <option key={value} value={value}>{value}</option>)}</select></label><label>Változat<select aria-label={`${card.card_name} változata`} value={card.print_variant || "normal"} onChange={(event) => void vaultApi.updateVaultCard(card.id, { print_variant: event.target.value as vaultApi.PrintVariant }).then(reload).catch(report)}>{PRINT_VARIANTS.map((variant) => <option key={variant.value} value={variant.value}>{variant.label}</option>)}</select></label><label>Mappa<select value={card.folder_id ?? ""} onChange={(event) => void moveCard(card, Number(event.target.value))}>{summary?.folders.map((folder) => <option key={folder.id} value={folder.id}>{folder.name}</option>)}</select></label></div>
      <div className="vault-card-actions"><button className={card.wanted ? "button button-primary" : "button button-secondary"} disabled={busy || card.quantity === 3} onClick={() => void toggleWanted(card)}>{card.wanted ? `Keresem (${card.wanted_quantity})` : "Keresem"}</button><button className="button button-secondary" disabled={busy || card.quantity === 0} onClick={() => void lendCard(card)}>Kölcsönadom</button><button className="button button-ghost" onClick={() => { if (window.confirm("Biztosan törlöd ezt a lapot a gyűjteményből?")) void vaultApi.deleteVaultCard(card.id).then(reload).catch(report); }}>Törlés</button></div></div></article>)}</div>{!visibleCards.length ? <p className="empty-state">Ebben a mappában még nincs lap.</p> : null}</section></div> : null}

    {tab === "trade" ? <section className="vault-content"><div className="section-heading"><div><h2>Publikus cseremappa</h2><p>{summary?.vault_unlimited ? `${summary.used_trade_slots} lap · ∞ Korlátlan` : `${summary?.used_trade_slots || 0} / ${summary?.trade_capacity || 200} zseb`}</p></div></div><div className="vault-card-grid">{tradeCards.map((card) => <article className="vault-card" key={card.id}><CardImage card={card} /><div className="vault-card-body"><div><strong>{card.card_name}</strong><span className="playset-badge">{card.quantity} db</span></div><CardMeta card={card} /><label>Példányszám<select value={card.quantity} onChange={(event) => void vaultApi.updateTradeCard(card.id, { quantity: Number(event.target.value) }).then(reload).catch(report)}>{[1, 2, 3].map((value) => <option key={value} value={value}>{value}</option>)}</select></label><label>Változat<select aria-label={`${card.card_name} cserelap változata`} value={card.print_variant || "normal"} onChange={(event) => void vaultApi.updateTradeCard(card.id, { quantity: card.quantity, print_variant: event.target.value as vaultApi.PrintVariant }).then(reload).catch(report)}>{PRINT_VARIANTS.map((variant) => <option key={variant.value} value={variant.value}>{variant.label}</option>)}</select></label><div className="vault-card-actions"><button className="button button-ghost" onClick={() => { if (window.confirm("Eltávolítod a cseremappából?")) void vaultApi.deleteTradeCard(card.id).then(reload).catch(report); }}>Eltávolítás</button></div></div></article>)}</div></section> : null}
    {tab === "wanted" ? <section className="vault-content"><div className="section-heading"><div><h2>Keresem</h2><p>Csak a saját döntésed alapján megjelölt hiányzó példányok.</p></div></div><div className="vault-card-grid">{wantedCards.map((card) => <article className="vault-card" key={card.id}><CardImage card={card} /><div className="vault-card-body"><strong>{card.card_name}</strong><p>{card.wanted_quantity} hiányzik a playsethez</p><p><strong>{card.offer_count}</strong> felhasználó kínálja</p></div></article>)}</div></section> : null}
    {tab === "matches" ? <section className="vault-content"><div className="section-heading"><div><h2>Match-ek és egyeztetések</h2><p>A lezárt csere mindkét fél megerősítését igényli.</p></div></div>{matchedWantedCards.length ? <div className="vault-match-grid">{matchedWantedCards.map((card) => <article className="vault-match-card" key={card.id}><strong>{card.card_name}</strong><span>{card.wanted_quantity} hiányzik · {card.offer_count} kínálat</span><button className="button button-secondary" onClick={() => void vaultApi.listMatchingOffers(card.id).then(setOffers).catch(report)}>Ajánlatok</button></article>)}</div> : <p className="empty-state">Jelenleg nincs aktív találat a keresett lapjaidra.</p>}{unmatchedWantedCount > 0 ? <p className="vault-unmatched-summary">{unmatchedWantedCount} keresett laphoz még nincs ajánlat.</p> : null}{offers.length ? <div className="vault-offers"><h3>Kínálatok</h3>{offers.map((offer) => <article key={offer.id}><div><strong>{offer.card_name}</strong><small>@{offer.owner_username} · {offer.quantity} db · {PRINT_VARIANTS.find((variant) => variant.value === offer.print_variant)?.label || "Normál"}</small></div><button className="button button-primary" onClick={() => void vaultApi.expressTradeInterest(offer.id).then(() => { setOffers([]); return reload(); }).catch(report)}>Érdekel</button></article>)}</div> : null}<div className="vault-negotiations">{negotiations.map((trade) => <article key={trade.id}><div><strong>{trade.card.card_name}</strong><small>@{trade.requester_display_name} ↔ @{trade.owner_display_name} · {trade.status === "completed" ? "lezárva" : "egyeztetés"}</small></div><div className="vault-messages">{trade.messages.map((item) => <p key={item.id}><strong>@{item.sender_display_name}</strong> {item.message}</p>)}</div>{trade.status === "open" ? <><form onSubmit={(event) => { event.preventDefault(); const input = event.currentTarget.elements.namedItem("message") as HTMLInputElement; void vaultApi.postTradeMessage(trade.id, input.value).then(() => { input.value = ""; return reload(); }).catch(report); }}><input name="message" maxLength={2000} required placeholder="Üzenet az egyeztetéshez…" /><button className="button button-secondary">Küldés</button></form><button className="button button-primary" onClick={() => void vaultApi.confirmVaultTrade(trade.id).then(reload).catch(report)}>Csere megerősítése</button></> : trade.reviewed_by_current_user ? <button className="button button-secondary" disabled>Értékelve</button> : <button className="button button-secondary" onClick={() => void reviewTrade(trade)}>Partner értékelése</button>}</article>)}</div></section> : null}
    {tab === "loans" ? <section className="vault-content"><div className="section-heading"><div><h2>Kölcsönadott lapjaim</h2><p>Az aktív és korábbi kölcsönadások nyilvántartása.</p></div></div><div className="vault-loan-list">{loans.map((loan) => <article key={loan.id} className={loan.status === "active" ? "is-active" : ""}><div><strong>{loan.card_name}</strong><small>{PRINT_VARIANTS.find((variant) => variant.value === loan.print_variant)?.label || "Normál"} · {loan.quantity} db</small></div><div><span>{loan.borrower_name}</span><small>Kölcsönadva: {new Date(`${loan.lent_at}T00:00:00`).toLocaleDateString("hu-HU")}{loan.due_at ? ` · Tervezett visszaadás: ${new Date(`${loan.due_at}T00:00:00`).toLocaleDateString("hu-HU")}` : ""}</small>{loan.note ? <small>{loan.note}</small> : null}</div><div><span className="playset-badge">{loan.status === "active" ? "Kölcsönadva" : loan.status === "returned" ? "Visszakapva" : "Törléssel lezárva"}</span>{loan.status === "active" ? <button className="button button-primary" disabled={busy} onClick={() => void vaultApi.returnCardLoan(loan.id).then(reload).catch(report)}>Visszakaptam</button> : null}</div></article>)}</div>{!loans.length ? <p className="empty-state">Még nincs rögzített kölcsönadás.</p> : null}</section> : null}
    {tab === "points" && summary ? <section className="vault-content">
      <div className="vault-stat-grid"><article><span>Összes kapacitás</span><strong>{summary.vault_unlimited ? "∞" : summary.total_collection_capacity}</strong></article><article><span>Mappákhoz rendelve</span><strong>{summary.vault_unlimited ? "∞" : summary.assigned_collection_capacity}</strong></article><article><span>Szabad zseb</span><strong>{summary.vault_unlimited ? "Korlátlan" : summary.free_collection_capacity}</strong></article><article><span>VP egyenleg</span><strong>{summary.vp_balance}</strong></article></div>
      <section className="vault-points-guide" aria-labelledby="vault-points-guide-title"><h2 id="vault-points-guide-title">Hogyan szerezhetsz VP-t?</h2><ul><li><strong>+15 VP</strong><span>Sikeresen lezárt aukciós adásvétel résztvevőjeként.</span></li><li><strong>+20 VP</strong><span>Sikeresen lezárt virtuális mappás csere mindkét résztvevőjének.</span></li><li><strong>+10 VP</strong><span>Egyszeri bónusz az első sikeres mappás egyezésért.</span></li><li><strong>+5 VP</strong><span>Minden leadott partnerértékelésért aukció vagy mappás csere után.</span></li></ul><p><strong>100 VP = +50 permanens gyűjtőzseb.</strong> Egy VIP-kód aktiválása ezen felül +100 permanens zsebet ad, VP levonása nélkül.</p></section>
      {summary.vault_unlimited ? <div className="vault-purchase"><div><h2>Korlátlan Virtuális Mappa</h2><p>Ehhez a fiókhoz nem szükséges kapacitást vásárolni.</p></div></div> : <div className="vault-purchase"><div><h2>+50 gyűjtőzseb</h2><p>Fix 100 VP. A feloldott kapacitás permanens.</p></div><button className="button button-primary" disabled={busy || summary.vp_balance < 100} onClick={() => void vaultApi.buyVaultCapacity().then(reload).catch(report)}>Feloldás 100 VP-ért</button></div>}
      <h2>VP előzmények</h2><div className="vault-ledger">{points?.items.map((item) => <p key={item.id}><span>{new Date(item.created_at).toLocaleDateString("hu-HU")} · {item.reason}</span><strong className={item.amount > 0 ? "is-positive" : ""}>{item.amount > 0 ? "+" : ""}{item.amount} VP</strong></p>)}</div>
    </section> : null}
  </section>;
}
