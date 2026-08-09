import { ChangeEvent, FormEvent, useEffect, useState } from "react";
import { Link } from "react-router";
import { activateAuction, cancelAuction, createAuction, deleteAuctionImage, getAuction, listMyAuctions, listMyBidAuctions, setAuctionCoverImage, updateAuction, uploadAuctionImage, type Auction, type AuctionCondition, type MyBidAuction } from "../api/auctions";
import { ApiError, apiAssetUrl } from "../api/client";
import { AuctionCard } from "../components/AuctionCard";
import { SafeImage } from "../components/SafeImage";
import { FileImagePreview } from "../components/FileImagePreview";
import { EmptyState, ErrorState, LoadingState } from "../components/AsyncStates";
import { categories } from "../data/content";
import { CARD_CONDITIONS, getCardCondition } from "../data/cardConditions";
import { CardConditionHelp } from "../components/CardConditionGuide";
import { formatAuctionStatus, formatMoney, formatRemainingTime } from "../utils/format";
import { useNotifications } from "../NotificationContext";
import { useAuctionRealtime } from "../AuctionRealtimeContext";
import { useAuth } from "../AuthContext";

const MAX_AUCTION_IMAGES = 5;
const MAX_IMAGE_FILE_SIZE_BYTES = 20 * 1024 * 1024;
const newCreationKey = () => typeof crypto !== "undefined" && "randomUUID" in crypto
  ? crypto.randomUUID()
  : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (character) => {
      const random = Math.floor(Math.random() * 16);
      return (character === "x" ? random : (random & 0x3) | 0x8).toString(16);
    });
const DRAFT_CREATION_KEY_STORAGE = "nightfall-auction-draft-creation-key";
const getDraftCreationKey = () => {
  const storedKey = typeof sessionStorage !== "undefined" ? sessionStorage.getItem(DRAFT_CREATION_KEY_STORAGE) : null;
  if (storedKey) return storedKey;
  const key = newCreationKey();
  if (typeof sessionStorage !== "undefined") sessionStorage.setItem(DRAFT_CREATION_KEY_STORAGE, key);
  return key;
};
const rotateDraftCreationKey = () => {
  const key = newCreationKey();
  if (typeof sessionStorage !== "undefined") sessionStorage.setItem(DRAFT_CREATION_KEY_STORAGE, key);
  return key;
};

const editableFields = [
  "név",
  "kategória",
  "állapot",
  "kép",
  "lejárati dátum",
  "5 perces szabály ki/be",
  "villámár ki/be",
  "leírás",
];

const lockedFields = [
  "kezdőár",
  "licitlépcső",
  "már megadott villámár összege",
];

const parseCondition = (value: FormDataEntryValue | null): AuctionCondition =>
  CARD_CONDITIONS.find((item) => item.value === String(value))?.value ?? "NM";

function toCardAuction(auction: Auction) {
  const coverImage = auction.images.find((image) => image.is_cover) ?? auction.images[0];
  return {
    id: auction.id,
    title: auction.title,
    type: auction.category,
    price: formatMoney(auction.current_price ?? auction.starting_price),
    step: formatMoney(auction.bid_increment),
    time: formatRemainingTime(auction.ends_at, auction.status),
    endsAt: auction.ends_at,
    status: auction.status,
    condition: auction.condition,
    fiveMinuteRuleEnabled: auction.five_minute_rule_enabled,
    sellerName: "Te",
    sellerRating: auction.seller_average_rating ?? null,
    sellerReviewCount: auction.seller_review_count ?? 0,
    buyNowPrice: auction.buy_now_enabled ? auction.buy_now_price : null,
    isClosed: ["ended", "sold", "unsold", "cancelled", "suspended"].includes(auction.status),
    imageUrl: coverImage ? apiAssetUrl(coverImage.list_url ?? coverImage.thumbnail_url ?? coverImage.url) : undefined,
    statusLabel: formatAuctionStatus(auction.status),
    bidCount: auction.bid_count ?? 0,
  };
}

