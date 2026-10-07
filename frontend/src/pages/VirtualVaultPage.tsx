import { FormEvent, KeyboardEvent, useCallback, useEffect, useMemo, useState } from "react";
import { ApiError } from "../api/client";
import * as vaultApi from "../api/vault";
import type { HkkCard, PublicTradeCard, TradeCardSeeker, VaultCard, VaultCardLoan, VaultDeck, VaultSummary, VaultTrade } from "../api/vault";
import { formatHkkRarity, hkkCardImageUrl } from "../utils/hkk";

type Area = "dashboard" | "collection" | "trade" | "decks" | "loans" | "points";
type TradeView = "trade" | "wanted" | "matches";
type AddMode = "card" | "edition";
type SortKey = "card_name" | "edition" | "card_type" | "subtype" | "color" | "rarity" | "external_card_id";
const LAST_FOLDER_KEY = "nightfall-vault-last-folder";
const CHECKLIST_KEY = "nightfall-vault-tournament-checklist";
const collator = new Intl.Collator("hu-HU", { numeric: true, sensitivity: "base" });
const RARITIES: { value: vaultApi.HkkRarity; label: string }[] = [
  { value: "common", label: "Gyakori" }, { value: "uncommun", label: "Nem gyakori" },
  { value: "rare", label: "Ritka" }, { value: "ultrarare", label: "Ultraritka" },
];
const VARIANTS: { value: vaultApi.PrintVariant; label: string }[] = [
  { value: "normal", label: "Normál" }, { value: "foil", label: "Foil" },
  { value: "fa", label: "FA – Full Art" }, { value: "gfa", label: "GFA – Golden Full Art" },
];

function localIsoDate() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

function CardImage({ card }: { card: Pick<VaultCard, "external_card_id" | "card_name" | "image_url"> }) {
  const url = hkkCardImageUrl(card.external_card_id, card.image_url);
  return url ? <img src={url} alt="" loading="lazy" /> : <div className="vault-card-placeholder" aria-hidden="true">HKK</div>;
}

function CardMeta({ card }: { card: Partial<Pick<VaultCard, "edition" | "card_type" | "subtype" | "color" | "rarity">> }) {
  return <small>{[card.edition, card.card_type, card.subtype, card.color, formatHkkRarity(card.rarity ?? null)].filter(Boolean).join(" · ") || "HKK lap"}</small>;
}

