import { ChangeEvent, FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { activateAuction, cancelAuction, createAuction, listMyAuctions, updateAuction, uploadAuctionImage, type Auction, type AuctionCondition } from "../api/auctions";
import { AuctionCard } from "../components/AuctionCard";
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
  return {
    id: auction.id,
    title: auction.title,
    type: auction.category,
    price: formatMoney(auction.starting_price),
    step: formatMoney(auction.bid_increment),
    time: formatRemainingTime(auction.ends_at, auction.status),
    sellerName: "Te",
    sellerRating: "Értékelés később",
    buyNowPrice: auction.buy_now_enabled ? auction.buy_now_price : null,
    isClosed: ["ended", "sold", "unsold", "cancelled", "suspended"].includes(auction.status),
  };
}

function localDateTimeToIso(value: FormDataEntryValue | null) {
  const textValue = String(value ?? "");
  if (!textValue) {
    throw new Error("A kezdési és zárási idő megadása kötelező.");
  }
  return new Date(textValue).toISOString();
}

export function AccountPage() {
  const [myAuctions, setMyAuctions] = useState<Auction[]>([]);
  const [isLoadingMyAuctions, setIsLoadingMyAuctions] = useState(true);
  const [auctionImages, setAuctionImages] = useState<File[]>([]);
  const [coverImageIndex, setCoverImageIndex] = useState(0);
  const [imageMessage, setImageMessage] = useState("");
  const [formMessage, setFormMessage] = useState("");

  const refreshMyAuctions = async () => {
    const refreshedAuctions = await listMyAuctions();
    setMyAuctions(refreshedAuctions);
  };

  useEffect(() => {
    listMyAuctions()
      .then(setMyAuctions)
      .catch(() => setMyAuctions([]))
      .finally(() => setIsLoadingMyAuctions(false));
  }, []);

  const handleImageChange = (event: ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(event.target.files ?? []);
    const limitedFiles = selectedFiles.slice(0, MAX_AUCTION_IMAGES);

    setAuctionImages(limitedFiles);
    setCoverImageIndex(0);
    setImageMessage(
      selectedFiles.length > MAX_AUCTION_IMAGES
        ? "Legfeljebb 5 képet tölthetsz fel, ezért az első 5 képet tartottuk meg."
        : "",
    );
  };

  const handleCreateAuction = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormMessage("");

    if (auctionImages.length === 0) {
      setImageMessage("Legalább 1 képet kötelező feltölteni az aukcióhoz.");
      return;
    }

    const formData = new FormData(event.currentTarget);

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
        await uploadAuctionImage(auction.id, file, index === coverImageIndex);
      }

      await activateAuction(auction.id);
      await refreshMyAuctions();
      setAuctionImages([]);
      setImageMessage("");
      setFormMessage("Az aukció létrejött, a képek feltöltődtek, és az aktiválás/időzítés sikeres.");
      event.currentTarget.reset();
    } catch (error) {
      setFormMessage(error instanceof Error ? error.message : "Az aukció létrehozása nem sikerült.");
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

  return (
    <section className="container page-shell account-auctions-page">
      <p className="eyebrow">Licitjeim</p>
      <div className="section-heading page-heading">
        <div>
          <h1>Licitjeim és saját aukcióim</h1>
          <p className="hero-lead">
            Itt követheted azokat az aukciókat, amelyekre licitáltál, és innen
            kezelheted a saját feltöltéseidet is.
          </p>
        </div>
        <a className="button button-primary" href="#auction-create">Aukció létrehozása</a>
      </div>

      <section className="account-section" aria-labelledby="watched-auctions-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Követés</p>
            <h2 id="watched-auctions-title">Aukciók, amelyekre licitáltál</h2>
          </div>
          <p className="section-note">A lezárt aukciók 24 óráig elszürkítve látszanak, utána eltűnnek.</p>
        </div>

        <div className="side-panel">
          A teljes licitmotor Sprint 3-ra marad, ezért a licitált aukciók listája akkor fog backend adatból feltöltődni.
        </div>
      </section>

      <section className="account-section" aria-labelledby="own-auctions-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Feltöltéseim</p>
            <h2 id="own-auctions-title">Saját aukcióim</h2>
          </div>
          <p className="section-note">A lezárt saját aukciók szintén 24 óráig maradnak láthatók.</p>
        </div>

        <div className="auction-grid page-grid">
          {isLoadingMyAuctions ? <div className="side-panel">Saját aukciók betöltése...</div> : null}
          {!isLoadingMyAuctions && myAuctions.length === 0 ? <div className="side-panel">Még nincs saját aukciód.</div> : null}
          {myAuctions.map((auction, index) => (
            <div className="own-auction-card" key={auction.id}>
              <AuctionCard
                item={toCardAuction(auction)}
                index={index}
                detailPath={`/auctions/${auction.id}`}
                showBidActions={false}
              />
              <div className="owner-actions">
                <button className="button button-secondary" type="button" onClick={() => handleEditDescription(auction)}>Módosítás</button>
                <button className="button button-danger" type="button" onClick={() => handleCancelAuction(auction)}>Törlés</button>
              </div>
            </div>
          ))}
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
      </section>

      <section className="account-section" id="auction-create" aria-labelledby="auction-create-title">
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
              <input type="file" accept="image/*" multiple onChange={handleImageChange} />
            </label>
            <small>
              Minimum 1, maximum 5 kép tölthető fel. Válaszd ki, melyik legyen a borítókép.
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
                  </label>
                ))}
              </div>
            ) : null}
            {imageMessage ? <p className="form-message">{imageMessage}</p> : null}
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
          <button className="button button-primary form-wide" type="submit">
            Aukció létrehozása
          </button>
        </form>
      </section>
    </section>
  );
}
