import { ChangeEvent, FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { activateAuction, cancelAuction, createAuction, listMyAuctions, listMyBidAuctions, updateAuction, uploadAuctionImage, type Auction, type AuctionCondition, type MyBidAuction } from "../api/auctions";
import { AuctionCard } from "../components/AuctionCard";
import { NotificationPreferencesPanel } from "../components/NotificationPreferencesPanel";
import { categories, conditionOptions } from "../data/content";
import { formatMoney, formatRemainingTime } from "../utils/format";

const MAX_AUCTION_IMAGES = 5;

const editableFields = [
  "kĂ©p",
  "lejĂˇrati dĂˇtum",
  "5 perces szabĂˇly ki/be",
  "villĂˇmĂˇr ki/be",
  "leĂ­rĂˇs",
];

const lockedFields = [
  "kezdĹ‘Ăˇr",
  "licitlĂ©pcsĹ‘",
  "mĂˇr megadott villĂˇmĂˇr Ă¶sszege",
];

const conditionMap: Record<string, AuctionCondition> = {
  "Frissen Bontott": "fresh",
  "ĂšjszerĹ±": "like_new",
  "JĂˇtszott": "played",
  "SĂ©rĂĽlt": "damaged",
  "Kopott": "worn",
  "NyomdahibĂˇs": "misprint",
};

function toCardAuction(auction: Auction) {
  return {
    id: auction.id,
    title: auction.title,
    type: auction.category,
    price: formatMoney(auction.current_price ?? auction.starting_price),
    step: formatMoney(auction.bid_increment),
    time: formatRemainingTime(auction.ends_at, auction.status),
    sellerName: "Te",
    sellerRating: "Ă‰rtĂ©kelĂ©s kĂ©sĹ‘bb",
    buyNowPrice: auction.buy_now_enabled ? auction.buy_now_price : null,
    isClosed: ["ended", "sold", "unsold", "cancelled", "suspended"].includes(auction.status),
  };
}

function localDateTimeToIso(value: FormDataEntryValue | null) {
  const textValue = String(value ?? "");
  if (!textValue) {
    throw new Error("A kezdĂ©si Ă©s zĂˇrĂˇsi idĹ‘ megadĂˇsa kĂ¶telezĹ‘.");
  }
  return new Date(textValue).toISOString();
}

export function AccountPage() {
  const [myAuctions, setMyAuctions] = useState<Auction[]>([]);
  const [myBidAuctions, setMyBidAuctions] = useState<MyBidAuction[]>([]);
  const [isLoadingMyAuctions, setIsLoadingMyAuctions] = useState(true);
  const [isLoadingMyBids, setIsLoadingMyBids] = useState(true);
  const [auctionImages, setAuctionImages] = useState<File[]>([]);
  const [coverImageIndex, setCoverImageIndex] = useState(0);
  const [imageMessage, setImageMessage] = useState("");
  const [formMessage, setFormMessage] = useState("");

  const refreshMyAuctions = async () => {
    const refreshedAuctions = await listMyAuctions();
    setMyAuctions(refreshedAuctions);
  };

  const refreshMyBids = async () => {
    const refreshedBids = await listMyBidAuctions();
    setMyBidAuctions(refreshedBids);
  };

  useEffect(() => {
    listMyAuctions()
      .then(setMyAuctions)
      .catch(() => setMyAuctions([]))
      .finally(() => setIsLoadingMyAuctions(false));
    listMyBidAuctions()
      .then(setMyBidAuctions)
      .catch(() => setMyBidAuctions([]))
      .finally(() => setIsLoadingMyBids(false));
  }, []);

  const handleImageChange = (event: ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(event.target.files ?? []);
    const limitedFiles = selectedFiles.slice(0, MAX_AUCTION_IMAGES);

    setAuctionImages(limitedFiles);
    setCoverImageIndex(0);
    setImageMessage(
      selectedFiles.length > MAX_AUCTION_IMAGES
        ? "Legfeljebb 5 kĂ©pet tĂ¶lthetsz fel, ezĂ©rt az elsĹ‘ 5 kĂ©pet tartottuk meg."
        : "",
    );
  };

  const handleCreateAuction = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormMessage("");

    if (auctionImages.length === 0) {
      setImageMessage("LegalĂˇbb 1 kĂ©pet kĂ¶telezĹ‘ feltĂ¶lteni az aukciĂłhoz.");
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
      await refreshMyBids();
      setAuctionImages([]);
      setImageMessage("");
      setFormMessage("Az aukciĂł lĂ©trejĂ¶tt, a kĂ©pek feltĂ¶ltĹ‘dtek, Ă©s az aktivĂˇlĂˇs/idĹ‘zĂ­tĂ©s sikeres.");
      event.currentTarget.reset();
    } catch (error) {
      setFormMessage(error instanceof Error ? error.message : "Az aukciĂł lĂ©trehozĂˇsa nem sikerĂĽlt.");
    }
  };

  const handleEditDescription = async (auction: Auction) => {
    const nextDescription = window.prompt(
      "MĂłdosĂ­thatĂł: leĂ­rĂˇs, kĂ©p, lejĂˇrati dĂˇtum, 5 perces szabĂˇly, villĂˇmĂˇr kapcsolĂł. Nem mĂłdosĂ­thatĂł: kezdĹ‘Ăˇr, licitlĂ©pcsĹ‘, mĂˇr megadott villĂˇmĂˇr Ă¶sszege.",
      auction.description ?? "",
    );
    if (nextDescription === null) {
      return;
    }
    try {
      await updateAuction(auction.id, { description: nextDescription });
      await refreshMyAuctions();
      setFormMessage("Az aukciĂł leĂ­rĂˇsa frissĂĽlt.");
    } catch (error) {
      setFormMessage(error instanceof Error ? error.message : "A mĂłdosĂ­tĂˇs nem sikerĂĽlt.");
    }
  };

  const handleCancelAuction = async (auction: Auction) => {
    if (!window.confirm("Biztosan megszakĂ­tod ezt az aukciĂłt?")) {
      return;
    }
    try {
      await cancelAuction(auction.id);
      await refreshMyAuctions();
      setFormMessage("Az aukciĂł megszakĂ­tva.");
    } catch (error) {
      setFormMessage(error instanceof Error ? error.message : "Az aukciĂł megszakĂ­tĂˇsa nem sikerĂĽlt.");
    }
  };

  return (
    <section className="container page-shell account-auctions-page">
      <p className="eyebrow">Licitjeim</p>
      <div className="section-heading page-heading">
        <div>
          <h1>Licitjeim Ă©s sajĂˇt aukciĂłim</h1>
          <p className="hero-lead">
            Itt kĂ¶vetheted azokat az aukciĂłkat, amelyekre licitĂˇltĂˇl, Ă©s innen
            kezelheted a sajĂˇt feltĂ¶ltĂ©seidet is.
          </p>
        </div>
        <a className="button button-primary" href="#auction-create">AukciĂł lĂ©trehozĂˇsa</a>
      </div>

      <NotificationPreferencesPanel />

      <section className="account-section" aria-labelledby="watched-auctions-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">KĂ¶vetĂ©s</p>
            <h2 id="watched-auctions-title">AukciĂłk, amelyekre licitĂˇltĂˇl</h2>
          </div>
          <p className="section-note">A lezĂˇrt aukciĂłk 24 ĂłrĂˇig elszĂĽrkĂ­tve lĂˇtszanak, utĂˇna eltĹ±nnek.</p>
        </div>

        <div className="side-panel">
          {isLoadingMyBids ? "LicitĂˇlt aukciĂłk betĂ¶ltĂ©se..." : null}
          {!isLoadingMyBids && myBidAuctions.length === 0 ? "MĂ©g nincs olyan aukciĂł, amelyre licitĂˇltĂˇl." : null}
          {!isLoadingMyBids && myBidAuctions.length > 0 ? (
            <div className="my-bids-list">
              {myBidAuctions.map((item) => (
                <Link className="my-bid-row" to={`/auctions/${item.auction.id}`} key={item.auction.id}>
                  <strong>{item.auction.title}</strong>
                  <span>AktuĂˇlis licit: {formatMoney(item.auction.current_price)}</span>
                  <span>SajĂˇt legmagasabb licit: {formatMoney(item.my_highest_bid)}</span>
                  {item.has_won ? <em>Megnyerted</em> : item.is_leading ? <em>Te vezetsz</em> : item.is_outbid ? <em>RĂˇd licitĂˇltak</em> : <em>FigyelĂ©s alatt</em>}
                </Link>
              ))}
            </div>
          ) : null}
        </div>
      </section>

      <section className="account-section" aria-labelledby="own-auctions-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">FeltĂ¶ltĂ©seim</p>
            <h2 id="own-auctions-title">SajĂˇt aukciĂłim</h2>
          </div>
          <p className="section-note">A lezĂˇrt sajĂˇt aukciĂłk szintĂ©n 24 ĂłrĂˇig maradnak lĂˇthatĂłk.</p>
        </div>

        <div className="auction-grid page-grid">
          {isLoadingMyAuctions ? <div className="side-panel">SajĂˇt aukciĂłk betĂ¶ltĂ©se...</div> : null}
          {!isLoadingMyAuctions && myAuctions.length === 0 ? <div className="side-panel">MĂ©g nincs sajĂˇt aukciĂłd.</div> : null}
          {myAuctions.map((auction, index) => (
            <div className="own-auction-card" key={auction.id}>
              <AuctionCard
                item={toCardAuction(auction)}
                index={index}
                detailPath={`/auctions/${auction.id}`}
                showBidActions={false}
              />
              <div className="owner-actions">
                <button className="button button-secondary" type="button" onClick={() => handleEditDescription(auction)}>MĂłdosĂ­tĂˇs</button>
                <button className="button button-danger" type="button" onClick={() => handleCancelAuction(auction)}>TĂ¶rlĂ©s</button>
              </div>
            </div>
          ))}
        </div>

        <div className="side-panel edit-rules-panel">
          <h3>Mit mĂłdosĂ­thatsz egy sajĂˇt aukciĂłn?</h3>
          <div className="rules-grid">
            <div>
              <h4>MĂłdosĂ­thatĂł</h4>
              <ul>
                {editableFields.map((field) => <li key={field}>{field}</li>)}
              </ul>
            </div>
            <div>
              <h4>Nem mĂłdosĂ­thatĂł</h4>
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
            <p className="eyebrow">Ăšj feltĂ¶ltĂ©s</p>
            <h2 id="auction-create-title">AukciĂł lĂ©trehozĂˇsa</h2>
          </div>
          <Link className="text-link" to="/how-it-works">SzabĂˇlyok rĂ©szletesen</Link>
        </div>

        <form className="side-panel auction-create-form" onSubmit={handleCreateAuction}>
          <label>
            NĂ©v
            <input name="title" type="text" placeholder="AukciĂł cĂ­me" required />
          </label>
          <div className="form-wide image-upload-field">
            <label>
              KĂ©pek
              <input type="file" accept="image/*" multiple onChange={handleImageChange} />
            </label>
            <small>
              Minimum 1, maximum 5 kĂ©p tĂ¶lthetĹ‘ fel. VĂˇlaszd ki, melyik legyen a borĂ­tĂłkĂ©p.
            </small>
            {auctionImages.length > 0 ? (
              <div className="cover-image-list" aria-label="BorĂ­tĂłkĂ©p kivĂˇlasztĂˇsa">
                {auctionImages.map((file, index) => (
                  <label className="cover-image-option" key={`${file.name}-${file.lastModified}`}>
                    <input
                      type="radio"
                      name="coverImage"
                      checked={coverImageIndex === index}
                      onChange={() => setCoverImageIndex(index)}
                    />
                    <span>{index + 1}. kĂ©p</span>
                    <strong>{file.name}</strong>
                    {coverImageIndex === index ? <em>BorĂ­tĂłkĂ©p</em> : null}
                  </label>
                ))}
              </div>
            ) : null}
            {imageMessage ? <p className="form-message">{imageMessage}</p> : null}
          </div>
          <label className="form-wide">
            LeĂ­rĂˇs
            <textarea name="description" rows={5} placeholder="Ăllapot, kiadĂˇs, kĂĽlĂ¶nleges tudnivalĂłk..." required />
          </label>
          <label>
            KategĂłria
            <select name="category">
              {categories.map((category) => <option key={category}>{category}</option>)}
            </select>
          </label>
          <label>
            Ăllapot
            <select name="condition">
              {conditionOptions.map((condition) => <option key={condition}>{condition}</option>)}
            </select>
          </label>
          <label>
            KezdĹ‘Ăˇr
            <input name="starting_price" type="number" min="1" placeholder="0" required />
            <small>Ezt kĂ©sĹ‘bb nem mĂłdosĂ­thatod.</small>
          </label>
          <label>
            LicitlĂ©pcsĹ‘
            <input name="bid_increment" type="number" min="1" placeholder="500" required />
            <small>Ezt kĂ©sĹ‘bb nem mĂłdosĂ­thatod.</small>
          </label>
          <label>
            VillĂˇmĂˇr
            <input name="buy_now_price" type="number" min="1" placeholder="OpcionĂˇlis" />
            <small>Az Ă¶sszeget kĂ©sĹ‘bb nem mĂłdosĂ­thatod.</small>
          </label>
          <label>
            KezdĂ©si dĂˇtum
            <input name="starts_at" type="datetime-local" required />
          </label>
          <label>
            LejĂˇrati dĂˇtum
            <input name="ends_at" type="datetime-local" required />
          </label>
          <label className="toggle-row">
            <input name="five_minute_rule_enabled" type="checkbox" defaultChecked />
            5 perces szabĂˇly bekapcsolĂˇsa
          </label>
          <label className="toggle-row">
            <input name="buy_now_enabled" type="checkbox" />
            VillĂˇmĂˇr bekapcsolĂˇsa
          </label>
          <label className="toggle-row form-wide">
            <input name="seller_declaration_accepted" type="checkbox" required />
            Elfogadom, hogy jogosult vagyok a termĂ©k Ă©rtĂ©kesĂ­tĂ©sĂ©re Ă©s a kĂ©pek hasznĂˇlatĂˇra, az adĂˇsvĂ©tel pedig kĂ¶ztem Ă©s a nyertes vevĹ‘ kĂ¶zĂ¶tt jĂ¶n lĂ©tre.
          </label>
          {formMessage ? <p className="form-message form-wide">{formMessage}</p> : null}
          <button className="button button-primary form-wide" type="submit">
            AukciĂł lĂ©trehozĂˇsa
          </button>
        </form>
      </section>
    </section>
  );
}
