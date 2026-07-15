import { ChangeEvent, FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { activateAuction, cancelAuction, createAuction, deleteAuctionImage, listMyAuctions, listMyBidAuctions, setAuctionCoverImage, updateAuction, uploadAuctionImage, type Auction, type AuctionCondition, type MyBidAuction } from "../api/auctions";
import { apiAssetUrl } from "../api/client";
import { AuctionCard } from "../components/AuctionCard";
import { SafeImage } from "../components/SafeImage";
import { EmptyState, ErrorState, LoadingState } from "../components/AsyncStates";
import { categories, conditionOptions } from "../data/content";
import { formatMoney, formatRemainingTime } from "../utils/format";

const MAX_AUCTION_IMAGES = 5;

const editableFields = [
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

const conditionMap: Record<string, AuctionCondition> = {
  "Frissen Bontott": "fresh",
  "Újszerű": "like_new",
  "Játszott": "played",
  "Sérült": "damaged",
  "Kopott": "worn",
  "Nyomdahibás": "misprint",
};

function toCardAuction(auction: Auction) {
  const coverImage = auction.images.find((image) => image.is_cover) ?? auction.images[0];
  return {
    id: auction.id,
    title: auction.title,
    type: auction.category,
    price: formatMoney(auction.current_price ?? auction.starting_price),
    step: formatMoney(auction.bid_increment),
    time: formatRemainingTime(auction.ends_at, auction.status),
    sellerName: "Te",
    sellerRating: auction.seller_average_rating ?? null,
    sellerReviewCount: auction.seller_review_count ?? 0,
    buyNowPrice: auction.buy_now_enabled ? auction.buy_now_price : null,
    isClosed: ["ended", "sold", "unsold", "cancelled", "suspended"].includes(auction.status),
    imageUrl: coverImage ? apiAssetUrl(coverImage.list_url ?? coverImage.thumbnail_url ?? coverImage.url) : undefined,
    statusLabel: auction.status,
    bidCount: auction.bid_count ?? 0,
  };
}

function localDateTimeToIso(value: FormDataEntryValue | null) {
  const textValue = String(value ?? "");
  if (!textValue) {
    throw new Error("A kezdési és zárási idő megadása kötelező.");
  }
  return new Date(textValue).toISOString();
}

export function AccountPage({ section }: { section: "bids" | "auctions" }) {
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
  const [isCreatingAuction, setIsCreatingAuction] = useState(false);
  const [uploadProgress, setUploadProgress] = useState("");

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

  const handleImageChange = (event: ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(event.target.files ?? []);
    const invalidFile = selectedFiles.find((file) => !["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 5 * 1024 * 1024);
    if (invalidFile) {
      setAuctionImages([]);
      setImageMessage(`${invalidFile.name}: csak JPEG, PNG vagy WEBP kép tölthető fel, legfeljebb 5 MB méretben.`);
      event.target.value = "";
      return;
    }
    const limitedFiles = selectedFiles.slice(0, MAX_AUCTION_IMAGES);

    setAuctionImages(limitedFiles);
    setCoverImageIndex(0);
    setImageMessage(
      selectedFiles.length > MAX_AUCTION_IMAGES
        ? "Legfeljebb 5 képet tölthetsz fel, ezért az első 5 képet tartottuk meg."
        : "",
    );
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

    if (auctionImages.length === 0) {
      setImageMessage("Legalább 1 képet kötelező feltölteni az aukcióhoz.");
      return;
    }

    const formData = new FormData(event.currentTarget);

    setIsCreatingAuction(true);
    setUploadProgress("Az aukció mentése folyamatban...");
    try {
      const auction = await createAuction({
        title: String(formData.get("title") ?? ""),
        description: String(formData.get("description") ?? ""),
        category: String(formData.get("category") ?? categories[0]),
        condition: conditionMap[String(formData.get("condition") ?? conditionOptions[0])],
        starting_price: String(formData.get("starting_price") ?? "0"),
        bid_increment: String(formData.get("bid_increment") ?? "0"),
        buy_now_enabled: formData.get("buy_now_enabled") === "on",
        buy_now_price: formData.get("buy_now_enabled") === "on" ? String(formData.get("buy_now_price") ?? "") : null,
        starts_at: localDateTimeToIso(formData.get("starts_at")),
        ends_at: localDateTimeToIso(formData.get("ends_at")),
        five_minute_rule_enabled: formData.get("five_minute_rule_enabled") === "on",
        seller_declaration_accepted: formData.get("seller_declaration_accepted") === "on",
      });

      for (const [index, file] of auctionImages.entries()) {
        setUploadProgress(`${index + 1}/${auctionImages.length}: ${file.name} feltöltése és feldolgozása...`);
        try {
          await uploadAuctionImage(auction.id, file, index === coverImageIndex);
        } catch (error) {
          throw new Error(`${file.name}: ${error instanceof Error ? error.message : "a feltöltés nem sikerült."}`);
        }
      }

      await activateAuction(auction.id);
      await refreshMyAuctions();
      await refreshMyBids();
      setAuctionImages([]);
      setImageMessage("");
      setFormMessage("Az aukció létrejött, a képek feltöltődtek, és az aktiválás/időzítés sikeres.");
      setUploadProgress("Minden kép feltöltése és feldolgozása sikeres.");
      event.currentTarget.reset();
    } catch (error) {
      setFormMessage(error instanceof Error ? error.message : "Az aukció létrehozása nem sikerült.");
      setUploadProgress("");
    } finally {
      setIsCreatingAuction(false);
    }
  };

  const handleEditDescription = async (auction: Auction) => {
    const nextDescription = window.prompt(
      "Módosítható: leírás, kép, lejárati dátum, 5 perces szabály, villámár kapcsoló. Nem módosítható: kezdőár, licitlépcső, már megadott villámár összege.",
      auction.description ?? "",
    );
    if (nextDescription === null) {
      return;
    }
    try {
      await updateAuction(auction.id, { description: nextDescription });
      await refreshMyAuctions();
      setFormMessage("Az aukció leírása frissült.");
    } catch (error) {
      setFormMessage(error instanceof Error ? error.message : "A módosítás nem sikerült.");
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
    try {
      await setAuctionCoverImage(auctionId, imageId);
      await refreshMyAuctions();
      setFormMessage("A borítókép frissült.");
    } catch (error) {
      setFormMessage(error instanceof Error ? error.message : "A borítókép módosítása nem sikerült.");
    }
  };

  const handleDeleteStoredImage = async (auctionId: number, imageId: number) => {
    if (!window.confirm("Biztosan törlöd ezt a képet és minden méretváltozatát?")) return;
    try {
      await deleteAuctionImage(auctionId, imageId);
      await refreshMyAuctions();
      setFormMessage("A kép és minden méretváltozata törlődött.");
    } catch (error) {
      setFormMessage(error instanceof Error ? error.message : "A kép törlése nem sikerült.");
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
          <h1>{section === "bids" ? "Licitjeim" : "Saját aukcióim"}</h1>
          <p className="hero-lead">
            {section === "bids" ? "Kövesd az aktív, megnyert és elvesztett aukcióidat." : "Kezeld az aktív, időzített, piszkozat és lezárt aukcióidat."}
          </p>
        </div>
        {section === "auctions" ? <a className="button button-primary" href="#auction-create">Új aukció</a> : <Link className="button button-primary" to="/auctions">Aukciók böngészése</Link>}
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

        <div>
          {isLoadingMyAuctions ? <LoadingState label="Saját aukciók betöltése" /> : null}
          {myAuctionsError ? <ErrorState message={myAuctionsError} onRetry={() => void refreshMyAuctions()} /> : null}
          {!isLoadingMyAuctions && !myAuctionsError && myAuctions.length === 0 ? <EmptyState title="Még nincs saját aukciód" action={<a className="button button-primary" href="#auction-create">Első aukció létrehozása</a>} /> : null}
          {!isLoadingMyAuctions && !myAuctionsError && myAuctions.length > 0 ? <div className="auction-status-sections">{auctionGroups.map((group, groupIndex) => <section aria-labelledby={`auction-group-${groupIndex}`} key={group.title}><h3 id={`auction-group-${groupIndex}`}>{group.title} <span>({group.items.length})</span></h3>{group.items.length === 0 ? <p className="side-panel empty-state">Ebben a csoportban nincs aukció.</p> : <div className="auction-grid page-grid">{group.items.map((auction, index) => <div className="own-auction-card" key={auction.id}><AuctionCard item={toCardAuction(auction)} index={index} detailPath={`/auctions/${auction.id}`} showBidActions={false} /><div className="owner-actions"><button className="button button-secondary" type="button" onClick={() => handleEditDescription(auction)}>Módosítás</button>{["draft", "scheduled", "active"].includes(auction.status) ? <button className="button button-danger" type="button" onClick={() => handleCancelAuction(auction)}>Megszakítás</button> : null}</div>{["draft", "scheduled"].includes(auction.status) && auction.images.length > 0 ? <div className="owner-image-manager" aria-label={`${auction.title} képeinek kezelése`}>{auction.images.map((image) => <div className="owner-image-row" key={image.id}><SafeImage src={apiAssetUrl(image.thumbnail_url ?? image.list_url ?? image.url)} alt="" width={320} height={320} />{image.is_cover ? <span className="status-badge">Borítókép</span> : <button className="button button-secondary" type="button" onClick={() => void handleSetCoverImage(auction.id, image.id)}>Legyen borítókép</button>}<button className="button button-danger" type="button" onClick={() => void handleDeleteStoredImage(auction.id, image.id)}>Kép törlése</button></div>)}</div> : null}</div>)}</div>}</section>)}</div> : null}
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

      {section === "auctions" ? <section className="account-section" id="auction-create" aria-labelledby="auction-create-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Új feltöltés</p>
            <h2 id="auction-create-title">Aukció létrehozása</h2>
          </div>
          <Link className="text-link" to="/how-it-works">Szabályok részletesen</Link>
        </div>

        <form className="side-panel auction-create-form" onSubmit={handleCreateAuction}>
          <label>
            Név
            <input name="title" type="text" placeholder="Aukció címe" required />
          </label>
          <div className="form-wide image-upload-field">
            <label>
              Képek
              <input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={handleImageChange} disabled={isCreatingAuction} />
            </label>
            <small>
              JPEG, PNG vagy WEBP; képenként legfeljebb 5 MB. Minimum 1, maximum 5 kép tölthető fel. Válaszd ki a borítóképet.
            </small>
            {auctionImages.length > 0 ? (
              <div className="cover-image-list" aria-label="Borítókép kiválasztása">
                {auctionImages.map((file, index) => (
                  <label className="cover-image-option" key={`${file.name}-${file.lastModified}`}>
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
            <textarea name="description" rows={5} placeholder="Állapot, kiadás, különleges tudnivalók..." required />
          </label>
          <label>
            Kategória
            <select name="category">
              {categories.map((category) => <option key={category}>{category}</option>)}
            </select>
          </label>
          <label>
            Állapot
            <select name="condition">
              {conditionOptions.map((condition) => <option key={condition}>{condition}</option>)}
            </select>
          </label>
          <label>
            Kezdőár
            <input name="starting_price" type="number" min="1" placeholder="0" required />
            <small>Ezt később nem módosíthatod.</small>
          </label>
          <label>
            Licitlépcső
            <input name="bid_increment" type="number" min="1" placeholder="500" required />
            <small>Ezt később nem módosíthatod.</small>
          </label>
          <label>
            Villámár
            <input name="buy_now_price" type="number" min="1" placeholder="Opcionális" />
            <small>Az összeget később nem módosíthatod.</small>
          </label>
          <label>
            Kezdési dátum
            <input name="starts_at" type="datetime-local" required />
          </label>
          <label>
            Lejárati dátum
            <input name="ends_at" type="datetime-local" required />
          </label>
          <label className="toggle-row">
            <input name="five_minute_rule_enabled" type="checkbox" defaultChecked />
            5 perces szabály bekapcsolása
          </label>
          <label className="toggle-row">
            <input name="buy_now_enabled" type="checkbox" />
            Villámár bekapcsolása
          </label>
          <label className="toggle-row form-wide">
            <input name="seller_declaration_accepted" type="checkbox" required />
            Elfogadom, hogy jogosult vagyok a termék értékesítésére és a képek használatára, az adásvétel pedig köztem és a nyertes vevő között jön létre.
          </label>
          {formMessage ? <p className="form-message form-wide">{formMessage}</p> : null}
          <button className="button button-primary form-wide" type="submit" disabled={isCreatingAuction}>
            {isCreatingAuction ? "Feltöltés és feldolgozás..." : "Aukció létrehozása"}
          </button>
        </form>
      </section> : null}
    </>
  );
}
