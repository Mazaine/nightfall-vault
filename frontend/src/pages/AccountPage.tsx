import { ChangeEvent, FormEvent, useState } from "react";
import { Link } from "react-router-dom";
import { AuctionCard } from "../components/AuctionCard";
import { categories, conditionOptions, ownAuctions, watchedAuctions } from "../data/content";

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

export function AccountPage() {
  const [auctionImages, setAuctionImages] = useState<File[]>([]);
  const [coverImageIndex, setCoverImageIndex] = useState(0);
  const [imageMessage, setImageMessage] = useState("");

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

  const handleCreateAuction = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (auctionImages.length === 0) {
      setImageMessage("Legalább 1 képet kötelező feltölteni az aukcióhoz.");
      return;
    }

    setImageMessage("A képfeltöltési adatok rendben vannak. A bekötés a backend aukció API elkészülésekor történik.");
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

        <div className="auction-grid page-grid">
          {watchedAuctions.map((auction, index) => (
            <AuctionCard
              item={auction}
              index={index}
              detailPath={`/auctions/${auction.id}`}
              actionLabel="Részletek"
              key={auction.id}
            />
          ))}
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
          {ownAuctions.map((auction, index) => (
            <div className="own-auction-card" key={auction.id}>
              <AuctionCard
                item={auction}
                index={index}
                detailPath={`/auctions/${auction.id}`}
                actionLabel="Részletezés"
                showBidActions={false}
              />
              <div className="owner-actions">
                <button className="button button-secondary" type="button">Módosítás</button>
                <button className="button button-danger" type="button">Törlés</button>
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
            <input type="text" placeholder="Aukció címe" />
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
            <textarea rows={5} placeholder="Állapot, kiadás, különleges tudnivalók..." />
          </label>
          <label>
            Kategória
            <select>
              {categories.map((category) => <option key={category}>{category}</option>)}
            </select>
          </label>
          <label>
            Állapot
            <select>
              {conditionOptions.map((condition) => <option key={condition}>{condition}</option>)}
            </select>
          </label>
          <label>
            Kezdőár
            <input type="number" min="0" placeholder="0" />
            <small>Ezt később nem módosíthatod.</small>
          </label>
          <label>
            Licitlépcső
            <input type="number" min="0" placeholder="500" />
            <small>Ezt később nem módosíthatod.</small>
          </label>
          <label>
            Villámár
            <input type="number" min="0" placeholder="Opcionális" />
            <small>Az összeget később nem módosíthatod.</small>
          </label>
          <label>
            Lejárati dátum
            <input type="datetime-local" />
          </label>
          <label className="toggle-row">
            <input type="checkbox" />
            5 perces szabály bekapcsolása
          </label>
          <label className="toggle-row">
            <input type="checkbox" />
            Villámár bekapcsolása
          </label>
          <button className="button button-primary form-wide" type="submit">
            Aukció létrehozása
          </button>
        </form>
      </section>
    </section>
  );
}
