import { FormEvent, KeyboardEvent, type ComponentProps, useCallback, useEffect, useMemo, useState } from "react";
import { ApiError } from "../api/client";
import * as vaultApi from "../api/vault";
import type { HkkCard, PublicTradeCard, TradeCardSeeker, VaultCard, VaultCardLoan, VaultDeck, VaultSummary, VaultTrade } from "../api/vault";
import { CardImagePreview } from "../components/CardImagePreview";
import { MultiValueFilter, normalizeFilterText } from "../components/MultiValueFilter";
import { formatHkkRarity, preferredHkkImageVariant } from "../utils/hkk";
import { ListingComposer } from "../components/ListingComposer";
import { VaultBulkListingComposer } from "../components/VaultBulkListingComposer";
import { useNotifications } from "../NotificationContext";
import { useAuth } from "../AuthContext";

const CardImage = (props: ComponentProps<typeof CardImagePreview>) => <CardImagePreview {...props} preview={false}/>;

type Area = "dashboard" | "collection" | "add" | "trade" | "decks" | "loans" | "points";
type TradeView = "trade" | "wanted" | "matches";
type AddMode = "card" | "edition";
type SortKey = "card_name" | "edition" | "card_type" | "subtype" | "color" | "rarity" | "external_card_id";
type VaultCardGroup = { key: string; card: VaultCard; variants: VaultCard[] };
type LoanDraftItem = HkkCard & { quantity: number; print_variant: vaultApi.PrintVariant };
const MAX_COPIES = 9;
const LAST_FOLDER_KEY = "nightfall-vault-last-folder";
const CHECKLIST_KEY = "nightfall-vault-tournament-checklist";
const MAINTENANCE_SNOOZE_KEY = "nightfall-vault-maintenance-snoozed-until";
const collator = new Intl.Collator("hu-HU", { numeric: true, sensitivity: "base" });
const RARITIES: { value: vaultApi.HkkRarity; label: string }[] = [
  { value: "common", label: "Gyakori" }, { value: "uncommun", label: "Nem gyakori" },
  { value: "rare", label: "Ritka" }, { value: "ultrarare", label: "Ultraritka" },
];
const VARIANTS: { value: vaultApi.PrintVariant; label: string; title: string }[] = [
  { value: "normal", label: "Normál", title: "Normál" }, { value: "foil", label: "Foil", title: "Foil" },
  { value: "fa", label: "FA", title: "Full Art" }, { value: "gfa", label: "GFA", title: "Golden Full Art" },
];
const EDITION_GROUPS: { value: vaultApi.HkkEditionGroup; label: string }[] = [
  { value: "zen", label: "Zén" }, { value: "alpha", label: "Alfa" },
  { value: "promo", label: "Promo lapok" }, { value: "coded", label: "Kódos lapok" },
];

type VariantAwareCard = { print_variant?: vaultApi.PrintVariant; variant_statuses?: Partial<Record<vaultApi.PrintVariant, vaultApi.VariantStatus>>; variants_verified?: boolean };

function visibleQuantityVariants(card: VariantAwareCard) {
  return VARIANTS.filter((item) => card.variant_statuses?.[item.value] === "exists" || item.value === card.print_variant || (!card.variants_verified && item.value === "normal"));
}

function unverifiedVariants(card: VariantAwareCard, alreadyVisible = new Set<vaultApi.PrintVariant>()) {
  if (card.variants_verified) return [];
  return VARIANTS.filter((item) => item.value !== "normal" && item.value !== card.print_variant && !alreadyVisible.has(item.value) && (card.variant_statuses?.[item.value] || "unknown") === "unknown");
}

function selectableVariants(card: VariantAwareCard) {
  return card.variants_verified ? visibleQuantityVariants(card) : VARIANTS;
}

function availableQuantities(_card: Pick<VaultCard, "quantity" | "rarity" | "print_variant">) {
  return Array.from({ length: MAX_COPIES + 1 }, (_, quantity) => quantity);
}

function groupVariantDefinitions(group: VaultCardGroup) {
  const existing = new Set(group.variants.map((card) => card.print_variant));
  return VARIANTS.filter((definition) => group.card.variant_statuses?.[definition.value] === "exists" || existing.has(definition.value) || (!group.card.variants_verified && definition.value === "normal"));
}

function groupUnverifiedDefinitions(group: VaultCardGroup) {
  return unverifiedVariants(group.card, new Set(groupVariantDefinitions(group).map((item) => item.value)));
}

function displayedGroupCard(group: VaultCardGroup) {
  const quantities = Object.fromEntries(group.variants.map((item) => [item.print_variant, item.quantity]));
  const display_variant = preferredHkkImageVariant(quantities, group.card.variant_image_urls);
  const selected = group.variants.find((item) => item.print_variant === display_variant) || group.variants.find((item) => item.print_variant === "normal") || group.card;
  return { ...selected, display_variant };
}

function groupAvailableQuantities(group: VaultCardGroup, variant?: VaultCard) {
  const otherTotal = group.variants.filter((item) => item.id !== variant?.id).reduce((sum, item) => sum + item.quantity, 0);
  const currentTotal = otherTotal + (variant?.quantity || 0);
  const maximum = Math.max(variant?.quantity || 0, MAX_COPIES - otherTotal, currentTotal > MAX_COPIES ? variant?.quantity || 0 : 0);
  return Array.from({ length: maximum + 1 }, (_, quantity) => quantity);
}

function groupVaultCards(cards: VaultCard[]): VaultCardGroup[] {
  const groups = new Map<string, VaultCardGroup>();
  cards.forEach((card) => {
    const group = groups.get(card.external_card_id);
    if (group) group.variants.push(card);
    else groups.set(card.external_card_id, { key: card.external_card_id, card, variants: [card] });
  });
  return Array.from(groups.values()).map((group) => ({
    ...group,
    variants: group.variants.sort((a, b) => VARIANTS.findIndex((item) => item.value === a.print_variant) - VARIANTS.findIndex((item) => item.value === b.print_variant)),
  }));
}

function localIsoDate() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

function CardMeta({ card }: { card: Partial<Pick<VaultCard, "edition" | "card_type" | "subtype" | "color" | "rarity">> }) {
  return <small>{[card.edition, card.card_type, card.subtype, card.color, formatHkkRarity(card.rarity ?? null)].filter(Boolean).join(" · ") || "HKK lap"}</small>;
}

function TrashIcon() {
  return <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24"><path d="M4 7h16M9 7V4h6v3m3 0-1 13H7L6 7m4 4v5m4-5v5"/></svg>;
}

