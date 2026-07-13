import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { deleteSavedSearch, listSavedSearches, type SavedSearch } from "../api/searches";
import { EmptyState, ErrorState, LoadingState } from "../components/AsyncStates";

function searchPath(item: SavedSearch) {
  const params = new URLSearchParams();
  Object.entries(item).forEach(([key, value]) => {
    if (["id", "name", "created_at", "limit", "offset"].includes(key) || value === undefined || value === null || value === "" || value === false) return;
    params.set(key === "query" ? "q" : key, String(value));
  });
  return `/auctions?${params.toString()}`;
}

export function SavedSearchesPage() {
  const [items, setItems] = useState<SavedSearch[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    listSavedSearches().then(setItems).catch((err: Error) => setError(err.message)).finally(() => setIsLoading(false));
  }, []);

  const remove = async (id: number) => {
    try {
      await deleteSavedSearch(id);
      setItems((current) => current.filter((item) => item.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "A mentett keresés törlése nem sikerült.");
    }
  };

  return (
    <>
      <p className="eyebrow">Fiók</p>
      <div className="section-heading page-heading"><div><h1>Mentett keresések</h1><p className="section-note">A találatokról kizárólag alkalmazáson belüli értesítés készül.</p></div><Link className="button button-primary" to="/auctions">Új keresés</Link></div>
      {isLoading ? <LoadingState label="Mentett keresések betöltése" /> : null}
      {error ? <ErrorState message={error} /> : null}
      {!isLoading && !error && items.length === 0 ? <EmptyState title="Még nincs mentett keresésed" action={<Link className="button button-primary" to="/auctions">Új keresés</Link>} /> : null}
      <div className="list-panel">
        {items.map((item) => <article className="side-panel saved-search-row" key={item.id}><div><h2>{item.name}</h2><p>{item.query || item.title || item.category || "Összetett aukciókeresés"}</p></div><div className="auction-actions"><Link className="button button-secondary" to={searchPath(item)}>Találatok</Link><button className="button button-danger" type="button" onClick={() => remove(item.id)}>Törlés</button></div></article>)}
      </div>
    </>
  );
}