function openFacebookShare(auctionId: number) {
  const auctionUrl = new URL(`/auctions/${auctionId}`, window.location.origin).href;
  const shareUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(auctionUrl)}`;
  window.open(shareUrl, "nightfall-facebook-share", "popup=yes,width=720,height=640,noopener,noreferrer");
}

function localDateTimeToIso(value: FormDataEntryValue | null) {
  const textValue = String(value ?? "");
  if (!textValue) {
    throw new Error("A kezdési és zárási idő megadása kötelező.");
  }
  return new Date(textValue).toISOString();
}

function isoToLocalDateTime(value: string) {
  const date = new Date(value);
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return localDate.toISOString().slice(0, 16);
}

function validateAuctionDates(startsAtValue: FormDataEntryValue | null, endsAtValue: FormDataEntryValue | null) {
  const startsAt = new Date(String(startsAtValue ?? ""));
  const endsAt = new Date(String(endsAtValue ?? ""));
  const currentMinute = new Date();
  currentMinute.setSeconds(0, 0);
  const errors: { startsAt?: string; endsAt?: string } = {};

  if (Number.isNaN(startsAt.getTime())) errors.startsAt = "Adj meg érvényes kezdési dátumot.";
  else if (startsAt < currentMinute) errors.startsAt = "A kezdési dátum nem lehet korábbi a jelenlegi időpontnál.";

  if (Number.isNaN(endsAt.getTime())) errors.endsAt = "Adj meg érvényes lejárati dátumot.";
  else if (!errors.startsAt && endsAt <= startsAt) errors.endsAt = "A lejárati dátumnak későbbinek kell lennie a kezdési dátumnál.";

  return errors;
}

function validateAuctionFields(formData: FormData) {
  const errors: Record<string, string> = {};
  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const startingPrice = Number(formData.get("starting_price"));
  const bidIncrement = Number(formData.get("bid_increment"));
  const buyNowEnabled = formData.get("buy_now_enabled") === "on";
  const buyNowPrice = Number(formData.get("buy_now_price"));

  if (title.length < 2) errors.title = "A név legalább 2 karakter hosszú legyen.";
  else if (title.length > 180) errors.title = "A név legfeljebb 180 karakter hosszú lehet.";
  if (description.length < 10) errors.description = "A leírás legalább 10 karakter hosszú legyen.";
  else if (description.length > 5000) errors.description = "A leírás legfeljebb 5000 karakter hosszú lehet.";
  if (!Number.isFinite(startingPrice) || startingPrice < 0) errors.starting_price = "A kezdőár legalább 0 Ft legyen.";
  if (!Number.isFinite(bidIncrement) || bidIncrement <= 0) errors.bid_increment = "A licitlépcső 0 Ft-nál nagyobb összeg legyen.";
  if (buyNowEnabled && (!Number.isFinite(buyNowPrice) || buyNowPrice <= startingPrice)) errors.buy_now_price = "A villámárnak nagyobbnak kell lennie a kezdőárnál.";
  if (formData.get("seller_declaration_accepted") !== "on") errors.seller_declaration_accepted = "Az aukció létrehozásához el kell fogadnod az értékesítői nyilatkozatot.";
  return errors;
}

function validateAuctionEditFields(formData: FormData) {
  const errors: Record<string, string> = {};
  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const category = String(formData.get("category") ?? "");
  const condition = String(formData.get("condition") ?? "");

  if (title.length < 2) errors.title = "A név legalább 2 karakter hosszú legyen.";
  else if (title.length > 180) errors.title = "A név legfeljebb 180 karakter hosszú lehet.";
  if (description.length < 10) errors.description = "A leírás legalább 10 karakter hosszú legyen.";
  else if (description.length > 5000) errors.description = "A leírás legfeljebb 5000 karakter hosszú lehet.";
  if (!categories.some((item) => item === category)) errors.category = "Válassz érvényes kategóriát.";
  if (!CARD_CONDITIONS.some((item) => item.value === condition)) errors.condition = "Válassz érvényes állapotot.";
  return errors;
}

function validateAuctionEditDates(formData: FormData, auction: Auction) {
  const isDraft = auction.status === "draft";
  const startsAt = isDraft ? new Date(String(formData.get("starts_at") ?? "")) : new Date(auction.starts_at);
  const endsAt = new Date(String(formData.get("ends_at") ?? ""));
  const currentMinute = new Date();
  currentMinute.setSeconds(0, 0);
  const errors: { startsAt?: string; endsAt?: string } = {};

  if (Number.isNaN(startsAt.getTime())) errors.startsAt = "Adj meg érvényes kezdési dátumot.";
  else if (isDraft && startsAt < currentMinute) errors.startsAt = "A kezdési dátum nem lehet korábbi a jelenlegi időpontnál.";
  if (Number.isNaN(endsAt.getTime())) errors.endsAt = "Adj meg érvényes lejárati dátumot.";
  else if (endsAt <= currentMinute) errors.endsAt = "A lejárati dátumnak későbbinek kell lennie a jelenlegi időpontnál.";
  else if (!errors.startsAt && endsAt <= startsAt) errors.endsAt = "A lejárati dátumnak későbbinek kell lennie a kezdési dátumnál.";
  return errors;
}

export function AccountPage({ section }: { section: "bids" | "auctions" | "create" }) {
  const { user } = useAuth();
  const hasActiveVip = user?.role === "admin" || Boolean(user?.is_vip && user.vip_expires_at && new Date(user.vip_expires_at).getTime() > Date.now());
  const { subscribe: subscribeNotifications, showToast } = useNotifications();
  const { subscribe: subscribeAuctionUpdates } = useAuctionRealtime();
  const [myAuctions, setMyAuctions] = useState<Auction[]>([]);
  const [myBidAuctions, setMyBidAuctions] = useState<MyBidAuction[]>([]);
  const [isLoadingMyAuctions, setIsLoadingMyAuctions] = useState(true);
  const [isLoadingMyBids, setIsLoadingMyBids] = useState(true);
  const [myAuctionsError, setMyAuctionsError] = useState("");
  const [myBidsError, setMyBidsError] = useState("");
  const [auctionImages, setAuctionImages] = useState<File[]>([]);
  const [coverImageIndex, setCoverImageIndex] = useState(0);
  const [imageMessage, setImageMessage] = useState("");
  const [formMessage, setFormMessage] = useState("");
  const [auctionDateErrors, setAuctionDateErrors] = useState<{ startsAt?: string; endsAt?: string }>({});
  const [auctionFieldErrors, setAuctionFieldErrors] = useState<Record<string, string>>({});
  const [isCreatingAuction, setIsCreatingAuction] = useState(false);
  const [createDraftId, setCreateDraftId] = useState<number | null>(null);
  const [createDraftImageCount, setCreateDraftImageCount] = useState(0);
  const [creationKey, setCreationKey] = useState(getDraftCreationKey);
  const [createBuyNowPrice, setCreateBuyNowPrice] = useState("");
  const [createBuyNowEnabled, setCreateBuyNowEnabled] = useState(false);
  const [uploadProgress, setUploadProgress] = useState("");
  const [editingAuctionId, setEditingAuctionId] = useState<number | null>(null);
  const [isUpdatingAuction, setIsUpdatingAuction] = useState(false);
  const [storedImageActionId, setStoredImageActionId] = useState<number | null>(null);
  const [editAuctionImages, setEditAuctionImages] = useState<File[]>([]);
  const [editCoverImageIndex, setEditCoverImageIndex] = useState<number | null>(null);
  const [editImageMessage, setEditImageMessage] = useState("");
  const [editUploadProgress, setEditUploadProgress] = useState("");
  const [editAuctionFieldErrors, setEditAuctionFieldErrors] = useState<Record<string, string>>({});
  const [editAuctionDateErrors, setEditAuctionDateErrors] = useState<{ startsAt?: string; endsAt?: string }>({});
  const [editFormMessage, setEditFormMessage] = useState("");
  const [editPageMessage, setEditPageMessage] = useState("");
  const [editBuyNowPrice, setEditBuyNowPrice] = useState("");
  const [editBuyNowEnabled, setEditBuyNowEnabled] = useState(false);
  const clearAuctionFieldError = (field: string) => setAuctionFieldErrors((current) => {
    if (!current[field]) return current;
    const next = { ...current };
    delete next[field];
    return next;
  });
  const clearEditAuctionFieldError = (field: string) => setEditAuctionFieldErrors((current) => {
    if (!current[field]) return current;
    const next = { ...current };
    delete next[field];
    return next;
  });

  const refreshMyAuctions = async () => {
    setIsLoadingMyAuctions(true);
    setMyAuctionsError("");
    try { setMyAuctions(await listMyAuctions()); }
    catch (reason) { setMyAuctionsError(reason instanceof Error ? reason.message : "A saját aukciók betöltése nem sikerült."); }
    finally { setIsLoadingMyAuctions(false); }
  };

  const refreshMyBids = async () => {
    setIsLoadingMyBids(true);
    setMyBidsError("");
    try { setMyBidAuctions(await listMyBidAuctions()); }
    catch (reason) { setMyBidsError(reason instanceof Error ? reason.message : "A licitek betöltése nem sikerült."); }
    finally { setIsLoadingMyBids(false); }
  };

  useEffect(() => {
    if (section === "bids") void refreshMyBids();
    if (section === "auctions") void refreshMyAuctions();
  }, [section]);

  useEffect(() => {
    if (section !== "bids") return;
    return subscribeNotifications((event) => {
      if (event.type !== "notification" || event.payload.type !== "outbid") return;
      const auctionId = Number(event.payload.auction_id);
      if (!Number.isInteger(auctionId)) return;
      setMyBidAuctions((items) => items.map((item) => item.auction.id === auctionId
        ? { ...item, is_leading: false, is_outbid: true }
        : item));
    });
  }, [section, subscribeNotifications]);

  useEffect(() => subscribeAuctionUpdates((snapshot) => {
      setMyBidAuctions((items) => items.map((item) => item.auction.id === snapshot.auction_id
        ? {
            ...item,
            auction: {
              ...item.auction,
              status: snapshot.status,
              current_price: snapshot.current_price,
              highest_bid_id: snapshot.highest_bid_id,
              winner_id: snapshot.winner_id,
              ends_at: snapshot.ends_at,
              bid_count: snapshot.bid_count,
            },
          }
        : item));
      setMyAuctions((items) => items.map((item) => item.id === snapshot.auction_id
        ? { ...item, status: snapshot.status, current_price: snapshot.current_price, highest_bid_id: snapshot.highest_bid_id, winner_id: snapshot.winner_id, ends_at: snapshot.ends_at, bid_count: snapshot.bid_count }
        : item));
  }), [subscribeAuctionUpdates]);

  const handleImageChange = (event: ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(event.target.files ?? []);
    const invalidFile = selectedFiles.find((file) => !["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > MAX_IMAGE_FILE_SIZE_BYTES);
    if (invalidFile) {
      setImageMessage(`${invalidFile.name}: csak JPEG, PNG vagy WEBP kép tölthető fel, legfeljebb 20 MB méretben.`);
      event.target.value = "";
      return;
    }
    const combinedFiles = [...auctionImages, ...selectedFiles];
    const limitedFiles = combinedFiles.slice(0, MAX_AUCTION_IMAGES);

    setAuctionImages(limitedFiles);
    if (auctionImages.length === 0 && limitedFiles.length > 0) setCoverImageIndex(0);
    setImageMessage(
      combinedFiles.length > MAX_AUCTION_IMAGES
        ? "Legfeljebb 5 képet tölthetsz fel; a korábban kiválasztott képeket megtartottuk, és az új képekből csak a fennmaradó helyeket töltöttük fel."
        : "",
    );
    event.target.value = "";
  };

  const removeSelectedImage = (index: number) => {
    setAuctionImages((current) => current.filter((_, imageIndex) => imageIndex !== index));
    setCoverImageIndex((current) => current === index ? 0 : current > index ? current - 1 : current);
    setImageMessage("");
  };

  const handleCreateAuction = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isCreatingAuction) return;
    setFormMessage("");

    const form = event.currentTarget;
    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const saveAsDraft = submitter?.value === "draft";
    const formData = new FormData(form);
    const fieldErrors = validateAuctionFields(formData);
    const dateErrors = validateAuctionDates(formData.get("starts_at"), formData.get("ends_at"));
    setAuctionFieldErrors(fieldErrors);
    setAuctionDateErrors(dateErrors);
    if (Object.keys(fieldErrors).length > 0 || dateErrors.startsAt || dateErrors.endsAt) {
      setFormMessage("Ellenőrizd a megjelölt mezőket.");
      return;
    }

    const storedDraft = createDraftId ? myAuctions.find((item) => item.id === createDraftId) : null;
    if (!saveAsDraft && auctionImages.length === 0 && !storedDraft?.images.length && createDraftImageCount === 0) {
      setImageMessage("Legalább 1 képet kötelező feltölteni az aukcióhoz.");
      return;
    }

    setIsCreatingAuction(true);
    setUploadProgress("Az aukció mentése folyamatban...");
    try {
      const payload = {
        title: String(formData.get("title") ?? ""),
        description: String(formData.get("description") ?? ""),
        external_link_label: hasActiveVip ? String(formData.get("external_link_label") ?? "").trim() || null : null,
        external_link_url: hasActiveVip ? String(formData.get("external_link_url") ?? "").trim() || null : null,
        category: String(formData.get("category") ?? categories[0]),
        condition: parseCondition(formData.get("condition")),
        has_printing_error: formData.get("has_printing_error") === "on",
        printing_error_description: formData.get("has_printing_error") === "on" ? String(formData.get("printing_error_description") ?? "").trim() || null : null,
        starting_price: String(formData.get("starting_price") ?? "0"),
        bid_increment: String(formData.get("bid_increment") ?? "0"),
        buy_now_enabled: formData.get("buy_now_enabled") === "on",
        buy_now_price: formData.get("buy_now_enabled") === "on" ? String(formData.get("buy_now_price") ?? "") : null,
        starts_at: localDateTimeToIso(formData.get("starts_at")),
        ends_at: localDateTimeToIso(formData.get("ends_at")),
        five_minute_rule_enabled: formData.get("five_minute_rule_enabled") === "on",
        seller_declaration_accepted: formData.get("seller_declaration_accepted") === "on",
      };
      const auction = createDraftId
        ? await updateAuction(createDraftId, payload)
        : await createAuction({ ...payload, creation_key: creationKey });
      setCreateDraftId(auction.id);

      for (const [index, file] of auctionImages.entries()) {
        setUploadProgress(`${index + 1}/${auctionImages.length}: ${file.name} feltöltése és feldolgozása...`);
        try {
          await uploadAuctionImage(auction.id, file, index === coverImageIndex);
          setCreateDraftImageCount((current) => current + 1);
        } catch (error) {
          setAuctionImages(auctionImages.slice(index));
          setCoverImageIndex(Math.max(0, coverImageIndex - index));
          throw new Error(`${file.name}: ${error instanceof Error ? error.message : "a feltöltés nem sikerült."}`);
        }
      }

      if (!saveAsDraft) await activateAuction(auction.id);
      await refreshMyAuctions();
      await refreshMyBids();
      setAuctionImages([]);
      setImageMessage("");
      setAuctionDateErrors({});
      setAuctionFieldErrors({});
      setFormMessage(saveAsDraft ? "A piszkozatot elmentettük. Innen folytathatod, új példány nem jött létre." : "Az aukció létrejött, a képek feltöltődtek, és az aktiválás/időzítés sikeres.");
      setUploadProgress(saveAsDraft ? "A piszkozat mentése sikeres." : "Minden kép feltöltése és feldolgozása sikeres.");
      showToast({
        title: saveAsDraft ? "Piszkozat elmentve" : "Aukció létrehozva",
        message: saveAsDraft ? "A mentést később ugyaninnen folytathatod." : "A képek feltöltése és az aukció aktiválása vagy időzítése sikeres.",
        targetUrl: "/account/auctions",
      });
      if (!saveAsDraft) {
        form.reset();
        setCreateDraftId(null);
        setCreateDraftImageCount(0);
        setCreationKey(rotateDraftCreationKey());
        setCreateBuyNowPrice("");
        setCreateBuyNowEnabled(false);
      }
    } catch (error) {
      if (error instanceof ApiError && Object.keys(error.fieldErrors).length > 0) {
        const { starts_at, ends_at, request, ...fieldErrors } = error.fieldErrors;
        setAuctionFieldErrors(fieldErrors);
        setAuctionDateErrors({ startsAt: starts_at, endsAt: ends_at });
        setFormMessage(request ?? error.message);
      } else {
        setFormMessage(error instanceof Error ? error.message : "Az aukció létrehozása nem sikerült.");
      }
      setUploadProgress("");
    } finally {
      setIsCreatingAuction(false);
    }
  };

  const beginEditingAuction = async (auction: Auction) => {
    setEditAuctionImages([]);
    setEditCoverImageIndex(null);
    setEditImageMessage("");
    setEditUploadProgress("");
    setEditAuctionFieldErrors({});
    setEditAuctionDateErrors({});
    setEditFormMessage("");
    setEditPageMessage("");
    setFormMessage("");
    try {
      const detailedAuction = await getAuction(auction.id) || auction;
      setMyAuctions((items) => items.map((item) => item.id === detailedAuction.id ? detailedAuction : item));
      setEditBuyNowPrice(detailedAuction.buy_now_price ?? "");
      setEditBuyNowEnabled(detailedAuction.buy_now_enabled);
      setEditingAuctionId(detailedAuction.id);
    } catch (error) {
      setEditPageMessage(error instanceof Error ? error.message : "Az aukció adatainak betöltése nem sikerült.");
    }
  };

  const stopEditingAuction = () => {
    setEditingAuctionId(null);
    setEditAuctionImages([]);
    setEditCoverImageIndex(null);
    setEditImageMessage("");
    setEditUploadProgress("");
    setEditAuctionFieldErrors({});
    setEditAuctionDateErrors({});
    setEditFormMessage("");
    setEditBuyNowPrice("");
    setEditBuyNowEnabled(false);
  };

  const handleEditImageChange = (event: ChangeEvent<HTMLInputElement>, auction: Auction) => {
    const selectedFiles = Array.from(event.target.files ?? []);
    const invalidFile = selectedFiles.find((file) => !["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > MAX_IMAGE_FILE_SIZE_BYTES);
    if (invalidFile) {
      setEditAuctionImages([]);
      setEditImageMessage(`${invalidFile.name}: csak JPEG, PNG vagy WEBP kép tölthető fel, legfeljebb 20 MB méretben.`);
      event.target.value = "";
      return;
    }
    const availableSlots = Math.max(0, MAX_AUCTION_IMAGES - auction.images.length);
    const limitedFiles = selectedFiles.slice(0, availableSlots);
    setEditAuctionImages(limitedFiles);
    setEditCoverImageIndex(null);
    setEditImageMessage(
      availableSlots === 0
        ? "Az aukción már elérted az 5 képes maximumot. Előbb törölj egy meglévő képet."
        : selectedFiles.length > availableSlots
          ? `Még ${availableSlots} kép tölthető fel, ezért csak az első ${availableSlots} fájlt tartottuk meg.`
          : "",
    );
  };

  const removeEditSelectedImage = (index: number) => {
    setEditAuctionImages((current) => current.filter((_, imageIndex) => imageIndex !== index));
    setEditCoverImageIndex((current) => current === index ? null : current !== null && current > index ? current - 1 : current);
  };

  const handleUpdateAuction = async (event: FormEvent<HTMLFormElement>, auction: Auction) => {
    event.preventDefault();
    if (isUpdatingAuction) return;
    const formData = new FormData(event.currentTarget);
    const isDraft = auction.status === "draft";
    const fieldErrors = validateAuctionEditFields(formData);
    const dateErrors = validateAuctionEditDates(formData, auction);
    if (Object.keys(fieldErrors).length > 0 || dateErrors.startsAt || dateErrors.endsAt) {
      setEditAuctionFieldErrors(fieldErrors);
      setEditAuctionDateErrors(dateErrors);
      setEditFormMessage("Javítsd a megjelölt mezőket.");
      return;
    }
    const safeUpdate = {
      title: String(formData.get("title") ?? "").trim(),
      description: String(formData.get("description") ?? "").trim(),
      ...(hasActiveVip ? {
        external_link_label: String(formData.get("external_link_label") ?? "").trim() || null,
        external_link_url: String(formData.get("external_link_url") ?? "").trim() || null,
      } : {}),
      category: String(formData.get("category") ?? categories[0]),
      condition: parseCondition(formData.get("condition")),
      has_printing_error: formData.get("has_printing_error") === "on",
      printing_error_description: formData.get("has_printing_error") === "on" ? String(formData.get("printing_error_description") ?? "").trim() || null : null,
      ends_at: localDateTimeToIso(formData.get("ends_at")),
      five_minute_rule_enabled: formData.get("five_minute_rule_enabled") === "on",
      buy_now_enabled: formData.get("buy_now_enabled") === "on",
    };
    const updatePayload = isDraft ? {
      ...safeUpdate,
      starting_price: String(formData.get("starting_price") ?? auction.starting_price),
      bid_increment: String(formData.get("bid_increment") ?? auction.bid_increment),
      starts_at: localDateTimeToIso(formData.get("starts_at")),
      buy_now_enabled: formData.get("buy_now_enabled") === "on",
      buy_now_price: formData.get("buy_now_enabled") === "on" ? String(formData.get("buy_now_price") ?? "") : null,
    } : safeUpdate;

    setIsUpdatingAuction(true);
    setEditAuctionFieldErrors({});
    setEditAuctionDateErrors({});
    setEditFormMessage("");
    setEditPageMessage("");
    setEditUploadProgress("A módosítások mentése folyamatban...");
    try {
      await updateAuction(auction.id, updatePayload);
      for (const [index, file] of editAuctionImages.entries()) {
        setEditUploadProgress(`${index + 1}/${editAuctionImages.length}: ${file.name} feltöltése és feldolgozása...`);
        await uploadAuctionImage(auction.id, file, editCoverImageIndex === index);
      }
      await refreshMyAuctions();
      stopEditingAuction();
      setEditPageMessage("Az aukció módosításai és új képei sikeresen mentve.");
    } catch (error) {
      if (error instanceof ApiError && Object.keys(error.fieldErrors).length > 0) {
        const { starts_at, ends_at, request, ...fieldErrors } = error.fieldErrors;
        setEditAuctionFieldErrors(fieldErrors);
        setEditAuctionDateErrors({ startsAt: starts_at, endsAt: ends_at });
        setEditFormMessage(request ?? error.message);
      } else {
        setEditFormMessage(error instanceof Error ? error.message : "A módosítás nem sikerült.");
      }
      setEditUploadProgress("");
    } finally {
      setIsUpdatingAuction(false);
    }
  };

  const handleCancelAuction = async (auction: Auction) => {
    if (!window.confirm("Biztosan megszakítod ezt az aukciót?")) {
      return;
    }
    try {
      await cancelAuction(auction.id);
      await refreshMyAuctions();
      setFormMessage("Az aukció megszakítva.");
    } catch (error) {
      setFormMessage(error instanceof Error ? error.message : "Az aukció megszakítása nem sikerült.");
    }
  };

  const handleSetCoverImage = async (auctionId: number, imageId: number) => {
    if (storedImageActionId !== null) return;
    setStoredImageActionId(imageId);
    try {
      await setAuctionCoverImage(auctionId, imageId);
      await refreshMyAuctions();
      setFormMessage("A borítókép frissült.");
    } catch (error) {
      setFormMessage(error instanceof Error ? error.message : "A borítókép módosítása nem sikerült.");
    } finally {
      setStoredImageActionId(null);
    }
  };

  const handleDeleteStoredImage = async (auctionId: number, imageId: number) => {
    if (!window.confirm("Biztosan törlöd ezt a képet és minden méretváltozatát?")) return;
    if (storedImageActionId !== null) return;
    setStoredImageActionId(imageId);
    try {
      await deleteAuctionImage(auctionId, imageId);
      await refreshMyAuctions();
      setFormMessage("A kép és minden méretváltozata törlődött.");
    } catch (error) {
      setFormMessage(error instanceof Error ? error.message : "A kép törlése nem sikerült.");
    } finally {
      setStoredImageActionId(null);
    }
  };

  const bidGroups = [
    { title: "Aktív licitjeim", items: myBidAuctions.filter((item) => !["ended", "sold", "unsold", "cancelled", "suspended"].includes(item.auction.status)) },
    { title: "Megnyert aukciók", items: myBidAuctions.filter((item) => item.has_won) },
    { title: "Elvesztett aukciók", items: myBidAuctions.filter((item) => ["ended", "sold", "unsold", "cancelled", "suspended"].includes(item.auction.status) && !item.has_won) },
  ];

  const auctionGroups = [
    { title: "Saját aktív aukcióim", items: myAuctions.filter((auction) => auction.status === "active") },
    { title: "Piszkozatok és időzített aukciók", items: myAuctions.filter((auction) => ["draft", "scheduled"].includes(auction.status)) },
    { title: "Lezárt saját aukcióim", items: myAuctions.filter((auction) => !["active", "draft", "scheduled"].includes(auction.status)) },
  ];

  return (
    <>
      <div className="section-heading page-heading">
        <div>
          <p className="eyebrow">{section === "bids" ? "Licitjeim" : "Eladói fiók"}</p>
          <h1>{section === "bids" ? "Licitjeim" : section === "create" ? "Aukció létrehozása" : "Saját aukcióim"}</h1>
          <p className="hero-lead">
            {section === "bids"
              ? "Kövesd az aktív, megnyert és elvesztett aukcióidat."
              : section === "create"
                ? "Töltsd ki az adatokat, adj hozzá képeket, majd mentsd piszkozatként vagy indítsd el az aukciót."
                : "Kezeld az aktív, időzített, piszkozat és lezárt aukcióidat."}
          </p>
        </div>
        {section === "auctions" ? <Link className="button button-primary" to="/auctions/create">Új aukció</Link> : null}
        {section === "create" ? <Link className="button button-secondary" to="/account/auctions">Saját aukcióim</Link> : null}
        {section === "bids" ? <Link className="button button-primary" to="/auctions">Aukciók böngészése</Link> : null}
      </div>

      {section === "bids" ? <section className="account-section" aria-labelledby="watched-auctions-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Követés</p>
            <h2 id="watched-auctions-title">Aukciók, amelyekre licitáltál</h2>
          </div>
          <p className="section-note">A lezárt aukciók 24 óráig elszürkítve látszanak, utána eltűnnek.</p>
        </div>

        <div>
          {isLoadingMyBids ? <LoadingState label="Licitált aukciók betöltése" /> : null}
          {myBidsError ? <ErrorState message={myBidsError} onRetry={() => void refreshMyBids()} /> : null}
          {!isLoadingMyBids && !myBidsError && myBidAuctions.length === 0 ? <EmptyState title="Még nincs licited" action={<Link className="button button-primary" to="/auctions">Aukciók böngészése</Link>} /> : null}
          {!isLoadingMyBids && !myBidsError && myBidAuctions.length > 0 ? <div className="bid-status-sections">{bidGroups.map((group, groupIndex) => <section className="side-panel bid-status-group" aria-labelledby={`bid-group-${groupIndex}`} key={group.title}><h3 id={`bid-group-${groupIndex}`}>{group.title} <span>({group.items.length})</span></h3>{group.items.length === 0 ? <p className="empty-state">Ebben a csoportban nincs aukció.</p> : <div className="my-bids-list">{group.items.map((item) => { const cover = item.auction.images.find((image) => image.is_cover) ?? item.auction.images[0]; return <Link className="my-bid-row account-bid-row" to={`/auctions/${item.auction.id}`} key={item.auction.id}>{cover ? <SafeImage src={apiAssetUrl(cover.thumbnail_url ?? cover.list_url ?? cover.url)} alt="" loading="lazy" width={320} height={320} fallbackClassName="bid-image-placeholder" /> : <span className="bid-image-placeholder" aria-hidden="true" />}<span className="bid-row-copy"><strong>{item.auction.title}</strong><span>Aktuális licit: {formatMoney(item.auction.current_price)}</span><span>Saját legmagasabb licit: {formatMoney(item.my_highest_bid)}</span><span>{item.auction.bid_count ?? 0} licit · zárás: {formatRemainingTime(item.auction.ends_at, item.auction.status)}</span><em>{item.has_won ? "Megnyerted" : item.is_leading ? "Te vezetsz" : item.is_outbid ? "Rád licitáltak" : "Figyelés alatt"}</em></span></Link>; })}</div>}</section>)}</div> : null}
        </div>
      </section> : null}

      {section === "auctions" ? <section className="account-section" aria-labelledby="own-auctions-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Feltöltéseim</p>
            <h2 id="own-auctions-title">Saját aukcióim</h2>
          </div>
          <p className="section-note">A lezárt saját aukciók szintén 24 óráig maradnak láthatók.</p>
        </div>

        {editPageMessage ? <p className="form-message" role="status" aria-live="polite">{editPageMessage}</p> : null}

        <div>
          {isLoadingMyAuctions ? <LoadingState label="Saját aukciók betöltése" /> : null}
          {myAuctionsError ? <ErrorState message={myAuctionsError} onRetry={() => void refreshMyAuctions()} /> : null}
          {!isLoadingMyAuctions && !myAuctionsError && myAuctions.length === 0 ? <EmptyState title="Még nincs saját aukciód" action={<Link className="button button-primary" to="/auctions/create">Első aukció létrehozása</Link>} /> : null}
          {!isLoadingMyAuctions && !myAuctionsError && myAuctions.length > 0 ? (
            <div className="auction-status-sections">
              {auctionGroups.map((group, groupIndex) => (
                <section aria-labelledby={`auction-group-${groupIndex}`} key={group.title}>
                  <h3 id={`auction-group-${groupIndex}`}>{group.title} <span>({group.items.length})</span></h3>
                  {group.items.length === 0 ? <p className="side-panel empty-state">Ebben a csoportban nincs aukció.</p> : (
                    <div className="auction-grid page-grid">
                      {group.items.map((auction, index) => {
                        const isEditing = editingAuctionId === auction.id;
                        const isDraft = auction.status === "draft";
                        const canEdit = ["draft", "scheduled", "active"].includes(auction.status);
                        const canShare = ["scheduled", "active"].includes(auction.status);
                        return (
                          <div className={isEditing ? "own-auction-card is-editing" : "own-auction-card"} key={auction.id}>
                            <AuctionCard item={{ ...toCardAuction(auction), outcomeStatus: auction.owner_sale_status ?? undefined }} index={index} detailPath={`/auctions/${auction.id}`} showBidActions={false} />
                            <div className="owner-actions">
                              {canShare ? <button className="button button-secondary owner-share-button" type="button" aria-label={`${auction.title} megosztása Facebookon`} onClick={() => {
                                openFacebookShare(auction.id);
                                setEditPageMessage("A Facebook megosztó megnyitása elindult. Ha nem jelenik meg, engedélyezd a felugró ablakokat, majd próbáld újra.");
                              }}><span aria-hidden="true">f</span> Megosztás Facebookon</button> : null}
                              {canEdit ? <button className="button button-secondary" type="button" onClick={() => isEditing ? stopEditingAuction() : void beginEditingAuction(auction)}>{isEditing ? "Szerkesztő bezárása" : "Módosítás"}</button> : null}
                              {canEdit ? <button className="button button-danger" type="button" onClick={() => handleCancelAuction(auction)}>Megszakítás</button> : null}
                            </div>

                            {isEditing ? (
                              <form className="side-panel auction-create-form auction-edit-form" aria-label={`${auction.title} módosítása`} noValidate onSubmit={(event) => void handleUpdateAuction(event, auction)}>
                                <div className="form-wide section-heading edit-form-heading">
                                  <div>
                                    <p className="eyebrow">Aukció módosítása</p>
                                    <h3>{auction.title}</h3>
                                  </div>
                                  <button className="button button-ghost" type="button" onClick={stopEditingAuction}>Mégse</button>
                                </div>
                                <label>
                                  Név
                                  <input name="title" type="text" defaultValue={auction.title} required maxLength={180} aria-invalid={Boolean(editAuctionFieldErrors.title)} aria-describedby={editAuctionFieldErrors.title ? `edit-title-error-${auction.id}` : undefined} onChange={() => clearEditAuctionFieldError("title")} />
                                  {editAuctionFieldErrors.title ? <small className="auth-field-error" id={`edit-title-error-${auction.id}`}>{editAuctionFieldErrors.title}</small> : <small>2–180 karakter.</small>}
                                </label>
                                <label>
                                  Kategória
                                  <select name="category" defaultValue={auction.category} aria-invalid={Boolean(editAuctionFieldErrors.category)} aria-describedby={editAuctionFieldErrors.category ? `edit-category-error-${auction.id}` : undefined} onChange={() => clearEditAuctionFieldError("category")}>
                                    {categories.map((category) => <option key={category}>{category}</option>)}
                                  </select>
                                  {editAuctionFieldErrors.category ? <small className="auth-field-error" id={`edit-category-error-${auction.id}`}>{editAuctionFieldErrors.category}</small> : null}
                                </label>
                                <div className="form-field">
                                  <div className="field-label-row"><label htmlFor={`edit-condition-${auction.id}`}>Állapot</label><CardConditionHelp /></div>
                                  <select id={`edit-condition-${auction.id}`} name="condition" defaultValue={getCardCondition(auction.condition).value} aria-invalid={Boolean(editAuctionFieldErrors.condition)} aria-describedby={editAuctionFieldErrors.condition ? `edit-condition-error-${auction.id}` : undefined} onChange={() => clearEditAuctionFieldError("condition")}>
                                    {CARD_CONDITIONS.map((condition) => <option value={condition.value} key={condition.value}>{condition.nameHu} ({condition.value})</option>)}
                                  </select>
                                  {editAuctionFieldErrors.condition ? <small className="auth-field-error" id={`edit-condition-error-${auction.id}`}>{editAuctionFieldErrors.condition}</small> : null}
                                </div>
                                <label className="form-wide">
                                  Leírás
                                  <textarea name="description" rows={5} defaultValue={auction.description ?? ""} required maxLength={5000} aria-invalid={Boolean(editAuctionFieldErrors.description)} aria-describedby={editAuctionFieldErrors.description ? `edit-description-error-${auction.id}` : undefined} onChange={() => clearEditAuctionFieldError("description")} />
                                  {editAuctionFieldErrors.description ? <small className="auth-field-error" id={`edit-description-error-${auction.id}`}>{editAuctionFieldErrors.description}</small> : <small>10–5000 karakter.</small>}
                                </label>
                                {hasActiveVip ? <>
                                  <label>Hivatkozás felirata<input name="external_link_label" type="text" maxLength={80} defaultValue={auction.external_link_label ?? ""} placeholder="További részletek" /></label>
                                  <label>Hivatkozás URL-je<input name="external_link_url" type="url" maxLength={1000} defaultValue={auction.external_link_url ?? ""} placeholder="https://pelda.hu" /></label>
                                </> : null}
                                <label className="toggle-row"><input name="has_printing_error" type="checkbox" defaultChecked={auction.has_printing_error} onChange={(event) => { const field = event.currentTarget.form?.elements.namedItem("printing_error_description"); if (field instanceof HTMLTextAreaElement) { field.disabled = !event.currentTarget.checked; if (!event.currentTarget.checked) field.value = ""; } }} />Nyomdahibás / gyártási hibás</label>
                                <label>Hiba rövid leírása<textarea name="printing_error_description" rows={3} minLength={3} maxLength={500} defaultValue={auction.printing_error_description ?? ""} disabled={!auction.has_printing_error} placeholder="Például: a hátoldalon gyári festékhiba látható." /></label>
                                <label>
                                  Kezdőár
                                  <input name="starting_price" type="number" min="0" defaultValue={auction.starting_price} required disabled={!isDraft} />
                                  {!isDraft ? <small>Zárolt érték.</small> : null}
                                </label>
                                <label>
                                  Licitlépcső
                                  <input name="bid_increment" type="number" min="1" defaultValue={auction.bid_increment} required disabled={!isDraft} />
                                  {!isDraft ? <small>Zárolt érték.</small> : null}
                                </label>
                                <label>
                                  Villámár
                                  <input name="buy_now_price" type="number" min="1" value={editBuyNowPrice} disabled={!isDraft} onChange={(event) => { const value = event.target.value; setEditBuyNowPrice(value); setEditBuyNowEnabled(Number(value) > 0); }} />
                                  {!isDraft ? <small>A már rögzített összeg nem módosítható.</small> : null}
                                </label>
                                <label>
                                  Kezdési dátum
                                  <input name="starts_at" type="datetime-local" defaultValue={isoToLocalDateTime(auction.starts_at)} required disabled={!isDraft} aria-invalid={Boolean(editAuctionDateErrors.startsAt)} aria-describedby={editAuctionDateErrors.startsAt ? `edit-starts-at-error-${auction.id}` : undefined} onChange={() => setEditAuctionDateErrors((current) => ({ ...current, startsAt: undefined }))} />
                                  {editAuctionDateErrors.startsAt ? <small className="auth-field-error" id={`edit-starts-at-error-${auction.id}`}>{editAuctionDateErrors.startsAt}</small> : <small>{!isDraft ? "A kezdés után zárolt. " : ""}Helyi idő: Europe/Budapest.</small>}
                                </label>
                                <label>
                                  Lejárati dátum
                                  <input name="ends_at" type="datetime-local" defaultValue={isoToLocalDateTime(auction.ends_at)} required aria-invalid={Boolean(editAuctionDateErrors.endsAt)} aria-describedby={editAuctionDateErrors.endsAt ? `edit-ends-at-error-${auction.id}` : undefined} onChange={() => setEditAuctionDateErrors((current) => ({ ...current, endsAt: undefined }))} />
                                  {editAuctionDateErrors.endsAt ? <small className="auth-field-error" id={`edit-ends-at-error-${auction.id}`}>{editAuctionDateErrors.endsAt}</small> : <small>Helyi idő: Europe/Budapest.</small>}
                                </label>
                                <aside className="form-wide auction-rule-note"><strong>Az utolsó 5 perc szabályai</strong><p>A legutolsó aktív licit az utolsó 5 percben nem vonható vissza. Bekapcsolt hosszabbításnál minden késői érvényes licit a licit pillanatától újabb 5 percre állítja a zárást.</p><label className="toggle-row"><input name="five_minute_rule_enabled" type="checkbox" defaultChecked={auction.five_minute_rule_enabled} />5 perces automatikus hosszabbítás bekapcsolása</label></aside>
                                <label className="toggle-row buy-now-toggle">
                                  <span className="toggle-control"><input name="buy_now_enabled" type="checkbox" checked={editBuyNowEnabled} onChange={(event) => setEditBuyNowEnabled(event.target.checked)} disabled={!isDraft && !auction.buy_now_price} />Villámár bekapcsolása</span>
                                  {!isDraft && !auction.buy_now_price ? <small>Korábban megadott villámár nélkül nem kapcsolható be.</small> : null}
                                </label>

                                <div className="form-wide image-upload-field">
                                  <h4>Meglévő képek</h4>
                                  <div className="owner-image-manager" aria-label={`${auction.title} képeinek kezelése`}>
                                    {auction.images.map((image) => (
                                      <div className="owner-image-row" key={image.id}>
                                        <SafeImage src={apiAssetUrl(image.thumbnail_url ?? image.list_url ?? image.url)} alt="" width={320} height={320} />
                                        {image.is_cover ? <span className="status-badge">Borítókép</span> : <button className="button button-secondary" type="button" disabled={storedImageActionId !== null} onClick={() => void handleSetCoverImage(auction.id, image.id)}>{storedImageActionId === image.id ? "Mentés…" : "Legyen borítókép"}</button>}
                                        <button className="button button-danger" type="button" disabled={storedImageActionId !== null} onClick={() => void handleDeleteStoredImage(auction.id, image.id)}>{storedImageActionId === image.id ? "Feldolgozás…" : "Kép törlése"}</button>
                                      </div>
                                    ))}
                                  </div>
                                  <label>
                                    Új képek hozzáadása
                                    <input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={(event) => handleEditImageChange(event, auction)} disabled={isUpdatingAuction || auction.images.length >= MAX_AUCTION_IMAGES} />
                                  </label>
                                  <small>JPEG, PNG vagy WEBP; képenként legfeljebb 20 MB. Összesen maximum 5 kép.</small>
                                  {editAuctionImages.length > 0 ? (
                                    <div className="cover-image-list" aria-label="Új képek beállítása">
                                      {editAuctionImages.map((file, imageIndex) => (
                                        <label className="cover-image-option" key={`${file.name}-${file.lastModified}`}>
                                          <FileImagePreview file={file} alt={`${file.name} előnézete`} />
                                          <input type="radio" name="editCoverImage" checked={editCoverImageIndex === imageIndex} onChange={() => setEditCoverImageIndex(imageIndex)} />
                                          <span>{imageIndex + 1}. új kép</span>
                                          <strong>{file.name}</strong>
                                          {editCoverImageIndex === imageIndex ? <em>Új borítókép</em> : null}
                                          <button className="button button-danger" type="button" onClick={() => removeEditSelectedImage(imageIndex)}>Kép eltávolítása</button>
                                        </label>
                                      ))}
                                    </div>
                                  ) : null}
                                  {editImageMessage ? <p className="form-message">{editImageMessage}</p> : null}
                                  {editUploadProgress ? <p className="form-message" role="status" aria-live="polite">{editUploadProgress}</p> : null}
                                </div>

                                {editFormMessage ? <p className="form-message form-wide" role="alert">{editFormMessage}</p> : null}

                                <div className="form-wide edit-form-actions">
                                  <button className="button button-primary" type="submit" disabled={isUpdatingAuction}>{isUpdatingAuction ? "Módosítások mentése..." : "Módosítások mentése"}</button>
                                  <button className="button button-secondary" type="button" onClick={stopEditingAuction} disabled={isUpdatingAuction}>Mégse</button>
                                </div>
                              </form>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>
              ))}
            </div>
          ) : null}
        </div>

        <div className="side-panel edit-rules-panel">
          <h3>Mit módosíthatsz egy saját aukción?</h3>
          <div className="rules-grid">
            <div>
              <h4>Módosítható</h4>
              <ul>
                {editableFields.map((field) => <li key={field}>{field}</li>)}
              </ul>
            </div>
            <div>
              <h4>Nem módosítható</h4>
              <ul>
                {lockedFields.map((field) => <li key={field}>{field}</li>)}
              </ul>
            </div>
          </div>
        </div>
      </section> : null}

      {section === "create" ? <section className="account-section" id="auction-create" aria-labelledby="auction-create-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Új feltöltés</p>
            <h2 id="auction-create-title">Aukció adatai</h2>
          </div>
          <Link className="text-link" to="/how-it-works">Szabályok részletesen</Link>
        </div>

        <form className="side-panel auction-create-form" onSubmit={handleCreateAuction} noValidate>
          <label>
            Név
            <input name="title" type="text" placeholder="Aukció címe" required maxLength={180} aria-invalid={Boolean(auctionFieldErrors.title)} aria-describedby={auctionFieldErrors.title ? "auction-title-error" : undefined} onChange={() => clearAuctionFieldError("title")} />
            {auctionFieldErrors.title ? <small className="auth-field-error" id="auction-title-error">{auctionFieldErrors.title}</small> : <small>2–180 karakter.</small>}
          </label>
          <div className="form-wide image-upload-field">
            <label>
              Képek
              <input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={handleImageChange} disabled={isCreatingAuction} />
            </label>
            <small>
              JPEG, PNG vagy WEBP; képenként legfeljebb 20 MB. Minimum 1, maximum 5 kép tölthető fel. Válaszd ki a borítóképet.
            </small>
            {auctionImages.length > 0 ? (
              <div className="cover-image-list" aria-label="Borítókép kiválasztása">
                {auctionImages.map((file, index) => (
                  <label className="cover-image-option" key={`${file.name}-${file.lastModified}`}>
                    <FileImagePreview file={file} alt={`${file.name} előnézete`} />
                    <input
                      type="radio"
                      name="coverImage"
                      checked={coverImageIndex === index}
                      onChange={() => setCoverImageIndex(index)}
                    />
                    <span>{index + 1}. kép</span>
                    <strong>{file.name}</strong>
                    {coverImageIndex === index ? <em>Borítókép</em> : null}
                    <button type="button" className="button button-danger" onClick={() => removeSelectedImage(index)} disabled={isCreatingAuction}>Kép eltávolítása</button>
                  </label>
                ))}
              </div>
            ) : null}
            {imageMessage ? <p className="form-message">{imageMessage}</p> : null}
            {uploadProgress ? <p className="form-message" role="status" aria-live="polite">{uploadProgress}</p> : null}
          </div>
          <label className="form-wide">
            Leírás
            <textarea name="description" rows={5} placeholder="Állapot, kiadás, különleges tudnivalók..." required maxLength={5000} aria-invalid={Boolean(auctionFieldErrors.description)} aria-describedby={auctionFieldErrors.description ? "auction-description-error" : undefined} onChange={() => clearAuctionFieldError("description")} />
            {auctionFieldErrors.description ? <small className="auth-field-error" id="auction-description-error">{auctionFieldErrors.description}</small> : <small>10–5000 karakter.</small>}
          </label>
          {hasActiveVip ? <>
            <label>Hivatkozás felirata<input name="external_link_label" type="text" maxLength={80} placeholder="További részletek" /></label>
            <label>Hivatkozás URL-je<input name="external_link_url" type="url" maxLength={1000} placeholder="https://pelda.hu" /></label>
          </> : null}
          <label>
            Kategória
            <select name="category">
              {categories.map((category) => <option key={category}>{category}</option>)}
            </select>
          </label>
          <div className="form-field">
            <div className="field-label-row"><label htmlFor="auction-condition">Állapot</label><CardConditionHelp /></div>
            <select id="auction-condition" name="condition" defaultValue="NM">
              {CARD_CONDITIONS.map((condition) => <option value={condition.value} key={condition.value}>{condition.nameHu} ({condition.value})</option>)}
            </select>
          </div>
          <label className="toggle-row"><input name="has_printing_error" type="checkbox" onChange={(event) => { const field = event.currentTarget.form?.elements.namedItem("printing_error_description"); if (field instanceof HTMLTextAreaElement) { field.disabled = !event.currentTarget.checked; if (!event.currentTarget.checked) field.value = ""; } }} />Nyomdahibás / gyártási hibás</label>
          <label>Hiba rövid leírása<textarea name="printing_error_description" rows={3} minLength={3} maxLength={500} disabled placeholder="Például: a hátoldalon gyári festékhiba látható." /></label>
          <label>
            Kezdőár
            <input name="starting_price" type="number" min="0" placeholder="0" required aria-invalid={Boolean(auctionFieldErrors.starting_price)} aria-describedby={auctionFieldErrors.starting_price ? "auction-starting-price-error" : undefined} onChange={() => clearAuctionFieldError("starting_price")} />
            {auctionFieldErrors.starting_price ? <small className="auth-field-error" id="auction-starting-price-error">{auctionFieldErrors.starting_price}</small> : <small>Ezt később nem módosíthatod.</small>}
          </label>
          <label>
            Licitlépcső
            <input name="bid_increment" type="number" min="1" placeholder="500" required aria-invalid={Boolean(auctionFieldErrors.bid_increment)} aria-describedby={auctionFieldErrors.bid_increment ? "auction-bid-increment-error" : undefined} onChange={() => clearAuctionFieldError("bid_increment")} />
            {auctionFieldErrors.bid_increment ? <small className="auth-field-error" id="auction-bid-increment-error">{auctionFieldErrors.bid_increment}</small> : <small>Ezt később nem módosíthatod.</small>}
          </label>
          <label>
            Villámár
            <input name="buy_now_price" type="number" min="1" placeholder="Opcionális" value={createBuyNowPrice} aria-invalid={Boolean(auctionFieldErrors.buy_now_price)} aria-describedby={auctionFieldErrors.buy_now_price ? "auction-buy-now-error" : undefined} onChange={(event) => { const value = event.target.value; setCreateBuyNowPrice(value); setCreateBuyNowEnabled(Number(value) > 0); clearAuctionFieldError("buy_now_price"); }} />
            {auctionFieldErrors.buy_now_price ? <small className="auth-field-error" id="auction-buy-now-error">{auctionFieldErrors.buy_now_price}</small> : <small>Az összeget később nem módosíthatod.</small>}
          </label>
          <label>
            Kezdési dátum
            <input name="starts_at" type="datetime-local" required aria-invalid={Boolean(auctionDateErrors.startsAt)} aria-describedby={auctionDateErrors.startsAt ? "auction-starts-at-error" : undefined} onChange={() => setAuctionDateErrors((current) => ({ ...current, startsAt: undefined }))} />
            {auctionDateErrors.startsAt ? <small className="auth-field-error" id="auction-starts-at-error">{auctionDateErrors.startsAt}</small> : <small>Helyi idő: Europe/Budapest.</small>}
          </label>
          <label>
            Lejárati dátum
            <input name="ends_at" type="datetime-local" required aria-invalid={Boolean(auctionDateErrors.endsAt)} aria-describedby={auctionDateErrors.endsAt ? "auction-ends-at-error" : undefined} onChange={() => setAuctionDateErrors((current) => ({ ...current, endsAt: undefined }))} />
            {auctionDateErrors.endsAt ? <small className="auth-field-error" id="auction-ends-at-error">{auctionDateErrors.endsAt}</small> : <small>Helyi idő: Europe/Budapest.</small>}
          </label>
          <aside className="form-wide auction-rule-note" aria-label="Az utolsó öt perc szabályai">
            <strong>Az utolsó 5 perc fontos szabályai</strong>
            <p>Az aukció utolsó 5 percében a legutolsó aktív licit már nem vonható vissza. Bekapcsolt hosszabbításnál minden, az aktuális zárás előtti utolsó 5 percben érkező érvényes licit a licit pillanatától újabb 5 percre állítja a zárást.</p>
            <label className="toggle-row"><input name="five_minute_rule_enabled" type="checkbox" defaultChecked />5 perces automatikus hosszabbítás bekapcsolása</label>
          </aside>
          <label className="toggle-row buy-now-toggle">
            <span className="toggle-control"><input name="buy_now_enabled" type="checkbox" checked={createBuyNowEnabled} onChange={(event) => { setCreateBuyNowEnabled(event.target.checked); clearAuctionFieldError("buy_now_price"); }} />Villámár bekapcsolása</span>
            <small>Érvényes összeg megadásakor automatikusan bekapcsol. Kikapcsoláskor az összeg megmaradhat.</small>
          </label>
          <label className="toggle-row form-wide">
            <input name="seller_declaration_accepted" type="checkbox" required aria-invalid={Boolean(auctionFieldErrors.seller_declaration_accepted)} aria-describedby={auctionFieldErrors.seller_declaration_accepted ? "auction-declaration-error" : undefined} onChange={() => clearAuctionFieldError("seller_declaration_accepted")} />
            Elfogadom, hogy jogosult vagyok a termék értékesítésére és a képek használatára, az adásvétel pedig köztem és a nyertes között jön létre.
            {auctionFieldErrors.seller_declaration_accepted ? <small className="auth-field-error" id="auction-declaration-error">{auctionFieldErrors.seller_declaration_accepted}</small> : null}
          </label>
          {formMessage ? <p className="form-message form-wide">{formMessage}</p> : null}
          <div className="form-wide create-form-actions">
            <button className="button button-secondary" type="submit" name="submit_intent" value="draft" disabled={isCreatingAuction}>{isCreatingAuction ? "Mentés..." : createDraftId ? "Piszkozat frissítése" : "Mentés piszkozatként"}</button>
            <button className="button button-primary" type="submit" name="submit_intent" value="publish" disabled={isCreatingAuction}>{isCreatingAuction ? "Feltöltés és feldolgozás..." : "Aukció indítása vagy ütemezése"}</button>
          </div>
        </form>
      </section> : null}
    </>
  );
}