function SearchIcon() { return <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.5 15.5 5 5"/></svg>; }
function HandshakeIcon() { return <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24"><path d="m8 12 3-3a2 2 0 0 1 3 0l1 1m-7 2-2-2-4 4 5 5c1 1 2 1 3 0l6-6m0-3 2-2 4 4-5 5"/></svg>; }
function SaleIcon() { return <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24"><path d="M12 2v20m5-16H9a3 3 0 0 0 0 6h6a3 3 0 0 1 0 6H7"/></svg>; }

function EditionCombobox({ editions, value, onChange, label, showGroups = true }: { editions: vaultApi.HkkEdition[]; value: string; onChange: (id: string) => void; label: string; showGroups?: boolean }) {
  const selected = editions.find((item) => item.id === value);
  const [text, setText] = useState(selected?.name || "");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [group, setGroup] = useState<vaultApi.HkkEditionGroup | "">("");
  useEffect(() => setText(selected?.name || ""), [selected?.name]);
  const options = useMemo(() => {
    const needle = text.trim().toLocaleLowerCase("hu-HU");
    return editions.filter((item) => !group || item.group === group).filter((item) => !needle || item.name.toLocaleLowerCase("hu-HU").includes(needle) || item.id.includes(needle)).slice(0, 60);
  }, [editions, group, text]);
  function choose(item: vaultApi.HkkEdition) { onChange(item.id); setText(item.name); setOpen(false); }
  function keyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") { event.preventDefault(); setOpen(true); setActive((current) => Math.min(current + 1, options.length - 1)); }
    if (event.key === "ArrowUp") { event.preventDefault(); setOpen(true); setActive((current) => Math.max(current - 1, 0)); }
    if (event.key === "Enter" && open && options[active]) { event.preventDefault(); choose(options[active]); }
    if (event.key === "Escape") setOpen(false);
  }
  return <div className="vault-combobox">
    <span className="vault-combobox-label">{label}</span>
    <span className="vault-combobox-field"><input aria-label={label} role="combobox" aria-expanded={open} aria-autocomplete="list" value={text} placeholder="Név, kód vagy ID…" onFocus={() => setOpen(true)} onChange={(event) => { setText(event.target.value); onChange(""); setActive(0); setOpen(true); }} onKeyDown={keyDown} />{value ? <button type="button" aria-label={`${label} törlése`} onClick={() => { onChange(""); setText(""); }}>×</button> : null}</span>
    {open ? <span className="vault-combobox-options">
      {showGroups ? <span className="vault-edition-groups" role="group" aria-label="Kiegészítő kategóriák">{EDITION_GROUPS.map((item) => <button type="button" aria-pressed={group === item.value} className={group === item.value ? "is-active" : ""} key={item.value} onMouseDown={(event) => event.preventDefault()} onClick={() => { setGroup((current) => current === item.value ? "" : item.value); setActive(0); }}>{item.label}</button>)}</span> : null}
      <span role="listbox" className="vault-combobox-option-list">{options.length ? options.map((item, index) => <button type="button" role="option" aria-selected={item.id === value} className={index === active ? "is-active" : ""} key={item.id} onMouseDown={(event) => event.preventDefault()} onClick={() => choose(item)}><span>{item.name}</span><small>#{item.id}{item.release_date ? ` · ${item.release_date}` : ""}</small></button>) : <em>Nincs találat</em>}</span>
    </span> : null}
  </div>;
}

export function VirtualVaultPage() {
  const { showToast } = useNotifications();
  const { user } = useAuth();
  const initialParams = useMemo(() => new URLSearchParams(window.location.search), []);
  const [area, setArea] = useState<Area>(() => {
    const requested = initialParams.get("area");
    return (["dashboard", "collection", "add", "trade", "decks", "loans", "points"] as Area[]).includes(requested as Area) ? requested as Area : "dashboard";
  });
  const [tradeView, setTradeView] = useState<TradeView>(() => {
    const requested = initialParams.get("view");
    return (["trade", "wanted", "matches"] as TradeView[]).includes(requested as TradeView) ? requested as TradeView : "trade";
  });
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
  const [collectionEditions, setCollectionEditions] = useState<string[]>([]);
  const [collectionRarities, setCollectionRarities] = useState<string[]>([]);
  const [collectionVariants, setCollectionVariants] = useState<string[]>([]);
  const [collectionTypes, setCollectionTypes] = useState<string[]>([]);
  const [collectionSubtypes, setCollectionSubtypes] = useState<string[]>([]);
  const [collectionColors, setCollectionColors] = useState<string[]>([]);
  const [collectionQuantity, setCollectionQuantity] = useState("");
  const [collectionWanted, setCollectionWanted] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("card_name");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [folderToDelete, setFolderToDelete] = useState<vaultApi.VaultFolder | null>(null);
  const [folderDeleteName, setFolderDeleteName] = useState("");
  const [editingFolderId, setEditingFolderId] = useState<number>();
  const [editingFolderCapacity, setEditingFolderCapacity] = useState(0);
  const [loanCard, setLoanCard] = useState<VaultCard | null>(null);
  const [loanForm, setLoanForm] = useState({ borrower_name: "", quantity: 1, lent_at: localIsoDate(), due_at: "", note: "" });
  const [tradeGroup, setTradeGroup] = useState<VaultCardGroup | null>(null);
  const [listingGroup, setListingGroup] = useState<VaultCardGroup | null>(null);
  const [listingInventoryKind, setListingInventoryKind] = useState<"collection" | "trade">("collection");
  const [tradeCardToRemove, setTradeCardToRemove] = useState<PublicTradeCard | null>(null);
  const [tradeQuantities, setTradeQuantities] = useState<Record<number, number>>({});
  const [tradeSortKey, setTradeSortKey] = useState<"external_card_id" | "card_name">("external_card_id");
  const [tradeDisplayMode, setTradeDisplayMode] = useState<"grid" | "list">(() => localStorage.getItem("nightfall-vault-card-display-mode") === "list" ? "list" : "grid");
  const [loanComposerOpen, setLoanComposerOpen] = useState(false);
  const [loanSearch, setLoanSearch] = useState("");
  const [loanEdition, setLoanEdition] = useState("");
  const [loanResults, setLoanResults] = useState<HkkCard[]>([]);
  const [loanResultVariants, setLoanResultVariants] = useState<Record<string, vaultApi.PrintVariant>>({});
  const [loanResultQuantities, setLoanResultQuantities] = useState<Record<string, number>>({});
  const [loanDraft, setLoanDraft] = useState<LoanDraftItem[]>([]);
  const [standaloneLoanForm, setStandaloneLoanForm] = useState({ borrower_name: "", lent_at: localIsoDate(), due_at: "", note: "" });
  const [seekerCard, setSeekerCard] = useState<PublicTradeCard | null>(null);
  const [seekers, setSeekers] = useState<TradeCardSeeker[]>([]);
  const [offers, setOffers] = useState<PublicTradeCard[]>([]);
  const [selectedMatchCard, setSelectedMatchCard] = useState<VaultCard | null>(null);
  const [offersLoading, setOffersLoading] = useState(false);
  const [offersMessage, setOffersMessage] = useState("");
  const [editingTradeId, setEditingTradeId] = useState<number | null>(null);
  const [offerDraft, setOfferDraft] = useState<Record<number, number>>({});
  const [deckSearch, setDeckSearch] = useState("");
  const [deckEdition, setDeckEdition] = useState("");
  const [deckResults, setDeckResults] = useState<HkkCard[]>([]);
  const [activeDeckId, setActiveDeckId] = useState<number>();
  const [maintenance, setMaintenance] = useState<vaultApi.VaultMaintenance | null>(null);
  const [maintenanceSnoozedUntil, setMaintenanceSnoozedUntil] = useState(() => Number(localStorage.getItem(MAINTENANCE_SNOOZE_KEY) || 0));
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedCardIds, setSelectedCardIds] = useState<Set<number>>(new Set());
  const [bulkTargetFolder, setBulkTargetFolder] = useState<number>();
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [unseenMatchCount, setUnseenMatchCount] = useState(0);
  const [checklist, setChecklist] = useState<Record<string, boolean>>(() => { try { return JSON.parse(localStorage.getItem(CHECKLIST_KEY) || "{}"); } catch { return {}; } });

  const report = (error: unknown) => setMessage(error instanceof ApiError ? error.message : "A művelet nem sikerült.");
  async function showMatchingOffers(card: VaultCard) {
    setSelectedMatchCard(card);
    setOffers([]);
    setOffersMessage("");
    setOffersLoading(true);
    try {
      const items = await vaultApi.listMatchingOffers(card.id);
      setOffers(items);
      if (!items.length) setOffersMessage("Az ajánlat időközben megszűnt. A találatokat frissítettük.");
    } catch (error) {
      setOffersMessage(error instanceof ApiError ? error.message : "Az ajánlatok betöltése nem sikerült.");
    } finally {
      setOffersLoading(false);
    }
  }

  function beginCounterOffer(trade: VaultTrade) {
    const current = trade.offer_versions.find((version) => version.version === trade.current_version);
    setOfferDraft(Object.fromEntries((current?.items || []).map((item) => [item.trade_card_id, item.quantity])));
    setEditingTradeId(trade.id);
  }

  async function saveCounterOffer(trade: VaultTrade) {
    const items = Object.entries(offerDraft).filter(([, quantity]) => quantity > 0).map(([trade_card_id, quantity]) => ({ trade_card_id: Number(trade_card_id), quantity }));
    try {
      setBusy(true);
      await vaultApi.updateVaultTradeOffer(trade.id, trade.current_version, items);
      setEditingTradeId(null);
      setMessage("Az ellenajánlat elküldve. A korábbi elfogadások érvényüket vesztették.");
      await reload();
    } catch (error) { report(error); } finally { setBusy(false); }
  }

  async function acceptTradeOffer(trade: VaultTrade) {
    try {
      setBusy(true);
      await vaultApi.acceptVaultTradeOffer(trade.id, trade.current_version);
      setMessage("Az aktuális csereajánlatot elfogadtad.");
      await reload();
    } catch (error) { report(error); } finally { setBusy(false); }
  }
  async function cancelTradeOffer(trade: VaultTrade) {
    try {
      setBusy(true);
      await vaultApi.cancelVaultTradeOffer(trade.id);
      setMessage("A csereajánlat lezárult.");
      await reload();
    } catch (error) { report(error); } finally { setBusy(false); }
  }
  const reload = useCallback(async () => {
    try {
      const [s, c, t, n, p, l, d, m] = await Promise.all([vaultApi.getVaultSummary(), vaultApi.listVaultCards(), vaultApi.listTradeCards(), vaultApi.listNegotiations(), vaultApi.getPointHistory(), vaultApi.listCardLoans(), vaultApi.listDecks(), vaultApi.getVaultMaintenance()]);
      setSummary(s); setCards(c); setTradeCards(t); setNegotiations(n); setPoints(p); setLoans(l); setDecks(d); setMaintenance(m); setUnseenMatchCount(s.unseen_match_count || 0);
      setSelectedFolder((current) => current && s.folders.some((folder) => folder.id === current) ? current : s.folders.find((folder) => folder.id === Number(localStorage.getItem(LAST_FOLDER_KEY)))?.id || s.folders[0]?.id);
      setActiveDeckId((current) => current && d.some((deck) => deck.id === current) ? current : d[0]?.id);
    } catch (error) { report(error); }
  }, []);
  useEffect(() => { void reload(); void vaultApi.listHkkEditions().then(setEditions).catch(report); }, [reload]);
  useEffect(() => {
    if (area !== "trade" || tradeView !== "matches") return;
    void vaultApi.getMatchStatus().then(async (status) => {
      setUnseenMatchCount(status.unseen_count);
      if (!status.match_keys.length) return;
      await vaultApi.markMatchesSeen(status.match_keys);
      setUnseenMatchCount(0);
      setSummary((current) => current ? { ...current, unseen_match_count: 0 } : current);
    }).catch(report);
  }, [area, tradeView]);

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
  async function saveFolderCapacity(event: FormEvent) {
    event.preventDefault();
    if (!editingFolderId) return;
    try {
      setBusy(true);
      await vaultApi.updateVaultFolder(editingFolderId, { capacity: editingFolderCapacity });
      setEditingFolderId(undefined);
      setMessage("Az almappa zsebszáma frissült.");
      await reload();
    } catch (error) { report(error); } finally { setBusy(false); }
  }
  async function moveFolder(folderId: number, direction: -1 | 1) {
    if (!summary) return;
    const ids = summary.folders.map((folder) => folder.id);
    const index = ids.indexOf(folderId);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target], ids[index]];
    try { setBusy(true); await vaultApi.reorderVaultFolders(ids); await reload(); }
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
    const selections = selectableVariants(card).map((variant) => ({ variant: variant.value, quantity: resultQuantities[`${card.external_card_id}-${variant.value}`] ?? (variant.value === "normal" ? 1 : 0) })).filter((item) => item.quantity > 0);
    if (!selections.length) return setMessage("Válassz legalább egy lapváltozatot és darabszámot.");
    try {
      setBusy(true);
      for (const selection of selections) {
        if (target === "collection") await vaultApi.addVaultCard(card, selectedFolder!, selection.quantity, selection.variant);
        else if (target === "trade") await vaultApi.addTradeCard(card, selection.quantity, selection.variant);
        else await vaultApi.addWantedCard(card, selectedFolder!, selection.variant);
      }
      const feedback = target === "collection"
        ? { title: "Mappába mentve", message: `${card.card_name} bekerült a gyűjteményedbe.`, targetUrl: "/vault?area=collection" }
        : target === "trade"
          ? { title: "Cseremappába mentve", message: `${card.card_name} bekerült a cseremappádba.`, targetUrl: "/vault?area=trade&view=trade" }
          : { title: "Keresem listára mentve", message: `${card.card_name} felkerült a keresett lapjaid közé.`, targetUrl: "/vault?area=trade&view=wanted" };
      setMessage("");
      showToast(feedback);
      await reload();
    }
    catch (error) { report(error); } finally { setBusy(false); }
  }
  async function saveLoan(event: FormEvent) {
    event.preventDefault(); if (!loanCard) return;
    try { setBusy(true); await vaultApi.createCardLoan(loanCard.id, { ...loanForm, due_at: loanForm.due_at || null, note: loanForm.note || null }); setLoanCard(null); setLoanForm({ borrower_name: "", quantity: 1, lent_at: localIsoDate(), due_at: "", note: "" }); setMessage("Kölcsönadás rögzítve."); await reload(); }
    catch (error) { report(error); } finally { setBusy(false); }
  }
  async function saveTradeQuantities(event: FormEvent) {
    event.preventDefault(); if (!tradeGroup) return;
    try {
      setBusy(true);
      await vaultApi.setCollectionTradeQuantities(tradeGroup.variants.map((card) => ({ card_id: card.id, quantity: tradeQuantities[card.id] || 0 })));
      setTradeGroup(null); setMessage("A cseremappa mennyiségei frissültek."); await reload();
    } catch (error) { report(error); } finally { setBusy(false); }
  }
  function openTradeQuantities(group: VaultCardGroup) {
    setTradeGroup(group);
    setTradeQuantities(Object.fromEntries(group.variants.map((card) => [card.id, tradeCards.find((trade) => trade.external_card_id === card.external_card_id && trade.print_variant === card.print_variant)?.quantity || 0])));
  }
  async function changeGroupVariant(group: VaultCardGroup, variant: vaultApi.PrintVariant, quantity: number) {
    const existing = group.variants.find((card) => card.print_variant === variant);
    if (!existing && quantity === 0) return;
    try {
      setBusy(true);
      if (existing) await vaultApi.updateVaultCard(existing.id, { quantity });
      else await vaultApi.addVaultCardVariant(group.card.id, quantity, variant);
      await reload();
    } catch (error) { report(error); } finally { setBusy(false); }
  }
  async function runLoanSearch(event?: { preventDefault(): void }) {
    event?.preventDefault();
    if (!loanEdition && loanSearch.trim().length < 2) return setMessage("Adj meg lapnevet vagy kiegészítőt.");
    try { setLoanResults(await vaultApi.searchHkk(loanSearch, loanEdition || undefined)); } catch (error) { report(error); }
  }
  function addLoanDraft(card: HkkCard) {
    const print_variant = loanResultVariants[card.external_card_id] || "normal";
    const quantity = loanResultQuantities[card.external_card_id] || 1;
    setLoanDraft((current) => current.some((item) => item.external_card_id === card.external_card_id && item.print_variant === print_variant) ? current : [...current, { ...card, print_variant, quantity }]);
  }
  async function saveStandaloneLoans(event: FormEvent) {
    event.preventDefault(); if (!loanDraft.length) return;
    try {
      setBusy(true);
      await vaultApi.createStandaloneCardLoans(loanDraft, { ...standaloneLoanForm, due_at: standaloneLoanForm.due_at || null, note: standaloneLoanForm.note || null });
      setLoanDraft([]); setLoanResults([]); setLoanSearch(""); setLoanComposerOpen(false);
      setStandaloneLoanForm({ borrower_name: "", lent_at: localIsoDate(), due_at: "", note: "" });
      setMessage(`${loanDraft.length} kölcsönadott lap rögzítve.`); await reload();
    } catch (error) { report(error); } finally { setBusy(false); }
  }
  async function showSeekers(card: PublicTradeCard) {
    setSeekerCard(card); setSeekers([]);
    try { setSeekers(await vaultApi.listTradeCardSeekers(card.id)); } catch (error) { report(error); }
  }
  function removeTradeCard(card: PublicTradeCard) {
    setTradeCardToRemove(card);
  }
  async function confirmTradeCardRemoval() {
    if (!tradeCardToRemove) return;
    const card = tradeCardToRemove;
    try {
      setBusy(true);
      await vaultApi.deleteTradeCard(card.id);
      setTradeCards((current) => current.filter((item) => item.id !== card.id));
      setTradeCardToRemove(null);
      setMessage(`${card.card_name} eltávolítva a cseremappából. A gyűjteményed változatlan maradt.`);
      await reload();
    } catch (error) { report(error); } finally { setBusy(false); }
  }

  function openTradeCardListing(card: PublicTradeCard) {
    if (card.variant_needs_review) {
      setMessage("Ez a lapváltozat felülvizsgálatra vár, ezért jelenleg nem hirdethető meg.");
      return;
    }
    setListingInventoryKind("trade");
    setListingGroup({ key: `trade-${card.id}`, card, variants: [card] });
  }
  async function toggleWanted(card: VaultCard) {
    const previous = cards;
    const wanted = !card.wanted;
    setCards((current) => current.map((item) => item.id === card.id ? { ...item, wanted, wanted_quantity: wanted ? Math.max(3 - card.quantity, 1) : 0 } : item));
    try {
      await vaultApi.setVaultWanted(card.id, wanted, wanted ? Math.max(3 - card.quantity, 1) : undefined);
      await reload();
    } catch (error) {
      setCards(previous);
      report(error);
    }
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
  async function runBulkAction(action: vaultApi.BulkCardAction) {
    const ids = Array.from(selectedCardIds);
    if (!ids.length) return;
    if (action === "delete") { setBulkDeleteOpen(true); return; }
    try {
      setBusy(true);
      const result = await vaultApi.bulkUpdateVaultCards(ids, action, action === "move" ? bulkTargetFolder : undefined);
      setMessage(`${result.processed_count} lap frissítve.`);
      setSelectedCardIds(new Set());
      await reload();
    } catch (error) { report(error); } finally { setBusy(false); }
  }
  async function confirmBulkDelete() {
    try {
      setBusy(true);
      const result = await vaultApi.bulkUpdateVaultCards(Array.from(selectedCardIds), "delete");
      setMessage(`${result.processed_count} lap törölve.`);
      setSelectedCardIds(new Set()); setBulkDeleteOpen(false); setSelectionMode(false);
      await reload();
    } catch (error) { report(error); } finally { setBusy(false); }
  }
  function toggleSelectedGroup(group: VaultCardGroup) {
    setSelectedCardIds((current) => {
      const next = new Set(current);
      const allSelected = group.variants.every((card) => next.has(card.id));
      group.variants.forEach((card) => allSelected ? next.delete(card.id) : next.add(card.id));
      return next;
    });
  }
  function snoozeMaintenance() { const until = Date.now() + 7 * 24 * 60 * 60 * 1000; localStorage.setItem(MAINTENANCE_SNOOZE_KEY, String(until)); setMaintenanceSnoozedUntil(until); }
  function toggleChecklist(key: string) { setChecklist((current) => { const next = { ...current, [key]: !current[key] }; localStorage.setItem(CHECKLIST_KEY, JSON.stringify(next)); return next; }); }

  const folderCards = useMemo(() => cards.filter((card) => !selectedFolder || card.folder_id === selectedFolder), [cards, selectedFolder]);
  const valuesFor = (key: "edition" | "card_type" | "subtype" | "color") => Array.from(new Set(folderCards.flatMap((card) => (card[key] || "").split(" · ").map((value) => value.trim()).filter(Boolean)))).sort(collator.compare);
  const collectionEditionOptions = useMemo(() => valuesFor("edition"), [folderCards]);
  const collectionTypeOptions = useMemo(() => valuesFor("card_type"), [folderCards]);
  const collectionSubtypeOptions = useMemo(() => valuesFor("subtype"), [folderCards]);
  const collectionColorOptions = useMemo(() => valuesFor("color"), [folderCards]);
  const collectionRarityOptions = useMemo(() => RARITIES.filter((item) => folderCards.some((card) => card.rarity === item.value)), [folderCards]);
  const collectionVariantOptions = useMemo(() => VARIANTS.filter((item) => folderCards.some((card) => card.print_variant === item.value)), [folderCards]);
  const matchesValues = (source: string | null, selected: string[]) => !selected.length || selected.some((value) => (source || "").split(" · ").map((item) => item.trim()).includes(value));
  const visibleCards = useMemo(() => folderCards.filter((card) => !filter || normalizeFilterText(card.card_name).includes(normalizeFilterText(filter))).filter((card) => matchesValues(card.edition, collectionEditions)).filter((card) => !collectionRarities.length || collectionRarities.includes(card.rarity || "")).filter((card) => !collectionVariants.length || collectionVariants.includes(card.print_variant)).filter((card) => matchesValues(card.card_type, collectionTypes)).filter((card) => matchesValues(card.subtype, collectionSubtypes)).filter((card) => matchesValues(card.color, collectionColors)).filter((card) => !collectionQuantity || card.quantity === Number(collectionQuantity)).filter((card) => !collectionWanted || card.wanted === (collectionWanted === "yes")).sort((a, b) => { const av = String(a[sortKey] || ""), bv = String(b[sortKey] || ""); const result = sortKey === "external_card_id" ? Number(av) - Number(bv) : collator.compare(av, bv); return sortDirection === "asc" ? result : -result; }), [folderCards, filter, collectionEditions, collectionRarities, collectionVariants, collectionTypes, collectionSubtypes, collectionColors, collectionQuantity, collectionWanted, sortKey, sortDirection]);
  const visibleCardGroups = useMemo(() => groupVaultCards(visibleCards), [visibleCards]);
  const folderCardGroupCount = useMemo(() => groupVaultCards(folderCards).length, [folderCards]);
  const activeFilterCount = collectionEditions.length + collectionRarities.length + collectionVariants.length + collectionTypes.length + collectionSubtypes.length + collectionColors.length + Number(Boolean(collectionQuantity)) + Number(Boolean(collectionWanted));
  const clearCollectionFilters = () => { setFilter(""); setCollectionEditions([]); setCollectionRarities([]); setCollectionVariants([]); setCollectionTypes([]); setCollectionSubtypes([]); setCollectionColors([]); setCollectionQuantity(""); setCollectionWanted(""); };
  const maintenanceCount = (maintenance?.acquired_wanted.length || 0) + (maintenance?.stale_trade_cards.length || 0) + (maintenance?.overdue_loans.length || 0);
  const wantedCards = cards.filter((card) => card.wanted);
  const sortedTradeCards = useMemo(() => [...tradeCards].sort((a, b) => {
    const primary = tradeSortKey === "external_card_id" ? Number(a.external_card_id) - Number(b.external_card_id) : collator.compare(a.card_name, b.card_name);
    return primary || VARIANTS.findIndex((item) => item.value === a.print_variant) - VARIANTS.findIndex((item) => item.value === b.print_variant);
  }), [tradeCards, tradeSortKey]);
  const activeDeck = decks.find((deck) => deck.id === activeDeckId);
  const checklistRows = [
    ...wantedCards.map((card) => ({ key: `wanted-${card.external_card_id}`, group: "Keresem / hiányzik", text: `${card.card_name} · ${card.wanted_quantity} db` })),
    ...decks.flatMap((deck) => deck.cards.filter((card) => card.missing_quantity > 0).map((card) => ({ key: `deck-${deck.id}-${card.id}`, group: "Keresem / hiányzik", text: `${deck.name}: ${card.card_name} · ${card.missing_quantity} db` }))),
    ...tradeCards.filter((card) => card.seeker_count > 0).map((card) => ({ key: `demand-${card.id}`, group: "Mások keresik", text: `${card.card_name} · ${card.seeker_count} érdeklődő` })),
    ...loans.filter((loan) => loan.status === "active").map((loan) => ({ key: `loan-${loan.id}`, group: "Kölcsön", text: `${loan.card_name} → ${loan.borrower_name}${loan.due_at ? ` · ${loan.due_at}` : ""}` })),
  ];
  const areas: [Area, string][] = [["collection", "Gyűjtemény"], ["add", "Lapfelvitel"], ["trade", "Csere"], ["decks", "Paklik & verseny"], ["loans", "Kölcsönadások"]];

  return <section className="container page-shell virtual-vault-page">
    <header className="vault-hero"><button type="button" className="vault-home-button" onClick={() => setArea("dashboard")}><span className="eyebrow">Nightfall Vault</span><h1>Virtuális HKK Mappa</h1><small>Gyűjtemény, csere, paklik és kölcsönadások egy helyen.</small></button>{summary ? <button type="button" className="vault-capacity-compact" onClick={() => setArea("points")}><strong>{summary.vault_unlimited ? "∞ Korlátlan" : `${summary.used_collection_slots} / ${summary.total_collection_capacity}`}</strong><span>Kapacitás</span><small>{summary.vp_balance} VP · részletek</small></button> : null}</header>
    <nav className="vault-tabs" aria-label="Virtuális mappa területei">{areas.map(([id, label]) => <button type="button" className={area === id ? "is-active" : ""} onClick={() => setArea(id)} key={id}>{label}</button>)}</nav>
    {message ? <p className="form-message" role="status">{message}</p> : null}

    {area === "dashboard" && summary ? <section className="vault-content vault-dashboard"><div><p className="eyebrow">Áttekintés</p><h2>Mi történt a mappádban?</h2></div><div className="vault-dashboard-grid">
      {([ ["collection", "Összes saját lap", summary.owned_card_quantity], ["trade", "Új cserelehetőség", unseenMatchCount], ["trade", "Saját lapjaidat keresik", summary.cards_wanted_by_others], ["decks", "Paklikból hiányzik", summary.deck_missing_quantity], ["loans", "Aktív kölcsönadás", summary.active_loan_count] ] as [Area, string, number][]).map(([target, label, value]) => <button key={label} type="button" className={value ? "" : "is-muted"} onClick={() => { setArea(target); if (target === "trade") setTradeView(label.startsWith("Saját") ? "trade" : "matches"); }}><span>{label}</span><strong>{value}</strong><small>Megnyitás →</small></button>)}
    </div>{maintenance && maintenanceCount > 0 && Date.now() >= maintenanceSnoozedUntil ? <section className="vault-maintenance"><div className="vault-maintenance-heading"><div><p className="eyebrow">Gyűjteményed átnézése</p><h3>Néhány gyors ellenőrzés segít naprakészen tartani.</h3></div><button type="button" className="button button-ghost" onClick={snoozeMaintenance}>Később</button></div>{maintenance.acquired_wanted.length ? <details><summary><strong>{maintenance.acquired_wanted.length}</strong> keresett lapod már megvan</summary>{maintenance.acquired_wanted.map((card) => <article key={card.id}><span>{card.card_name}</span><div className="vault-card-actions"><button type="button" className="button button-secondary" onClick={() => void vaultApi.setVaultWanted(card.id, false).then(reload).catch(report)}>Frissítés</button><button type="button" className="button button-ghost" onClick={() => void vaultApi.setVaultWanted(card.id, true, 1).then(reload).catch(report)}>Megtartom a keresést</button></div></article>)}</details> : null}{maintenance.stale_trade_cards.length ? <details><summary><strong>{maintenance.stale_trade_cards.length}</strong> cserelapodat rég ellenőrizted</summary>{maintenance.stale_trade_cards.map((card) => <article key={card.id}><span>{card.card_name}</span><div className="vault-card-actions"><button type="button" className="button button-secondary" onClick={() => void vaultApi.verifyTradeCard(card.id).then(reload).catch(report)}>Még megvan</button><button type="button" className="button button-ghost" onClick={() => void vaultApi.deleteTradeCard(card.id).then(reload).catch(report)}>Már nincs meg</button></div></article>)}</details> : null}{maintenance.overdue_loans.length ? <details><summary><strong>{maintenance.overdue_loans.length}</strong> kölcsönadás visszaadási ideje lejárt</summary>{maintenance.overdue_loans.map((loan) => <article key={loan.id}><span>{loan.card_name} · {loan.borrower_name}</span><div className="vault-card-actions"><button type="button" className="button button-secondary" onClick={() => void vaultApi.returnCardLoan(loan.id).then(reload).catch(report)}>Visszakaptam</button><button type="button" className="button button-ghost" onClick={() => setArea("loans")}>Kölcsönadások megnyitása</button></div></article>)}</details> : null}</section> : null}</section> : null}

    {area === "add" ? <>
      <section className="vault-search-panel"><div><h2>HKK lapfelvitel</h2><p>Kereshetsz lapnévre, kiegészítőre, vagy importálhatsz gyakoriságonként.</p></div><div className="vault-add-mode"><button type="button" className={addMode === "card" ? "is-active" : ""} onClick={() => setAddMode("card")}>Lap keresése</button><button type="button" className={addMode === "edition" ? "is-active" : ""} onClick={() => setAddMode("edition")}>Kiegészítő hozzáadása</button></div>
      {addMode === "card" ? <>
        <form onSubmit={runSearch}><input aria-label="Lap neve" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Lap neve…"/><EditionCombobox editions={editions} value={searchEdition} onChange={setSearchEdition} label="Kiegészítő"/><button className="button button-primary" disabled={busy}>Keresés</button></form>
        {results.length ? <div className="vault-search-results vault-search-card-results">
          <div className="vault-search-results-heading"><strong>{results.length} találat</strong><button type="button" className="button button-ghost" onClick={() => setResults([])}>Találatok törlése</button></div>
          <div className="vault-search-card-grid">{results.map((card) => <article className="vault-card vault-search-card" key={card.external_card_id}>
            <CardImage card={card}/>
            <div className="vault-card-body"><header className="vault-card-title"><strong>{card.card_name}</strong><small>{card.edition}</small></header><CardMeta card={{ ...card, edition: null }}/>
              <div className="vault-card-variant-quantities">{visibleQuantityVariants(card).map((variant) => { const key = `${card.external_card_id}-${variant.value}`; return <label className="vault-variant-quantity" title={variant.title} key={variant.value}><span>{variant.label}</span><select aria-label={`${card.card_name} ${variant.label} példányszáma`} value={resultQuantities[key] ?? (variant.value === "normal" ? 1 : 0)} onChange={(event) => setResultQuantities((current) => ({ ...current, [key]: Number(event.target.value) }))}>{Array.from({ length: MAX_COPIES + 1 }, (_, quantity) => <option key={quantity}>{quantity}</option>)}</select></label>; })}</div>
              {!card.variants_verified ? <details className="vault-unverified-variants"><summary>Más változat hozzáadása · még nem hitelesített</summary><div className="vault-card-variant-quantities">{unverifiedVariants(card).map((variant) => { const key = `${card.external_card_id}-${variant.value}`; return <label className="vault-variant-quantity" title={`${variant.title} · Még nem hitelesített`} key={variant.value}><span>{variant.label}</span><select aria-label={`${card.card_name} ${variant.label} példányszáma`} value={resultQuantities[key] ?? 0} onChange={(event) => setResultQuantities((current) => ({ ...current, [key]: Number(event.target.value) }))}>{Array.from({ length: MAX_COPIES + 1 }, (_, quantity) => <option key={quantity}>{quantity}</option>)}</select></label>; })}</div></details> : null}
              <footer className="vault-card-actions vault-search-card-actions"><button className="button button-secondary" type="button" onClick={() => void addResult(card, "collection")}>Mappába</button><button className="button button-ghost" type="button" onClick={() => void addResult(card, "wanted")}>Keresem</button><button className="button button-ghost" type="button" onClick={() => void addResult(card, "trade")}>Cseremappába</button></footer>
            </div>
          </article>)}</div>
        </div> : null}
      </> : <div className="vault-edition-import"><div className="vault-edition-fields"><EditionCombobox editions={editions} value={selectedEdition} onChange={(id) => void chooseEdition(id)} label="Kiegészítő"/><label>Cél-almappa<select value={selectedFolder || ""} onChange={(event) => setSelectedFolder(Number(event.target.value))}>{summary?.folders.map((folder) => <option key={folder.id} value={folder.id}>{folder.name}</option>)}</select></label><label>Darabszám<select value={editionQuantity} onChange={(event) => setEditionQuantity(Number(event.target.value))}>{Array.from({ length: MAX_COPIES }, (_, index) => index + 1).map((n) => <option key={n}>{n}</option>)}</select></label></div><fieldset className="vault-rarity-options"><legend>Gyakoriságok</legend>{RARITIES.map((item) => <label key={item.value}><input type="checkbox" checked={selectedRarities.includes(item.value)} onChange={(event) => setSelectedRarities((current) => event.target.checked ? [...current, item.value] : current.filter((value) => value !== item.value))}/>{item.label}</label>)}</fieldset>{editionPreview ? <><p><strong>{editionPreview.cards.filter((card) => selectedRarities.includes((card.rarity || "").toLowerCase() as vaultApi.HkkRarity)).length}</strong> lap kerül feldolgozásra.</p><div className="vault-card-actions"><button type="button" className="button button-primary" onClick={() => void importEdition(false)}>Teljes kijelölés hozzáadása</button><button type="button" className="button button-secondary" onClick={() => void importEdition(true)}>Csak a hiányzók</button></div></> : null}</div>}</section>
    </> : null}

    {area === "collection" ? <div className="vault-layout"><aside className="vault-folder-panel"><h2>Almappák</h2>{summary?.folders.map((folder, index) => <div className="vault-folder-row-wrap" key={folder.id}><div className="vault-folder-row"><button type="button" className={`vault-folder ${folder.id === selectedFolder ? "is-active" : ""}`} style={{ borderLeftColor: folder.color || undefined }} aria-label={`${folder.name}, ${folder.used_slots}/${folder.capacity} zseb`} title={`${folder.entry_count} lap · ${folder.copy_count} példány · ${folder.used_slots}/${folder.capacity} zseb`} onClick={() => { setSelectedFolder(folder.id); localStorage.setItem(LAST_FOLDER_KEY, String(folder.id)); }}><strong>{folder.name}</strong><span className="vault-folder-capacity">{folder.used_slots}/{folder.capacity} zseb</span></button><span className="vault-folder-controls"><button type="button" className="vault-icon-button" aria-label={`${folder.name} mozgatása fel`} disabled={busy || index === 0} onClick={() => void moveFolder(folder.id, -1)}>↑</button><button type="button" className="vault-icon-button" aria-label={`${folder.name} mozgatása le`} disabled={busy || index === (summary?.folders.length || 0) - 1} onClick={() => void moveFolder(folder.id, 1)}>↓</button><button type="button" className="vault-icon-button" aria-label={`${folder.name} zsebszámának módosítása`} onClick={() => { setEditingFolderId(folder.id); setEditingFolderCapacity(folder.capacity); }}>✎</button><button type="button" className="vault-icon-button" aria-label={`${folder.name} törlése`} onClick={() => { setFolderToDelete(folder); setFolderDeleteName(""); }}>×</button></span></div>{editingFolderId === folder.id ? <form className="vault-folder-capacity-form" onSubmit={saveFolderCapacity}><label>Zsebek<input type="number" min={folder.used_slots} max={summary?.total_collection_capacity} value={editingFolderCapacity} onChange={(event) => setEditingFolderCapacity(Number(event.target.value))}/></label><button className="button button-secondary" disabled={busy}>Mentés</button><button type="button" className="button button-ghost" onClick={() => setEditingFolderId(undefined)}>Mégse</button></form> : null}</div>)}<form className="vault-folder-create" onSubmit={createFolder}><h3>Új almappa</h3><input name="name" placeholder="Mappa neve" required/><input name="capacity" type="number" min="0" placeholder="Zsebek" required/><input name="color" type="color" defaultValue="#7c3aed"/><button className="button button-secondary" disabled={busy}>Létrehozás</button></form></aside>
      <section className="vault-content">
        <div className="vault-toolbar vault-collection-toolbar">
          <div><h2>{summary?.folders.find((item) => item.id === selectedFolder)?.name || "Gyűjtemény"}</h2><small>{visibleCardGroups.length} / {folderCardGroupCount} lap</small></div>
          <div className="vault-collection-search-row">
            <label>Lap keresése<input aria-label="Gyűjtemény keresése" value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Lap neve…"/></label>
            <MultiValueFilter label="Kiegészítő keresése" options={collectionEditionOptions.map((value) => ({ value }))} selected={collectionEditions} onChange={setCollectionEditions} placeholder="Kiegészítő…"/>
            <button type="button" className="button button-secondary" onClick={() => { setSelectionMode((value) => !value); setSelectedCardIds(new Set()); }}>{selectionMode ? "Kijelölés bezárása" : "Több lap kijelölése"}</button>
          </div>
        </div>
        <details className="vault-filter-disclosure vault-filter-panel">
          <summary>Szűrők{activeFilterCount ? <span>{activeFilterCount} aktív</span> : null}</summary>
          <div className="vault-filter-grid">
            <MultiValueFilter label="Típus" options={collectionTypeOptions.map((value) => ({ value }))} selected={collectionTypes} onChange={setCollectionTypes}/>
            <MultiValueFilter label="Altípus" options={collectionSubtypeOptions.map((value) => ({ value }))} selected={collectionSubtypes} onChange={setCollectionSubtypes}/>
            <MultiValueFilter label="Szín" options={collectionColorOptions.map((value) => ({ value }))} selected={collectionColors} onChange={setCollectionColors}/>
            <MultiValueFilter label="Gyakoriság" options={collectionRarityOptions} selected={collectionRarities} onChange={setCollectionRarities}/>
            <MultiValueFilter label="Változat" options={collectionVariantOptions} selected={collectionVariants} onChange={setCollectionVariants}/>
            <label>Mennyiség<select value={collectionQuantity} onChange={(event) => setCollectionQuantity(event.target.value)}><option value="">Mind</option>{Array.from({ length: MAX_COPIES + 1 }, (_, item) => <option key={item}>{item}</option>)}</select></label>
            <label>Keresem állapot<select value={collectionWanted} onChange={(event) => setCollectionWanted(event.target.value)}><option value="">Mind</option><option value="yes">Keresem</option><option value="no">Nem keresem</option></select></label>
            <label>Rendezés<select value={sortKey} onChange={(event) => setSortKey(event.target.value as SortKey)}><option value="card_name">Név</option><option value="edition">Kiegészítő</option><option value="card_type">Típus</option><option value="subtype">Altípus</option><option value="color">Szín</option><option value="rarity">Gyakoriság</option><option value="external_card_id">HKK ID</option></select></label>
            <button type="button" className="button button-ghost vault-sort-direction" onClick={() => setSortDirection((value) => value === "asc" ? "desc" : "asc")}>{sortDirection === "asc" ? "Növekvő" : "Csökkenő"}</button>
          </div>
          <div className="vault-filter-footer"><span>{visibleCardGroups.length} találat</span>{activeFilterCount || filter ? <button type="button" className="button button-ghost" onClick={clearCollectionFilters}>Összes szűrő törlése</button> : null}</div>
        </details>
        {selectionMode ? <section className="vault-bulk-bar" aria-label="Tömeges lapműveletek"><div className="vault-bulk-actions"><button type="button" className="button button-ghost" onClick={() => setSelectedCardIds(new Set(visibleCards.map((card) => card.id)))}>Láthatók kijelölése ({visibleCards.length})</button><button type="button" className="button button-ghost" onClick={() => setSelectedCardIds(new Set())}>Kijelölés törlése</button><label>Célmappa<select value={bulkTargetFolder || ""} onChange={(event) => setBulkTargetFolder(Number(event.target.value))}><option value="">Válassz…</option>{summary?.folders.map((folder) => <option key={folder.id} value={folder.id}>{folder.name}</option>)}</select></label><button type="button" className="button button-secondary" disabled={!selectedCardIds.size || !bulkTargetFolder || busy} onClick={() => void runBulkAction("move")}>Áthelyezés</button><button type="button" className="button button-secondary" disabled={!selectedCardIds.size || busy} onClick={() => void runBulkAction("trade_add")}>Cseremappába</button><button type="button" className="button button-ghost" disabled={!selectedCardIds.size || busy} onClick={() => void runBulkAction("trade_remove")}>Cseremappából ki</button><button type="button" className="button button-ghost" disabled={!selectedCardIds.size || busy} onClick={() => void runBulkAction("wanted_on")}>Keresem</button><button type="button" className="button button-ghost" disabled={!selectedCardIds.size || busy} onClick={() => void runBulkAction("wanted_off")}>Már nem keresem</button><button type="button" className="button button-danger" disabled={!selectedCardIds.size || busy} onClick={() => void runBulkAction("delete")}>Törlés</button></div><strong className="vault-bulk-status">{selectedCardIds.size} lap kijelölve</strong></section> : null}
        <div className="vault-card-grid vault-collection-grid">{visibleCardGroups.map((group) => {
          const card = group.card;
          const wantedCard = group.variants.find((item) => item.wanted) || group.variants.find((item) => item.print_variant === "normal") || group.variants[0];
          const availableCard = group.variants.find((item) => !item.variant_needs_review && item.print_variant === "normal" && (item.available_listing_quantity ?? item.quantity) > 0) || group.variants.find((item) => !item.variant_needs_review && (item.available_listing_quantity ?? item.quantity) > 0);
          const isWanted = group.variants.some((item) => item.wanted);
          const isInTrade = group.variants.some((item) => item.in_trade);
          const isSelected = group.variants.every((item) => selectedCardIds.has(item.id));
          return <article className={"vault-card" + (isSelected ? " is-selected" : "")} key={group.key} data-variant-count={group.variants.length}>
            {selectionMode ? <label className="vault-card-selector"><input type="checkbox" aria-label={card.card_name + " kijelölése"} checked={isSelected} onChange={() => toggleSelectedGroup(group)}/></label> : null}
            <CardImage card={displayedGroupCard(group)}/>
            <div className="vault-card-body">
              <header className="vault-card-title"><strong title={card.card_name}>{card.card_name}</strong>{card.edition ? <small title={card.edition}>{card.edition}</small> : null}</header>
              <section className="vault-card-properties" aria-label="Tulajdonságok">
                <CardMeta card={{ ...card, edition: null }}/>
                <div className="vault-card-variant-quantities" aria-label={`${card.card_name} változatok`}>{groupVariantDefinitions(group).map((definition) => {
                  const variant = group.variants.find((item) => item.print_variant === definition.value);
                  const status = card.variant_statuses?.[definition.value] || "unknown";
                  const quantities = status === "absent" && variant ? Array.from({ length: variant.quantity + 1 }, (_, quantity) => quantity) : groupAvailableQuantities(group, variant);
                  return <label className={`vault-variant-quantity${status === "absent" ? " is-review-required" : ""}`} title={`${definition.title}${status === "absent" ? " · Felülvizsgálandó korábbi készlet" : ""}`} key={definition.value}><span>{definition.label}{status === "absent" ? " ⚠" : ""}</span><select aria-label={`${card.card_name} ${definition.label} példányszáma`} value={variant?.quantity || 0} disabled={busy} onChange={(event) => void changeGroupVariant(group, definition.value, Number(event.target.value))}>{quantities.map((n) => <option key={n}>{n}</option>)}</select></label>;
                })}</div>
                {group.variants.some((item) => item.variant_needs_review) ? <p className="vault-variant-review-warning" role="status">⚠ Korábban rögzített, nem igazolt változat. A mennyiség megőrizhető vagy csökkenthető, de nem növelhető.</p> : null}
                {groupUnverifiedDefinitions(group).length ? <details className="vault-unverified-variants"><summary>Más változat hozzáadása · még nem hitelesített</summary><div className="vault-card-variant-quantities">{groupUnverifiedDefinitions(group).map((definition) => <label className="vault-variant-quantity" title={`${definition.title} · Még nem hitelesített`} key={definition.value}><span>{definition.label}</span><select aria-label={`${card.card_name} ${definition.label} példányszáma`} value={0} disabled={busy} onChange={(event) => void changeGroupVariant(group, definition.value, Number(event.target.value))}>{groupAvailableQuantities(group).map((n) => <option key={n}>{n}</option>)}</select></label>)}</div></details> : null}
              </section>
              <footer className="vault-card-actions vault-card-direct-actions" aria-label="Lapműveletek">
                <button type="button" aria-label={isWanted ? "Már nem keresem" : "Keresem"} title={isWanted ? "Már nem keresem" : "Keresem"} aria-pressed={isWanted} className={`vault-card-action-icon ${isWanted ? "is-active" : ""}`} onClick={() => void toggleWanted(wantedCard)}><SearchIcon/></button>
                <button type="button" aria-label={isInTrade ? "Cserebeállítások" : "Cserére kínálom"} title={isInTrade ? "Cserebeállítások" : "Cserére kínálom"} aria-pressed={isInTrade} className={`vault-card-action-icon ${isInTrade ? "is-active" : ""}`} disabled={!availableCard} onClick={() => openTradeQuantities(group)}><HandshakeIcon/></button>
                <button type="button" aria-label="Eladás vagy aukció" title="Eladás vagy aukció" className="vault-card-action-icon" disabled={!availableCard} onClick={() => { setListingInventoryKind("collection"); setListingGroup(group); }}><SaleIcon/></button>
                <button type="button" className="vault-card-action-icon is-danger" aria-label={`${card.card_name} törlése`} title="Törlés" onClick={() => { setSelectedCardIds(new Set(group.variants.map((item) => item.id))); setBulkDeleteOpen(true); }}><TrashIcon/></button>
              </footer>
            </div>
          </article>;
        })}</div>
      </section></div> : null}

    {area === "trade" ? <section className="vault-content"><div className="vault-toolbar"><div><h2>Csere</h2><p className="muted">Saját cserelapok, keresett lapok és automatikus találatok.</p></div><a className="button button-secondary" href="/vault/community">Cseremappák</a></div><nav className="vault-subtabs">{([ ["trade","Cseremappám"], ["wanted","Keresem"], ["matches","Találatok"] ] as [TradeView,string][]).map(([id,label]) => <button type="button" className={tradeView === id ? "is-active" : ""} onClick={() => setTradeView(id)} key={id}>{label}{id === "matches" && unseenMatchCount > 0 ? ` (${unseenMatchCount})` : ""}</button>)}</nav>
      {tradeView === "trade" ? <><VaultBulkListingComposer tradeCards={sortedTradeCards} onDone={async (text) => { setMessage(text); await reload(); }}/><div className="vault-trade-sort"><label>Rendezés<select value={tradeSortKey} onChange={(event) => setTradeSortKey(event.target.value as typeof tradeSortKey)}><option value="external_card_id">HKK ID</option><option value="card_name">Név</option></select></label><div className="vault-view-switch" role="group" aria-label="Cseremappa megjelenítése"><button type="button" aria-pressed={tradeDisplayMode === "grid"} className={tradeDisplayMode === "grid" ? "is-active" : ""} onClick={() => { setTradeDisplayMode("grid"); localStorage.setItem("nightfall-vault-card-display-mode", "grid"); }}>Rács</button><button type="button" aria-pressed={tradeDisplayMode === "list"} className={tradeDisplayMode === "list" ? "is-active" : ""} onClick={() => { setTradeDisplayMode("list"); localStorage.setItem("nightfall-vault-card-display-mode", "list"); }}>Lista</button></div></div><div className={`vault-trade-cards ${tradeDisplayMode === "grid" ? "vault-card-grid" : "vault-trade-list"}`}>{sortedTradeCards.map((card) => tradeDisplayMode === "grid" ? <article className="vault-card" key={card.id}><CardImage card={card}/><div className="vault-card-body"><strong>{card.card_name}</strong><CardMeta card={card}/><p>#{card.external_card_id} · {card.quantity} db · {VARIANTS.find((item) => item.value === card.print_variant)?.label}</p>{card.variant_needs_review ? <small className="vault-variant-review-warning">Felülvizsgálandó változat · új hirdetés nem indítható</small> : card.seeker_count ? <button type="button" className="button button-primary" onClick={() => void showSeekers(card)}>Ki keresi ezt a lapot? ({card.seeker_count})</button> : <small>Még senki nem jelölte keresettnek.</small>}<footer className="vault-trade-card-actions"><button type="button" className="button button-secondary is-active" aria-label={`${card.card_name} cserére kínálva`} title="Cserére kínálva" onClick={() => card.seeker_count ? void showSeekers(card) : setMessage("A lap cserére van kínálva. Új érdeklődő esetén értesítést kapsz.")}><HandshakeIcon/> Csere</button><button type="button" className="button button-secondary" aria-label={`${card.card_name} eladása`} title={card.variant_needs_review ? "Felülvizsgálandó változat" : "Eladás vagy aukció"} disabled={card.variant_needs_review} onClick={() => openTradeCardListing(card)}><SaleIcon/> Eladás</button><button type="button" className="button button-ghost is-danger" aria-label="Eltávolítás a cseremappából" disabled={busy} onClick={() => setTradeCardToRemove(card)}><TrashIcon/> Eltávolítás</button></footer></div></article> : <article className="vault-trade-list-row" key={card.id}><CardImagePreview card={card} className="vault-trade-list-image"/><div className="vault-trade-list-info"><strong>{card.card_name}</strong><CardMeta card={card}/><span>#{card.external_card_id} · {card.quantity} db · {VARIANTS.find((item) => item.value === card.print_variant)?.label}</span>{card.variant_needs_review ? <small className="vault-variant-review-warning">Felülvizsgálandó változat · új hirdetés nem indítható</small> : card.seeker_count ? <button type="button" className="button button-primary" onClick={() => void showSeekers(card)}>Ki keresi ezt a lapot? ({card.seeker_count})</button> : <small>Még senki nem jelölte keresettnek.</small>}</div><footer className="vault-trade-list-actions"><button type="button" className="button button-secondary is-active" aria-label={`${card.card_name} cserére kínálva`} title="Cserére kínálva" onClick={() => card.seeker_count ? void showSeekers(card) : setMessage("A lap cserére van kínálva. Új érdeklődő esetén értesítést kapsz.")}><HandshakeIcon/> Csere</button><button type="button" className="button button-secondary" aria-label={`${card.card_name} eladása`} title={card.variant_needs_review ? "Felülvizsgálandó változat" : "Eladás vagy aukció"} disabled={card.variant_needs_review} onClick={() => openTradeCardListing(card)}><SaleIcon/> Eladás</button><button type="button" className="button button-ghost is-danger" aria-label="Eltávolítás a cseremappából" disabled={busy} onClick={() => setTradeCardToRemove(card)}><TrashIcon/> Eltávolítás</button></footer></article>)}</div></> : null}
      {tradeView === "wanted" ? <div className="vault-card-grid">{wantedCards.map((card) => <article className="vault-card" key={card.id}><CardImage card={card}/><div className="vault-card-body"><strong>{card.card_name}</strong><p>{card.wanted_quantity} példány hiányzik</p><button type="button" className="button button-ghost" onClick={() => void vaultApi.setVaultWanted(card.id, false).then(reload).catch(report)}>Eltávolítás a Keresemből</button></div></article>)}</div> : null}
      {tradeView === "matches" ? <>
        <div className="vault-match-grid">{wantedCards.filter((card) => card.offer_count > 0).map((card) => <article className="vault-match-card" key={card.id}><CardImage card={card} className="vault-match-card-image"/><strong>{card.card_name}</strong><span>{card.offer_count} elérhető ajánlat</span><button type="button" className="button button-primary" aria-expanded={selectedMatchCard?.id === card.id} onClick={() => void showMatchingOffers(card)}>Ajánlatok</button></article>)}</div>
        {selectedMatchCard ? <section className="vault-offer-panel" aria-live="polite"><div className="vault-toolbar"><div><h3>Ajánlatok · {selectedMatchCard.card_name}</h3><small>{selectedMatchCard.offer_count} jelzett cserelehetőség</small></div><button type="button" className="button button-ghost" onClick={() => { setSelectedMatchCard(null); setOffers([]); setOffersMessage(""); }}>Bezárás</button></div>{offersLoading ? <p className="empty-state">Ajánlatok betöltése…</p> : null}{offersMessage ? <p className="form-message" role="status">{offersMessage}</p> : null}{!offersLoading && offers.length ? <div className="vault-offers">{offers.map((offer) => <article key={offer.id}><CardImage card={offer} className="vault-offer-card-image"/><div><strong>{offer.card_name}</strong><small>@{offer.owner_username} · {offer.quantity} db · {VARIANTS.find((item) => item.value === offer.print_variant)?.label}</small></div><button type="button" className="button button-primary" onClick={() => void vaultApi.expressTradeInterest(offer.id).then(async () => { setMessage("Az egyeztetés elindult."); await reload(); }).catch(report)}>Érdekel</button></article>)}</div> : null}</section> : null}
        <div className="vault-negotiations">{negotiations.map((trade) => {
          const currentOffer = trade.offer_versions?.find((version) => version.version === trade.current_version);
          const acceptedByCurrentUser = Boolean(user?.id && currentOffer?.accepted_by.includes(user.id));
          const draftCards = new Map<number, PublicTradeCard>();
          currentOffer?.items.forEach((item) => draftCards.set(item.trade_card_id, { ...trade.card, id: item.trade_card_id, trade_card_id: item.trade_card_id, owner_id: item.owner_id, owner_username: "", seeker_count: 0, quantity: item.available_quantity, print_variant: item.print_variant, card_name: item.card_name, external_card_id: item.external_card_id, image_url: item.image_url, edition: item.edition }));
          trade.available_cards?.forEach((card) => draftCards.set(card.id, card));
          const valueByOwner = new Map<number, number>();
          currentOffer?.items.forEach((item) => { if (item.estimated_unit_price !== null) valueByOwner.set(item.owner_id, (valueByOwner.get(item.owner_id) || 0) + item.estimated_unit_price * item.quantity); });
          const missingPrice = Boolean(currentOffer?.items.some((item) => item.estimated_unit_price === null));
          const currentOfferCreatedByCurrentUser = currentOffer?.created_by_id === user?.id;
          return <article className="vault-negotiation" key={trade.id}><div><strong>{trade.card.card_name}</strong><small>{trade.requester_display_name} ↔ {trade.owner_display_name} · {trade.status === "open" ? `egyeztetés · #${trade.current_version} ajánlat` : trade.status === "cancelled" ? "visszavonva / elutasítva" : "lezárt"}</small></div>
            {currentOffer ? <section className="vault-trade-offer" aria-label={`Csereajánlat ${trade.current_version}. verzió`}><div className="vault-trade-offer-sides">{([trade.requester_id, trade.owner_id] as number[]).map((ownerId) => <div key={ownerId}><h4>{ownerId === trade.requester_id ? trade.requester_display_name : trade.owner_display_name} adja</h4>{currentOffer.items.filter((item) => item.owner_id === ownerId).map((item) => <p key={item.id}><strong>{item.card_name}</strong><span>{item.quantity} db · {VARIANTS.find((variant) => variant.value === item.print_variant)?.label}{item.estimated_unit_price !== null ? ` · kb. ${item.estimated_unit_price.toLocaleString("hu-HU")} Ft/db` : " · nincs Árfigyelő-adat"}</span></p>)}<strong>Becsült részösszeg: {(valueByOwner.get(ownerId) || 0).toLocaleString("hu-HU")} Ft{missingPrice ? " + ismeretlen árú lapok" : ""}</strong></div>)}</div><small>{currentOffer.accepted_by.length}/2 fél elfogadta ezt a verziót. Az értékbecslés tájékoztató jellegű.</small></section> : null}
            {trade.status === "open" && editingTradeId === trade.id ? <section className="vault-counter-offer"><h4>Ellenajánlat összeállítása</h4><p className="muted">Mindkét oldal publikus cserelapjaiból állítsd össze a következő verziót.</p>{Array.from(draftCards.values()).map((card) => { const available = Math.max(card.available_listing_quantity ?? card.quantity, offerDraft[card.id] || 0); return <label key={card.id}><span>{card.card_name} · {card.owner_id === user?.id ? "én adom" : "kérem"}</span><select aria-label={`${card.card_name} ajánlati mennyisége`} value={offerDraft[card.id] || 0} onChange={(event) => setOfferDraft((current) => ({ ...current, [card.id]: Number(event.target.value) }))}>{Array.from({ length: available + 1 }, (_, quantity) => <option key={quantity}>{quantity}</option>)}</select></label>; })}<div className="vault-card-actions"><button type="button" className="button button-ghost" onClick={() => setEditingTradeId(null)}>Mégse</button><button type="button" className="button button-primary" disabled={busy} onClick={() => void saveCounterOffer(trade)}>Ellenajánlat küldése</button></div></section> : null}
            {trade.offer_versions.length > 1 ? <details className="vault-offer-history"><summary>Ajánlatelőzmények ({trade.offer_versions.length})</summary>{trade.offer_versions.slice().reverse().map((version) => <article key={version.id}><strong>#{version.version} ajánlat</strong><small>{new Date(version.created_at).toLocaleString("hu-HU")} · {version.accepted_by.length}/2 elfogadás</small><ul>{version.items.map((item) => <li key={item.id}>{item.card_name} · {item.quantity} db · {VARIANTS.find((variant) => variant.value === item.print_variant)?.label}</li>)}</ul></article>)}</details> : null}
            {trade.status === "open" ? <div className="vault-trade-offer-actions"><button type="button" className="button button-secondary" onClick={() => beginCounterOffer(trade)}>Ellenajánlat</button><button type="button" className="button button-primary" disabled={busy || acceptedByCurrentUser || !currentOffer} onClick={() => void acceptTradeOffer(trade)}>{acceptedByCurrentUser ? "Elfogadva" : `#${trade.current_version} ajánlat elfogadása`}</button><button type="button" className="button button-ghost is-danger" disabled={busy} onClick={() => void cancelTradeOffer(trade)}>{currentOfferCreatedByCurrentUser ? "Ajánlat visszavonása" : "Ajánlat elutasítása"}</button></div> : null}
            <div className="vault-messages">{trade.messages.map((item) => <p key={item.id}><strong>{item.sender_display_name}</strong> {item.message}</p>)}</div>{trade.status === "open" ? <form onSubmit={(event) => { event.preventDefault(); const form=event.currentTarget; const text=String(new FormData(form).get("message")||""); void vaultApi.postTradeMessage(trade.id,text).then(() => { form.reset(); return reload(); }).catch(report); }}><input name="message" placeholder="Üzenet az egyeztetéshez…" required/><button className="button button-secondary">Küldés</button></form> : null}</article>;
        })}</div>
      </> : null}
    </section> : null}

    {area === "decks" ? <section className="vault-content"><div className="vault-toolbar"><div><h2>Paklik & verseny</h2><small>A szükséges mennyiséget az összes saját változatból számoljuk.</small></div><form className="vault-inline-form" onSubmit={createDeck}><input name="name" placeholder="Új pakli neve" required/><button className="button button-primary">Létrehozás</button></form></div><div className="vault-deck-layout"><aside className="vault-deck-list">{decks.map((deck) => <button type="button" className={deck.id === activeDeckId ? "is-active" : ""} onClick={() => setActiveDeckId(deck.id)} key={deck.id}><strong>{deck.name}</strong><small>{deck.owned_quantity}/{deck.total_required_quantity} megvan · {deck.missing_quantity} hiányzik · {deck.available_trade_quantity} cserével elérhető</small></button>)}</aside><div>{activeDeck ? <><div className="vault-deck-heading"><h3>{activeDeck.name}</h3><button type="button" className="button button-ghost" onClick={() => void vaultApi.deleteDeck(activeDeck.id).then(reload).catch(report)}>Pakli törlése</button></div><form className="vault-deck-search" onSubmit={runDeckSearch}><input aria-label="Paklilap keresése" value={deckSearch} onChange={(event) => setDeckSearch(event.target.value)} placeholder="Lap neve…"/><EditionCombobox editions={editions} value={deckEdition} onChange={setDeckEdition} label="Kiegészítő"/><button className="button button-secondary">Keresés</button></form>{deckResults.length ? <div className="vault-search-results"><div className="vault-search-results-heading"><strong>{deckResults.length} találat</strong><button type="button" className="button button-ghost" onClick={() => setDeckResults([])}>Találatok törlése</button></div>{deckResults.map((card) => <article className="vault-search-result" key={card.external_card_id}><CardImage card={card}/><strong>{card.card_name}</strong><div className="vault-card-actions"><select aria-label={`${card.card_name} szükséges mennyisége`} value={resultQuantities[`deck-${card.external_card_id}`] || 1} onChange={(event) => setResultQuantities((current) => ({ ...current, [`deck-${card.external_card_id}`]: Number(event.target.value) }))}>{[1,2,3,4].map((n) => <option key={n}>{n}</option>)}</select><button type="button" className="button button-primary" onClick={() => void addToDeck(card)}>Pakliba</button></div></article>)}</div> : null}<div className="vault-deck-cards">{activeDeck.cards.map((card) => <article key={card.id}><div><strong>{card.card_name}</strong><small>{card.owned_quantity}/{card.required_quantity} saját · {card.missing_quantity} hiányzik{card.available_trade_quantity ? ` · ${card.available_trade_quantity} elérhető cserében` : ""}</small></div><div className="vault-deck-card-actions"><select aria-label={`${card.card_name} paklimennyisége`} value={card.required_quantity} onChange={(event) => void vaultApi.updateDeckCard(activeDeck.id, card.id, Number(event.target.value)).then(reload).catch(report)}>{[1,2,3,4].map((n) => <option key={n}>{n}</option>)}</select>{card.available_trade_quantity ? <button type="button" className="button button-secondary" onClick={() => void vaultApi.listDeckCardOffers(activeDeck.id, card.id).then((items) => { setOffers(items); setArea("trade"); setTradeView("matches"); }).catch(report)}>Cserelehetőségek</button> : null}</div><button type="button" className="button button-ghost" onClick={() => void vaultApi.deleteDeckCard(activeDeck.id, card.id).then(reload).catch(report)}>Törlés</button></article>)}</div></> : <p>Hozd létre az első paklidat.</p>}</div></div><section className="vault-checklist"><h3>Versenylista készítése</h3>{["Keresem / hiányzik","Mások keresik","Kölcsön"].map((group) => <div key={group}><h4>{group}</h4>{checklistRows.filter((row) => row.group === group).length ? checklistRows.filter((row) => row.group === group).map((row) => <label key={row.key}><input type="checkbox" checked={Boolean(checklist[row.key])} onChange={() => toggleChecklist(row.key)}/><span>{row.text}</span></label>) : <small>Nincs tétel.</small>}</div>)}</section><details className="vault-post-tournament"><summary>Verseny utáni rendezés</summary><p className="muted">Csak azt frissítsd, ami a versenyen ténylegesen megváltozott.</p><div className="vault-post-tournament-grid"><section><h4>Megszereztem</h4>{wantedCards.length ? wantedCards.map((card) => <article key={card.id}><span>{card.card_name}</span><button type="button" className="button button-secondary" disabled={card.quantity >= 3} onClick={() => void vaultApi.updateVaultCard(card.id, { quantity: Math.min(card.quantity + 1, 3) }).then(reload).catch(report)}>+1 példány</button></article>) : <small>Nincs keresett lap.</small>}</section><section><h4>Elcseréltem</h4>{tradeCards.length ? tradeCards.map((card) => <article key={card.id}><span>{card.card_name}</span><button type="button" className="button button-ghost" onClick={() => void removeTradeCard(card)}>Cseremappából ki</button></article>) : <small>Nincs cserelap.</small>}</section><section><h4>Visszakaptam</h4>{loans.filter((loan) => loan.status === "active").length ? loans.filter((loan) => loan.status === "active").map((loan) => <article key={loan.id}><span>{loan.card_name}</span><button type="button" className="button button-secondary" onClick={() => void vaultApi.returnCardLoan(loan.id).then(reload).catch(report)}>Visszakaptam</button></article>) : <small>Nincs aktív kölcsön.</small>}</section><section><h4>Már nem keresem</h4>{wantedCards.length ? wantedCards.map((card) => <article key={card.id}><span>{card.card_name}</span><button type="button" className="button button-ghost" onClick={() => void vaultApi.setVaultWanted(card.id, false).then(reload).catch(report)}>Eltávolítás</button></article>) : <small>Nincs keresett lap.</small>}</section></div></details></section> : null}

    {area === "loans" ? <section className="vault-content"><div className="vault-toolbar"><div><h2>Kölcsönadások</h2><small>A kölcsönadott lapnak nem kell előre szerepelnie a gyűjteményben.</small></div><button type="button" className="button button-primary" onClick={() => setLoanComposerOpen((open) => !open)}>{loanComposerOpen ? "Rögzítés bezárása" : "Több lap kölcsönadása"}</button></div>
      {loanComposerOpen ? <form className="vault-loan-composer" onSubmit={saveStandaloneLoans}><div className="vault-loan-search"><input aria-label="Kölcsönadott lap keresése" value={loanSearch} onChange={(event) => setLoanSearch(event.target.value)} placeholder="Lap neve…"/><EditionCombobox editions={editions} value={loanEdition} onChange={setLoanEdition} label="Kiegészítő"/><button type="button" className="button button-secondary" onClick={() => void runLoanSearch()}>Keresés</button></div>
        {loanResults.length ? <div className="vault-loan-results">{loanResults.map((card) => <article key={card.external_card_id}><div><strong>{card.card_name}</strong><CardMeta card={card}/></div><select aria-label={`${card.card_name} kölcsönadott változata`} value={loanResultVariants[card.external_card_id] || "normal"} onChange={(event) => setLoanResultVariants((current) => ({ ...current, [card.external_card_id]: event.target.value as vaultApi.PrintVariant }))}>{selectableVariants(card).map((variant) => <option key={variant.value} value={variant.value}>{variant.label}{!card.variants_verified && variant.value !== "normal" ? " · még nem hitelesített" : ""}</option>)}</select><select aria-label={`${card.card_name} kölcsönadott példányszáma`} value={loanResultQuantities[card.external_card_id] || 1} onChange={(event) => setLoanResultQuantities((current) => ({ ...current, [card.external_card_id]: Number(event.target.value) }))}>{Array.from({ length: MAX_COPIES }, (_, index) => <option key={index + 1}>{index + 1}</option>)}</select><button type="button" className="button button-secondary" onClick={() => addLoanDraft(card)}>Hozzáadás</button></article>)}</div> : null}
        {loanDraft.length ? <div className="vault-loan-draft"><h3>Kölcsönadandó lapok</h3>{loanDraft.map((card) => <article key={`${card.external_card_id}-${card.print_variant}`}><span><strong>{card.card_name}</strong> · {VARIANTS.find((variant) => variant.value === card.print_variant)?.label}</span><select aria-label={`${card.card_name} kiválasztott mennyisége`} value={card.quantity} onChange={(event) => setLoanDraft((current) => current.map((item) => item.external_card_id === card.external_card_id && item.print_variant === card.print_variant ? { ...item, quantity: Number(event.target.value) } : item))}>{Array.from({ length: MAX_COPIES }, (_, index) => <option key={index + 1}>{index + 1}</option>)}</select><button type="button" className="vault-icon-button" aria-label={`${card.card_name} eltávolítása`} onClick={() => setLoanDraft((current) => current.filter((item) => item !== card))}>×</button></article>)}</div> : null}
        <div className="vault-loan-fields"><label>Kölcsönvevő<input value={standaloneLoanForm.borrower_name} onChange={(event) => setStandaloneLoanForm((current) => ({ ...current, borrower_name: event.target.value }))} required/></label><label>Kölcsönadás<input type="date" value={standaloneLoanForm.lent_at} onChange={(event) => setStandaloneLoanForm((current) => ({ ...current, lent_at: event.target.value }))} required/></label><label>Visszaadás<input type="date" min={standaloneLoanForm.lent_at} value={standaloneLoanForm.due_at} onChange={(event) => setStandaloneLoanForm((current) => ({ ...current, due_at: event.target.value }))}/></label><label>Megjegyzés<input value={standaloneLoanForm.note} onChange={(event) => setStandaloneLoanForm((current) => ({ ...current, note: event.target.value }))}/></label></div><button className="button button-primary" disabled={busy || !loanDraft.length}>{loanDraft.length} lap kölcsönadása</button>
      </form> : null}
      <div className="vault-loan-list">{loans.map((loan) => <article className={loan.status === "active" ? "is-active" : ""} key={loan.id}><CardImage card={{ external_card_id: loan.external_card_id, card_name: loan.card_name, image_url: null }} className="vault-loan-card-image"/><div><strong>{loan.card_name}</strong><small>{loan.quantity} db · {VARIANTS.find((item) => item.value === loan.print_variant)?.label}</small></div><div><span>{loan.borrower_name}</span><small>{loan.lent_at}{loan.due_at ? ` → ${loan.due_at}` : ""}{loan.note ? ` · ${loan.note}` : ""}</small></div>{loan.status === "active" ? <button type="button" className="button button-secondary" onClick={() => void vaultApi.returnCardLoan(loan.id).then(reload).catch(report)}>Visszakaptam</button> : <span>Lezárva</span>}</article>)}</div></section> : null}

    {area === "points" && summary ? <section className="vault-content"><h2>VP és kapacitás</h2><div className="vault-stat-grid"><article><span>VP-egyenleg</span><strong>{summary.vp_balance}</strong></article><article><span>Gyűjtőkapacitás</span><strong>{summary.vault_unlimited ? "∞" : summary.total_collection_capacity}</strong></article><article><span>Cseremappa</span><strong>{summary.vault_unlimited ? "∞" : summary.trade_capacity}</strong></article></div><div className="vault-points-guide"><h3>Hogyan szerezhetsz VP-t?</h3><ul><li><strong>+15 VP</strong><span>Sikeresen lezárt vásárlás után</span></li><li><strong>+15 VP</strong><span>Sikeresen lezárt fix áras eladás után</span></li><li><strong>+5 VP</strong><span>Lezárt csere értékeléséért</span></li><li><strong>100 VP</strong><span>+50 gyűjtőzsebre váltható</span></li></ul></div>{!summary.vault_unlimited ? <button type="button" className="button button-primary" disabled={summary.vp_balance < 100} onClick={() => void vaultApi.buyVaultCapacity().then(reload).catch(report)}>+50 zseb vásárlása · 100 VP</button> : null}<div className="vault-ledger">{points?.items.map((item) => <p key={item.id}><span>{item.reason}</span><strong className={item.amount > 0 ? "is-positive" : ""}>{item.amount > 0 ? "+" : ""}{item.amount} VP</strong></p>)}</div></section> : null}

    {bulkDeleteOpen ? <div className="vault-confirm-backdrop"><section className="vault-confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="bulk-delete-title"><h2 id="bulk-delete-title">Kijelölt lapok törlése</h2><p>A kijelölt <strong>{selectedCardIds.size} lapbejegyzés</strong> végleg törlődik a gyűjteményből. A cseremappa külön rekordjai nem változnak.</p><div className="vault-card-actions"><button type="button" className="button button-ghost" onClick={() => setBulkDeleteOpen(false)}>Mégse</button><button type="button" className="button button-danger" disabled={busy} onClick={() => void confirmBulkDelete()}>Kijelölt lapok törlése</button></div></section></div> : null}
    {tradeCardToRemove ? <div className="vault-confirm-backdrop"><section className="vault-confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="trade-remove-title"><h2 id="trade-remove-title">Eltávolítás a cseremappából</h2><p>A(z) <strong>{tradeCardToRemove.card_name}</strong> {VARIANTS.find((item) => item.value === tradeCardToRemove.print_variant)?.label} változata eltűnik a publikus cseremappádból.</p><p>A saját gyűjteményedben lévő példányok megmaradnak.</p><div className="vault-card-actions"><button type="button" className="button button-ghost" disabled={busy} onClick={() => setTradeCardToRemove(null)}>Mégse</button><button type="button" className="button button-danger" disabled={busy} onClick={() => void confirmTradeCardRemoval()}>Eltávolítás</button></div></section></div> : null}
    {folderToDelete ? <div className="vault-confirm-backdrop"><section className="vault-confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="folder-delete-title"><h2 id="folder-delete-title">Almappa végleges törlése</h2><p><strong>{folderToDelete.name}</strong> · {folderToDelete.used_slots} lapbejegyzés</p><p>A mappa és teljes tartalma végleg törlődik. A kölcsönzési előzmények megmaradnak.</p><label>A megerősítéshez írd be pontosan: <strong>{folderToDelete.name}</strong><input autoFocus value={folderDeleteName} onChange={(event) => setFolderDeleteName(event.target.value)}/></label><div className="vault-card-actions"><button type="button" className="button button-ghost" onClick={() => setFolderToDelete(null)}>Mégse</button><button type="button" className="button button-danger" disabled={busy || folderDeleteName !== folderToDelete.name} onClick={() => void confirmFolderDelete()}>Mappa és {folderToDelete.used_slots} lap törlése</button></div></section></div> : null}
    {tradeGroup ? <div className="vault-confirm-backdrop"><form className="vault-confirm-dialog vault-trade-quantity-dialog" role="dialog" aria-modal="true" onSubmit={saveTradeQuantities}><h2>Csere mennyisége · {tradeGroup.card.card_name}</h2><p className="muted">Add meg változatonként, hány példányt kínálsz cserére. A 0 eltávolítja a változatot a cseremappából.</p>{tradeGroup.variants.map((card) => <label key={card.id}><span>{VARIANTS.find((variant) => variant.value === card.print_variant)?.label} <small>{card.quantity} saját</small></span><select aria-label={`${card.card_name} ${card.print_variant} csere mennyisége`} value={tradeQuantities[card.id] || 0} onChange={(event) => setTradeQuantities((current) => ({ ...current, [card.id]: Number(event.target.value) }))}>{Array.from({ length: card.quantity + 1 }, (_, quantity) => <option key={quantity}>{quantity}</option>)}</select></label>)}<div className="vault-card-actions"><button type="button" className="button button-ghost" onClick={() => setTradeGroup(null)}>Mégse</button><button className="button button-primary" disabled={busy}>Cseremappa frissítése</button></div></form></div> : null}
    {listingGroup ? <div className="vault-confirm-backdrop"><section className="vault-confirm-dialog vault-listing-dialog" role="dialog" aria-modal="true" aria-labelledby="vault-listing-title"><h2 id="vault-listing-title">Meghirdetés · {listingGroup.card.card_name}</h2><ListingComposer compact source={{ inventoryKind: listingInventoryKind, externalCardId: listingGroup.card.external_card_id, cardName: listingGroup.card.card_name, edition: listingGroup.card.edition, imageUrl: listingGroup.card.image_url, variants: listingGroup.variants }} onClose={() => setListingGroup(null)} onDone={() => { setListingGroup(null); setMessage("A hirdetés megjelent a piactéren."); void reload(); }}/></section></div> : null}
    {loanCard ? <div className="vault-confirm-backdrop"><form className="vault-confirm-dialog vault-loan-dialog" role="dialog" aria-modal="true" onSubmit={saveLoan}><h2>Kölcsönadás · {loanCard.card_name}</h2><label>Kölcsönvevő neve<input value={loanForm.borrower_name} onChange={(event) => setLoanForm((current) => ({ ...current, borrower_name: event.target.value }))} required/></label><label>Mennyiség<select value={loanForm.quantity} onChange={(event) => setLoanForm((current) => ({ ...current, quantity: Number(event.target.value) }))}>{Array.from({ length: loanCard.quantity }, (_, index) => index + 1).map((n) => <option key={n}>{n}</option>)}</select></label><label>Kölcsönadás dátuma<input type="date" value={loanForm.lent_at} onChange={(event) => setLoanForm((current) => ({ ...current, lent_at: event.target.value }))} required/></label><label>Tervezett visszaadás<input type="date" min={loanForm.lent_at} value={loanForm.due_at} onChange={(event) => setLoanForm((current) => ({ ...current, due_at: event.target.value }))}/></label><label>Megjegyzés<textarea value={loanForm.note} onChange={(event) => setLoanForm((current) => ({ ...current, note: event.target.value }))}/></label><div className="vault-card-actions"><button type="button" className="button button-ghost" onClick={() => setLoanCard(null)}>Mégse</button><button className="button button-primary" disabled={busy}>Kölcsönadás mentése</button></div></form></div> : null}
    {seekerCard ? <div className="vault-confirm-backdrop"><section className="vault-confirm-dialog" role="dialog" aria-modal="true"><h2>Ki keresi? · {seekerCard.card_name}</h2>{seekers.length ? seekers.map((user) => <article className="vault-seeker-row" key={user.user_id}><div><strong>{user.display_name}</strong><small>@{user.username} · {user.wanted_quantity} db</small></div><a className="button button-primary" href={`/users/${encodeURIComponent(user.username)}`}>Profil megnyitása</a></article>) : <p>Nincs megjeleníthető kereső.</p>}<button type="button" className="button button-ghost" onClick={() => setSeekerCard(null)}>Bezárás</button></section></div> : null}
  </section>;
}