function EditionCombobox({ editions, value, onChange, label }: { editions: vaultApi.HkkEdition[]; value: string; onChange: (id: string) => void; label: string }) {
  const selected = editions.find((item) => item.id === value);
  const [text, setText] = useState(selected?.name || "");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  useEffect(() => setText(selected?.name || ""), [selected?.name]);
  const options = useMemo(() => {
    const needle = text.trim().toLocaleLowerCase("hu-HU");
    return editions.filter((item) => !needle || item.name.toLocaleLowerCase("hu-HU").includes(needle) || item.id.includes(needle)).slice(0, 60);
  }, [editions, text]);
  function choose(item: vaultApi.HkkEdition) { onChange(item.id); setText(item.name); setOpen(false); }
  function keyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") { event.preventDefault(); setOpen(true); setActive((current) => Math.min(current + 1, options.length - 1)); }
    if (event.key === "ArrowUp") { event.preventDefault(); setOpen(true); setActive((current) => Math.max(current - 1, 0)); }
    if (event.key === "Enter" && open && options[active]) { event.preventDefault(); choose(options[active]); }
    if (event.key === "Escape") setOpen(false);
  }
  return <label className="vault-combobox">{label}<span className="vault-combobox-field"><input role="combobox" aria-expanded={open} aria-autocomplete="list" value={text} placeholder="Név, kód vagy ID…" onFocus={() => setOpen(true)} onChange={(event) => { setText(event.target.value); onChange(""); setActive(0); setOpen(true); }} onKeyDown={keyDown} />{value ? <button type="button" aria-label={`${label} törlése`} onClick={() => { onChange(""); setText(""); }}>×</button> : null}</span>{open ? <span role="listbox" className="vault-combobox-options">{options.length ? options.map((item, index) => <button type="button" role="option" aria-selected={item.id === value} className={index === active ? "is-active" : ""} key={item.id} onMouseDown={(event) => event.preventDefault()} onClick={() => choose(item)}>{item.name}<small>#{item.id}</small></button>) : <em>Nincs találat</em>}</span> : null}</label>;
}

export function VirtualVaultPage() {
  const [area, setArea] = useState<Area>("dashboard");
  const [tradeView, setTradeView] = useState<TradeView>("trade");
  const [summary, setSummary] = useState<VaultSummary | null>(null);
  const [cards, setCards] = useState<VaultCard[]>([]);
  const [tradeCards, setTradeCards] = useState<PublicTradeCard[]>([]);
  const [negotiations, setNegotiations] = useState<VaultTrade[]>([]);
  const [loans, setLoans] = useState<VaultCardLoan[]>([]);
  const [decks, setDecks] = useState<VaultDeck[]>([]);
  const [points, setPoints] = useState<vaultApi.PointHistory | null>(null);
  const [selectedFolder, setSelectedFolder] = useState<number>();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [editions, setEditions] = useState<vaultApi.HkkEdition[]>([]);
  const [search, setSearch] = useState("");
  const [searchEdition, setSearchEdition] = useState("");
  const [results, setResults] = useState<HkkCard[]>([]);
  const [resultVariants, setResultVariants] = useState<Record<string, vaultApi.PrintVariant>>({});
  const [resultQuantities, setResultQuantities] = useState<Record<string, number>>({});
  const [addMode, setAddMode] = useState<AddMode>("card");
  const [selectedEdition, setSelectedEdition] = useState("");
  const [editionPreview, setEditionPreview] = useState<vaultApi.HkkEditionPreview | null>(null);
  const [editionQuantity, setEditionQuantity] = useState(1);
  const [selectedRarities, setSelectedRarities] = useState<vaultApi.HkkRarity[]>(RARITIES.map((item) => item.value));
  const [filter, setFilter] = useState("");
  const [collectionEdition, setCollectionEdition] = useState("");
  const [collectionRarity, setCollectionRarity] = useState("");
  const [collectionVariant, setCollectionVariant] = useState("");
  const [collectionType, setCollectionType] = useState("");
  const [collectionColor, setCollectionColor] = useState("");
  const [collectionQuantity, setCollectionQuantity] = useState("");
  const [collectionWanted, setCollectionWanted] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("card_name");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [folderToDelete, setFolderToDelete] = useState<vaultApi.VaultFolder | null>(null);
  const [folderDeleteName, setFolderDeleteName] = useState("");
  const [loanCard, setLoanCard] = useState<VaultCard | null>(null);
  const [loanForm, setLoanForm] = useState({ borrower_name: "", quantity: 1, lent_at: localIsoDate(), due_at: "", note: "" });
  const [seekerCard, setSeekerCard] = useState<PublicTradeCard | null>(null);
  const [seekers, setSeekers] = useState<TradeCardSeeker[]>([]);
  const [offers, setOffers] = useState<PublicTradeCard[]>([]);
  const [deckSearch, setDeckSearch] = useState("");
  const [deckEdition, setDeckEdition] = useState("");
  const [deckResults, setDeckResults] = useState<HkkCard[]>([]);
  const [activeDeckId, setActiveDeckId] = useState<number>();
  const [checklist, setChecklist] = useState<Record<string, boolean>>(() => { try { return JSON.parse(localStorage.getItem(CHECKLIST_KEY) || "{}"); } catch { return {}; } });

  const report = (error: unknown) => setMessage(error instanceof ApiError ? error.message : "A művelet nem sikerült.");
  const reload = useCallback(async () => {
    try {
      const [s, c, t, n, p, l, d] = await Promise.all([vaultApi.getVaultSummary(), vaultApi.listVaultCards(), vaultApi.listTradeCards(), vaultApi.listNegotiations(), vaultApi.getPointHistory(), vaultApi.listCardLoans(), vaultApi.listDecks()]);
      setSummary(s); setCards(c); setTradeCards(t); setNegotiations(n); setPoints(p); setLoans(l); setDecks(d);
      setSelectedFolder((current) => current && s.folders.some((folder) => folder.id === current) ? current : s.folders.find((folder) => folder.id === Number(localStorage.getItem(LAST_FOLDER_KEY)))?.id || s.folders[0]?.id);
      setActiveDeckId((current) => current && d.some((deck) => deck.id === current) ? current : d[0]?.id);
    } catch (error) { report(error); }
  }, []);
  useEffect(() => { void reload(); void vaultApi.listHkkEditions().then(setEditions).catch(report); }, [reload]);

  async function createFolder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget; const data = new FormData(form);
    try { setBusy(true); const created = await vaultApi.createVaultFolder({ name: String(data.get("name")), capacity: Number(data.get("capacity")), color: String(data.get("color")) || null }); form.reset(); setSelectedFolder(created.id); localStorage.setItem(LAST_FOLDER_KEY, String(created.id)); setMessage(`${created.name} létrehozva.`); await reload(); }
    catch (error) { report(error); } finally { setBusy(false); }
  }
  async function confirmFolderDelete() {
    if (!folderToDelete || folderDeleteName !== folderToDelete.name) return;
    try { setBusy(true); await vaultApi.deleteVaultFolder(folderToDelete.id, { deleteContents: true }); setFolderToDelete(null); setFolderDeleteName(""); setMessage(`${folderToDelete.name} és tartalma törölve.`); await reload(); }
    catch (error) { report(error); } finally { setBusy(false); }
  }
  async function runSearch(event: FormEvent) {
    event.preventDefault();
    if (!searchEdition && search.trim().length < 2) { setMessage("Adj meg legalább két karaktert vagy válassz kiegészítőt."); return; }
    try { setBusy(true); setResults(await vaultApi.searchHkk(search, searchEdition || undefined)); setMessage(""); }
    catch (error) { report(error); } finally { setBusy(false); }
  }
  async function chooseEdition(id: string) {
    setSelectedEdition(id); setEditionPreview(null);
    if (!id) return;
    try { setBusy(true); setEditionPreview(await vaultApi.previewHkkEdition(id)); }
    catch (error) { report(error); } finally { setBusy(false); }
  }
  async function importEdition(missing_only: boolean) {
    if (!selectedEdition || !selectedFolder) return setMessage("Válassz kiegészítőt és cél-almappát.");
    try { setBusy(true); const result = await vaultApi.importHkkEdition({ edition_id: selectedEdition, folder_id: selectedFolder, quantity: editionQuantity, missing_only, rarities: selectedRarities }); setMessage(`${result.edition.name}: ${result.added_cards} új, ${result.updated_cards} frissített, ${result.skipped_cards} kihagyott lap.`); await reload(); }
    catch (error) { report(error); } finally { setBusy(false); }
  }
  async function addResult(card: HkkCard, target: "collection" | "trade" | "wanted") {
    if (target !== "trade" && !selectedFolder) return setMessage("Előbb válassz almappát.");
    const quantity = resultQuantities[card.external_card_id] || 1; const variant = resultVariants[card.external_card_id] || "normal";
    try { setBusy(true); if (target === "collection") await vaultApi.addVaultCard(card, selectedFolder!, quantity, variant); else if (target === "trade") await vaultApi.addTradeCard(card, quantity, variant); else await vaultApi.addWantedCard(card, selectedFolder!, variant); setMessage(`${card.card_name} elmentve.`); await reload(); }
    catch (error) { report(error); } finally { setBusy(false); }
  }
  async function saveLoan(event: FormEvent) {
    event.preventDefault(); if (!loanCard) return;
    try { setBusy(true); await vaultApi.createCardLoan(loanCard.id, { ...loanForm, due_at: loanForm.due_at || null, note: loanForm.note || null }); setLoanCard(null); setLoanForm({ borrower_name: "", quantity: 1, lent_at: localIsoDate(), due_at: "", note: "" }); setMessage("Kölcsönadás rögzítve."); await reload(); }
    catch (error) { report(error); } finally { setBusy(false); }
  }
  async function showSeekers(card: PublicTradeCard) {
    setSeekerCard(card); setSeekers([]);
    try { setSeekers(await vaultApi.listTradeCardSeekers(card.id)); } catch (error) { report(error); }
  }
  async function createDeck(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget; const name = String(new FormData(form).get("name") || "").trim(); if (!name) return;
    try { const deck = await vaultApi.createDeck(name); form.reset(); setActiveDeckId(deck.id); await reload(); } catch (error) { report(error); }
  }
  async function runDeckSearch(event: FormEvent) {
    event.preventDefault(); if (!deckEdition && deckSearch.trim().length < 2) return setMessage("Adj meg lapnevet vagy kiegészítőt.");
    try { setDeckResults(await vaultApi.searchHkk(deckSearch, deckEdition || undefined)); } catch (error) { report(error); }
  }
  async function addToDeck(card: HkkCard) {
    if (!activeDeckId) return setMessage("Előbb hozz létre paklit.");
    try { await vaultApi.addDeckCard(activeDeckId, card, resultQuantities[`deck-${card.external_card_id}`] || 1); setDeckResults((current) => current.filter((item) => item.external_card_id !== card.external_card_id)); await reload(); } catch (error) { report(error); }
  }
  function toggleChecklist(key: string) { setChecklist((current) => { const next = { ...current, [key]: !current[key] }; localStorage.setItem(CHECKLIST_KEY, JSON.stringify(next)); return next; }); }

  const collectionEditions = useMemo(() => Array.from(new Set(cards.flatMap((card) => (card.edition || "").split(" · ").filter(Boolean)))).sort(collator.compare), [cards]);
  const collectionTypes = useMemo(() => Array.from(new Set(cards.map((card) => card.card_type).filter(Boolean) as string[])).sort(collator.compare), [cards]);
  const collectionColors = useMemo(() => Array.from(new Set(cards.map((card) => card.color).filter(Boolean) as string[])).sort(collator.compare), [cards]);
  const visibleCards = useMemo(() => cards.filter((card) => !selectedFolder || card.folder_id === selectedFolder).filter((card) => !filter || card.card_name.toLocaleLowerCase("hu-HU").includes(filter.toLocaleLowerCase("hu-HU"))).filter((card) => !collectionEdition || card.edition?.includes(collectionEdition)).filter((card) => !collectionRarity || card.rarity === collectionRarity).filter((card) => !collectionVariant || card.print_variant === collectionVariant).filter((card) => !collectionType || card.card_type === collectionType).filter((card) => !collectionColor || card.color === collectionColor).filter((card) => !collectionQuantity || card.quantity === Number(collectionQuantity)).filter((card) => !collectionWanted || card.wanted === (collectionWanted === "yes")).sort((a, b) => { const av = String(a[sortKey] || ""), bv = String(b[sortKey] || ""); const result = sortKey === "external_card_id" ? Number(av) - Number(bv) : collator.compare(av, bv); return sortDirection === "asc" ? result : -result; }), [cards, selectedFolder, filter, collectionEdition, collectionRarity, collectionVariant, collectionType, collectionColor, collectionQuantity, collectionWanted, sortKey, sortDirection]);
  const wantedCards = cards.filter((card) => card.wanted);
  const activeDeck = decks.find((deck) => deck.id === activeDeckId);
  const checklistRows = [
    ...wantedCards.map((card) => ({ key: `wanted-${card.external_card_id}`, group: "Keresem / hiányzik", text: `${card.card_name} · ${card.wanted_quantity} db` })),
    ...decks.flatMap((deck) => deck.cards.filter((card) => card.missing_quantity > 0).map((card) => ({ key: `deck-${deck.id}-${card.id}`, group: "Keresem / hiányzik", text: `${deck.name}: ${card.card_name} · ${card.missing_quantity} db` }))),
    ...tradeCards.filter((card) => card.seeker_count > 0).map((card) => ({ key: `demand-${card.id}`, group: "Mások keresik", text: `${card.card_name} · ${card.seeker_count} érdeklődő` })),
    ...loans.filter((loan) => loan.status === "active").map((loan) => ({ key: `loan-${loan.id}`, group: "Kölcsön", text: `${loan.card_name} → ${loan.borrower_name}${loan.due_at ? ` · ${loan.due_at}` : ""}` })),
  ];
  const areas: [Area, string][] = [["collection", "Gyűjtemény"], ["trade", "Csere"], ["decks", "Paklik & verseny"], ["loans", "Kölcsönadások"]];

  return <section className="container page-shell virtual-vault-page">
    <header className="vault-hero"><button type="button" className="vault-home-button" onClick={() => setArea("dashboard")}><span className="eyebrow">Nightfall Vault</span><h1>Virtuális HKK Mappa</h1><small>Gyűjtemény, csere, paklik és kölcsönadások egy helyen.</small></button>{summary ? <button type="button" className="vault-capacity-compact" onClick={() => setArea("points")}><strong>{summary.vault_unlimited ? "∞ Korlátlan" : `${summary.used_collection_slots} / ${summary.total_collection_capacity}`}</strong><span>Kapacitás</span><small>{summary.vp_balance} VP · részletek</small></button> : null}</header>
    <nav className="vault-tabs" aria-label="Virtuális mappa területei">{areas.map(([id, label]) => <button type="button" className={area === id ? "is-active" : ""} onClick={() => setArea(id)} key={id}>{label}</button>)}</nav>
    {message ? <p className="form-message" role="status">{message}</p> : null}

    {area === "dashboard" && summary ? <section className="vault-content vault-dashboard"><div><p className="eyebrow">Áttekintés</p><h2>Mi történt a mappádban?</h2></div><div className="vault-dashboard-grid">
      {([ ["collection", "Összes saját lap", summary.owned_card_quantity], ["trade", "Új cserelehetőség", summary.new_trade_opportunities], ["trade", "Saját lapjaidat keresik", summary.cards_wanted_by_others], ["decks", "Paklikból hiányzik", summary.deck_missing_quantity], ["loans", "Aktív kölcsönadás", summary.active_loan_count] ] as [Area, string, number][]).map(([target, label, value]) => <button key={label} type="button" className={value ? "" : "is-muted"} onClick={() => { setArea(target); if (target === "trade") setTradeView(label.startsWith("Saját") ? "trade" : "matches"); }}><span>{label}</span><strong>{value}</strong><small>Megnyitás →</small></button>)}
    </div></section> : null}

    {area === "collection" ? <>
      <section className="vault-search-panel"><div><h2>HKK lapfelvitel</h2><p>Kereshetsz lapnévre, kiegészítőre, vagy importálhatsz gyakoriságonként.</p></div><div className="vault-add-mode"><button type="button" className={addMode === "card" ? "is-active" : ""} onClick={() => setAddMode("card")}>Lap keresése</button><button type="button" className={addMode === "edition" ? "is-active" : ""} onClick={() => setAddMode("edition")}>Kiegészítő hozzáadása</button></div>
      {addMode === "card" ? <><form onSubmit={runSearch}><input aria-label="Lap neve" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Lap neve…"/><EditionCombobox editions={editions} value={searchEdition} onChange={setSearchEdition} label="Kiegészítő"/><button className="button button-primary" disabled={busy}>Keresés</button></form>{results.length ? <div className="vault-search-results"><div className="vault-search-results-heading"><strong>{results.length} találat</strong><button type="button" className="button button-ghost" onClick={() => setResults([])}>Találatok törlése</button></div>{results.map((card) => <article className="vault-search-result" key={card.external_card_id}><CardImage card={card}/><div><strong>{card.card_name}</strong><CardMeta card={card}/><div className="vault-inline-fields"><select aria-label={`${card.card_name} változata`} value={resultVariants[card.external_card_id] || "normal"} onChange={(event) => setResultVariants((current) => ({ ...current, [card.external_card_id]: event.target.value as vaultApi.PrintVariant }))}>{VARIANTS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select><select aria-label={`${card.card_name} példányszáma`} value={resultQuantities[card.external_card_id] || 1} onChange={(event) => setResultQuantities((current) => ({ ...current, [card.external_card_id]: Number(event.target.value) }))}>{[1,2,3].map((n) => <option key={n}>{n}</option>)}</select></div></div><div className="vault-card-actions"><button className="button button-secondary" type="button" onClick={() => void addResult(card, "collection")}>Mappába teszem</button><button className="button button-ghost" type="button" onClick={() => void addResult(card, "wanted")}>Keresem</button><button className="button button-ghost" type="button" onClick={() => void addResult(card, "trade")}>Cseremappába teszem</button></div></article>)}</div> : null}</> : <div className="vault-edition-import"><div className="vault-edition-fields"><EditionCombobox editions={editions} value={selectedEdition} onChange={(id) => void chooseEdition(id)} label="Kiegészítő"/><label>Cél-almappa<select value={selectedFolder || ""} onChange={(event) => setSelectedFolder(Number(event.target.value))}>{summary?.folders.map((folder) => <option key={folder.id} value={folder.id}>{folder.name}</option>)}</select></label><label>Darabszám<select value={editionQuantity} onChange={(event) => setEditionQuantity(Number(event.target.value))}>{[1,2,3].map((n) => <option key={n}>{n}</option>)}</select></label></div><fieldset className="vault-rarity-options"><legend>Gyakoriságok</legend>{RARITIES.map((item) => <label key={item.value}><input type="checkbox" checked={selectedRarities.includes(item.value)} onChange={(event) => setSelectedRarities((current) => event.target.checked ? [...current, item.value] : current.filter((value) => value !== item.value))}/>{item.label}</label>)}</fieldset>{editionPreview ? <><p><strong>{editionPreview.cards.filter((card) => selectedRarities.includes((card.rarity || "").toLowerCase() as vaultApi.HkkRarity)).length}</strong> lap kerül feldolgozásra.</p><div className="vault-card-actions"><button type="button" className="button button-primary" onClick={() => void importEdition(false)}>Teljes kijelölés hozzáadása</button><button type="button" className="button button-secondary" onClick={() => void importEdition(true)}>Csak a hiányzók</button></div></> : null}</div>}</section>
      <div className="vault-layout"><aside className="vault-folder-panel"><h2>Almappák</h2>{summary?.folders.map((folder) => <div className="vault-folder-row" key={folder.id}><button type="button" className={`vault-folder ${folder.id === selectedFolder ? "is-active" : ""}`} style={{ borderLeftColor: folder.color || undefined }} onClick={() => { setSelectedFolder(folder.id); localStorage.setItem(LAST_FOLDER_KEY, String(folder.id)); }}><span>{folder.name}</span><strong>{folder.used_slots}/{folder.capacity}</strong></button><button type="button" className="vault-icon-button" aria-label={`${folder.name} törlése`} onClick={() => { setFolderToDelete(folder); setFolderDeleteName(""); }}>×</button></div>)}<form className="vault-folder-create" onSubmit={createFolder}><h3>Új almappa</h3><input name="name" placeholder="Mappa neve" required/><input name="capacity" type="number" min="0" placeholder="Zsebek" required/><input name="color" type="color" defaultValue="#7c3aed"/><button className="button button-secondary" disabled={busy}>Létrehozás</button></form></aside>
      <section className="vault-content"><div className="vault-toolbar"><div><h2>{summary?.folders.find((item) => item.id === selectedFolder)?.name || "Gyűjtemény"}</h2><small>{visibleCards.length} bejegyzés</small></div><div className="vault-toolbar-controls"><input aria-label="Gyűjtemény keresése" value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Keresés…"/><select aria-label="Gyűjtemény kiegészítő szűrő" value={collectionEdition} onChange={(event) => setCollectionEdition(event.target.value)}><option value="">Minden kiegészítő</option>{collectionEditions.map((item) => <option key={item}>{item}</option>)}</select><details className="vault-filter-disclosure"><summary>Szűrők</summary><label>Típus<select value={collectionType} onChange={(event) => setCollectionType(event.target.value)}><option value="">Mind</option>{collectionTypes.map((item) => <option key={item}>{item}</option>)}</select></label><label>Szín<select value={collectionColor} onChange={(event) => setCollectionColor(event.target.value)}><option value="">Mind</option>{collectionColors.map((item) => <option key={item}>{item}</option>)}</select></label><label>Gyakoriság<select value={collectionRarity} onChange={(event) => setCollectionRarity(event.target.value)}><option value="">Mind</option>{RARITIES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label><label>Változat<select value={collectionVariant} onChange={(event) => setCollectionVariant(event.target.value)}><option value="">Mind</option>{VARIANTS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label><label>Mennyiség<select value={collectionQuantity} onChange={(event) => setCollectionQuantity(event.target.value)}><option value="">Mind</option>{[0,1,2,3].map((item) => <option key={item}>{item}</option>)}</select></label><label>Keresem állapot<select value={collectionWanted} onChange={(event) => setCollectionWanted(event.target.value)}><option value="">Mind</option><option value="yes">Keresem</option><option value="no">Nem keresem</option></select></label><label>Rendezés<select value={sortKey} onChange={(event) => setSortKey(event.target.value as SortKey)}><option value="card_name">Név</option><option value="edition">Kiegészítő</option><option value="card_type">Típus</option><option value="color">Szín</option><option value="rarity">Gyakoriság</option><option value="external_card_id">HKK ID</option></select></label><button type="button" className="button button-ghost" onClick={() => setSortDirection((value) => value === "asc" ? "desc" : "asc")}>{sortDirection === "asc" ? "Növekvő" : "Csökkenő"}</button></details></div></div><div className="vault-card-grid">{visibleCards.map((card) => <article className="vault-card" key={card.id}><CardImage card={card}/><div className="vault-card-body"><div><strong>{card.card_name}</strong><span>{VARIANTS.find((item) => item.value === card.print_variant)?.label}</span></div><CardMeta card={card}/><div className="vault-card-fields"><label>Példányszám<select value={card.quantity} onChange={(event) => void vaultApi.updateVaultCard(card.id, { quantity: Number(event.target.value) }).then(reload).catch(report)}>{[0,1,2,3].map((n) => <option key={n}>{n}</option>)}</select></label><label>Mappa<select value={card.folder_id || ""} onChange={(event) => void vaultApi.updateVaultCard(card.id, { folder_id: Number(event.target.value) }).then(reload).catch(report)}>{summary?.folders.map((folder) => <option key={folder.id} value={folder.id}>{folder.name}</option>)}</select></label></div><details className="vault-card-more"><summary>További műveletek</summary><div className="vault-card-actions"><button type="button" className="button button-ghost" onClick={() => void vaultApi.setVaultWanted(card.id, !card.wanted, card.wanted ? undefined : Math.max(3-card.quantity,1)).then(reload).catch(report)}>{card.wanted ? "Keresem kikapcsolása" : "Keresem"}</button><button type="button" className="button button-ghost" onClick={() => { setLoanCard(card); setLoanForm({ borrower_name: "", quantity: 1, lent_at: localIsoDate(), due_at: "", note: "" }); }}>Kölcsönadom</button><button type="button" className="button button-ghost" onClick={() => void vaultApi.deleteVaultCard(card.id).then(reload).catch(report)}>Törlés</button></div></details></div></article>)}</div></section></div>
    </> : null}

    {area === "trade" ? <section className="vault-content"><div><h2>Csere</h2><p className="muted">Saját cserelapok, keresett lapok és automatikus találatok.</p></div><nav className="vault-subtabs">{([ ["trade","Cseremappám"], ["wanted","Keresem"], ["matches","Találatok"] ] as [TradeView,string][]).map(([id,label]) => <button type="button" className={tradeView === id ? "is-active" : ""} onClick={() => setTradeView(id)} key={id}>{label}</button>)}</nav>
      {tradeView === "trade" ? <div className="vault-card-grid">{tradeCards.map((card) => <article className="vault-card" key={card.id}><CardImage card={card}/><div className="vault-card-body"><strong>{card.card_name}</strong><CardMeta card={card}/><p>{card.quantity} db · {VARIANTS.find((item) => item.value === card.print_variant)?.label}</p>{card.seeker_count ? <button type="button" className="button button-primary" onClick={() => void showSeekers(card)}>Ki keresi ezt a lapot? ({card.seeker_count})</button> : <small>Még senki nem jelölte keresettnek.</small>}</div></article>)}</div> : null}
      {tradeView === "wanted" ? <div className="vault-card-grid">{wantedCards.map((card) => <article className="vault-card" key={card.id}><CardImage card={card}/><div className="vault-card-body"><strong>{card.card_name}</strong><p>{card.wanted_quantity} példány hiányzik</p><button type="button" className="button button-ghost" onClick={() => void vaultApi.setVaultWanted(card.id, false).then(reload).catch(report)}>Eltávolítás a Keresemből</button></div></article>)}</div> : null}
      {tradeView === "matches" ? <><div className="vault-match-grid">{wantedCards.filter((card) => card.offer_count > 0).map((card) => <article className="vault-match-card" key={card.id}><strong>{card.card_name}</strong><span>{card.offer_count} elérhető ajánlat</span><button type="button" className="button button-primary" onClick={() => void vaultApi.listMatchingOffers(card.id).then(setOffers).catch(report)}>Ajánlatok</button></article>)}</div>{offers.length ? <div className="vault-offers">{offers.map((offer) => <article key={offer.id}><div><strong>{offer.card_name}</strong><small>@{offer.owner_username} · {offer.quantity} db</small></div><button type="button" className="button button-primary" onClick={() => void vaultApi.expressTradeInterest(offer.id).then(reload).catch(report)}>Érdekel</button></article>)}</div> : null}<div className="vault-negotiations">{negotiations.map((trade) => <article key={trade.id}><div><strong>{trade.card.card_name}</strong><small>{trade.requester_display_name} ↔ {trade.owner_display_name} · {trade.status === "open" ? "egyeztetés" : "lezárt"}</small></div><div className="vault-messages">{trade.messages.map((item) => <p key={item.id}><strong>{item.sender_display_name}</strong> {item.message}</p>)}</div>{trade.status === "open" ? <form onSubmit={(event) => { event.preventDefault(); const form=event.currentTarget; const text=String(new FormData(form).get("message")||""); void vaultApi.postTradeMessage(trade.id,text).then(() => { form.reset(); return reload(); }).catch(report); }}><input name="message" placeholder="Üzenet az egyeztetéshez…" required/><button className="button button-secondary">Küldés</button></form> : null}</article>)}</div></> : null}
    </section> : null}

    {area === "decks" ? <section className="vault-content"><div className="vault-toolbar"><div><h2>Paklik & verseny</h2><small>A szükséges mennyiséget az összes saját változatból számoljuk.</small></div><form className="vault-inline-form" onSubmit={createDeck}><input name="name" placeholder="Új pakli neve" required/><button className="button button-primary">Létrehozás</button></form></div><div className="vault-deck-layout"><aside className="vault-deck-list">{decks.map((deck) => <button type="button" className={deck.id === activeDeckId ? "is-active" : ""} onClick={() => setActiveDeckId(deck.id)} key={deck.id}><strong>{deck.name}</strong><small>{deck.owned_quantity}/{deck.total_required_quantity} megvan · {deck.missing_quantity} hiányzik · {deck.available_trade_quantity} cserével elérhető</small></button>)}</aside><div>{activeDeck ? <><div className="vault-deck-heading"><h3>{activeDeck.name}</h3><button type="button" className="button button-ghost" onClick={() => void vaultApi.deleteDeck(activeDeck.id).then(reload).catch(report)}>Pakli törlése</button></div><form className="vault-deck-search" onSubmit={runDeckSearch}><input aria-label="Paklilap keresése" value={deckSearch} onChange={(event) => setDeckSearch(event.target.value)} placeholder="Lap neve…"/><EditionCombobox editions={editions} value={deckEdition} onChange={setDeckEdition} label="Kiegészítő"/><button className="button button-secondary">Keresés</button></form>{deckResults.length ? <div className="vault-search-results"><div className="vault-search-results-heading"><strong>{deckResults.length} találat</strong><button type="button" className="button button-ghost" onClick={() => setDeckResults([])}>Találatok törlése</button></div>{deckResults.map((card) => <article className="vault-search-result" key={card.external_card_id}><CardImage card={card}/><strong>{card.card_name}</strong><div className="vault-card-actions"><select aria-label={`${card.card_name} szükséges mennyisége`} value={resultQuantities[`deck-${card.external_card_id}`] || 1} onChange={(event) => setResultQuantities((current) => ({ ...current, [`deck-${card.external_card_id}`]: Number(event.target.value) }))}>{[1,2,3,4].map((n) => <option key={n}>{n}</option>)}</select><button type="button" className="button button-primary" onClick={() => void addToDeck(card)}>Pakliba</button></div></article>)}</div> : null}<div className="vault-deck-cards">{activeDeck.cards.map((card) => <article key={card.id}><div><strong>{card.card_name}</strong><small>{card.owned_quantity}/{card.required_quantity} saját · {card.missing_quantity} hiányzik{card.available_trade_quantity ? ` · ${card.available_trade_quantity} elérhető cserében` : ""}</small></div><div className="vault-deck-card-actions"><select aria-label={`${card.card_name} paklimennyisége`} value={card.required_quantity} onChange={(event) => void vaultApi.updateDeckCard(activeDeck.id, card.id, Number(event.target.value)).then(reload).catch(report)}>{[1,2,3,4].map((n) => <option key={n}>{n}</option>)}</select>{card.available_trade_quantity ? <button type="button" className="button button-secondary" onClick={() => void vaultApi.listDeckCardOffers(activeDeck.id, card.id).then((items) => { setOffers(items); setArea("trade"); setTradeView("matches"); }).catch(report)}>Cserelehetőségek</button> : null}</div><button type="button" className="button button-ghost" onClick={() => void vaultApi.deleteDeckCard(activeDeck.id, card.id).then(reload).catch(report)}>Törlés</button></article>)}</div></> : <p>Hozd létre az első paklidat.</p>}</div></div><section className="vault-checklist"><h3>Versenylista készítése</h3>{["Keresem / hiányzik","Mások keresik","Kölcsön"].map((group) => <div key={group}><h4>{group}</h4>{checklistRows.filter((row) => row.group === group).length ? checklistRows.filter((row) => row.group === group).map((row) => <label key={row.key}><input type="checkbox" checked={Boolean(checklist[row.key])} onChange={() => toggleChecklist(row.key)}/><span>{row.text}</span></label>) : <small>Nincs tétel.</small>}</div>)}</section></section> : null}

    {area === "loans" ? <section className="vault-content"><h2>Kölcsönadások</h2><div className="vault-loan-list">{loans.map((loan) => <article className={loan.status === "active" ? "is-active" : ""} key={loan.id}><div><strong>{loan.card_name}</strong><small>{loan.quantity} db · {VARIANTS.find((item) => item.value === loan.print_variant)?.label}</small></div><div><span>{loan.borrower_name}</span><small>{loan.lent_at}{loan.due_at ? ` → ${loan.due_at}` : ""}{loan.note ? ` · ${loan.note}` : ""}</small></div>{loan.status === "active" ? <button type="button" className="button button-secondary" onClick={() => void vaultApi.returnCardLoan(loan.id).then(reload).catch(report)}>Visszakaptam</button> : <span>Lezárva</span>}</article>)}</div></section> : null}

    {area === "points" && summary ? <section className="vault-content"><h2>VP és kapacitás</h2><div className="vault-stat-grid"><article><span>VP-egyenleg</span><strong>{summary.vp_balance}</strong></article><article><span>Gyűjtőkapacitás</span><strong>{summary.vault_unlimited ? "∞" : summary.total_collection_capacity}</strong></article><article><span>Cseremappa</span><strong>{summary.vault_unlimited ? "∞" : summary.trade_capacity}</strong></article></div><div className="vault-points-guide"><h3>Hogyan szerezhetsz VP-t?</h3><ul><li><strong>+10 VP</strong><span>Sikeres vásárlás után</span></li><li><strong>+5 VP</strong><span>Lezárt csere értékeléséért</span></li><li><strong>100 VP</strong><span>+50 gyűjtőzsebre váltható</span></li></ul></div>{!summary.vault_unlimited ? <button type="button" className="button button-primary" disabled={summary.vp_balance < 100} onClick={() => void vaultApi.buyVaultCapacity().then(reload).catch(report)}>+50 zseb vásárlása · 100 VP</button> : null}<div className="vault-ledger">{points?.items.map((item) => <p key={item.id}><span>{item.reason}</span><strong className={item.amount > 0 ? "is-positive" : ""}>{item.amount > 0 ? "+" : ""}{item.amount} VP</strong></p>)}</div></section> : null}

    {folderToDelete ? <div className="vault-confirm-backdrop"><section className="vault-confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="folder-delete-title"><h2 id="folder-delete-title">Almappa végleges törlése</h2><p><strong>{folderToDelete.name}</strong> · {folderToDelete.used_slots} lapbejegyzés</p><p>A mappa és teljes tartalma végleg törlődik. A kölcsönzési előzmények megmaradnak.</p><label>A megerősítéshez írd be pontosan: <strong>{folderToDelete.name}</strong><input autoFocus value={folderDeleteName} onChange={(event) => setFolderDeleteName(event.target.value)}/></label><div className="vault-card-actions"><button type="button" className="button button-ghost" onClick={() => setFolderToDelete(null)}>Mégse</button><button type="button" className="button button-danger" disabled={busy || folderDeleteName !== folderToDelete.name} onClick={() => void confirmFolderDelete()}>Mappa és {folderToDelete.used_slots} lap törlése</button></div></section></div> : null}
    {loanCard ? <div className="vault-confirm-backdrop"><form className="vault-confirm-dialog vault-loan-dialog" role="dialog" aria-modal="true" onSubmit={saveLoan}><h2>Kölcsönadás · {loanCard.card_name}</h2><label>Kölcsönvevő neve<input value={loanForm.borrower_name} onChange={(event) => setLoanForm((current) => ({ ...current, borrower_name: event.target.value }))} required/></label><label>Mennyiség<select value={loanForm.quantity} onChange={(event) => setLoanForm((current) => ({ ...current, quantity: Number(event.target.value) }))}>{Array.from({ length: loanCard.quantity }, (_, index) => index + 1).map((n) => <option key={n}>{n}</option>)}</select></label><label>Kölcsönadás dátuma<input type="date" value={loanForm.lent_at} onChange={(event) => setLoanForm((current) => ({ ...current, lent_at: event.target.value }))} required/></label><label>Tervezett visszaadás<input type="date" min={loanForm.lent_at} value={loanForm.due_at} onChange={(event) => setLoanForm((current) => ({ ...current, due_at: event.target.value }))}/></label><label>Megjegyzés<textarea value={loanForm.note} onChange={(event) => setLoanForm((current) => ({ ...current, note: event.target.value }))}/></label><div className="vault-card-actions"><button type="button" className="button button-ghost" onClick={() => setLoanCard(null)}>Mégse</button><button className="button button-primary" disabled={busy}>Kölcsönadás mentése</button></div></form></div> : null}
    {seekerCard ? <div className="vault-confirm-backdrop"><section className="vault-confirm-dialog" role="dialog" aria-modal="true"><h2>Ki keresi? · {seekerCard.card_name}</h2>{seekers.length ? seekers.map((user) => <article className="vault-seeker-row" key={user.user_id}><div><strong>{user.display_name}</strong><small>@{user.username} · {user.wanted_quantity} db</small></div><a className="button button-primary" href={`/users/${encodeURIComponent(user.username)}`}>Profil megnyitása</a></article>) : <p>Nincs megjeleníthető kereső.</p>}<button type="button" className="button button-ghost" onClick={() => setSeekerCard(null)}>Bezárás</button></section></div> : null}
  </section>;
}
