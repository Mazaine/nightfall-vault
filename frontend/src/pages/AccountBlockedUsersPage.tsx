import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { listBlocks, unblockUser, type BlockRead } from "../api/blocks";
import { EmptyState, ErrorState, LoadingState } from "../components/AsyncStates";

export function AccountBlockedUsersPage() {
  const [items, setItems] = useState<BlockRead[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const load = useCallback(async () => { setIsLoading(true); setError(""); try { setItems(await listBlocks()); } catch (reason) { setError(reason instanceof Error ? reason.message : "A blokkolások betöltése nem sikerült."); } finally { setIsLoading(false); } }, []);
  useEffect(() => { void load(); }, [load]);
  const remove = async (item: BlockRead) => { try { await unblockUser(item.blocked_username); setItems((current) => current.filter((entry) => entry.id !== item.id)); } catch (reason) { setError(reason instanceof Error ? reason.message : "A feloldás nem sikerült."); } };

  return <><div className="section-heading page-heading compact-page-heading"><div><p className="eyebrow">Adatvédelem</p><h1>Blokkolt felhasználók</h1><p className="section-note">A blokkolás az új követést és aukcióhoz kötött üzenetet tiltja.</p></div></div>{isLoading ? <LoadingState label="Blokkolások betöltése" /> : null}{error ? <ErrorState message={error} onRetry={() => void load()} /> : null}{!isLoading && !error && items.length === 0 ? <EmptyState title="Nincs blokkolt felhasználó" /> : null}<div className="list-panel">{items.map((item) => <article className="side-panel saved-search-row" key={item.id}><div><h2>{item.blocked_full_name || item.blocked_username}</h2><Link className="text-link" to={`/users/${item.blocked_username}`}>@{item.blocked_username}</Link></div><button className="button button-secondary" type="button" onClick={() => void remove(item)}>Blokkolás feloldása</button></article>)}</div></>;
}
