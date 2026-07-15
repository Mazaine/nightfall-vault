import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { listBlocks, unblockUser, type BlockRead } from "../api/blocks";
import { EmptyState, ErrorState, LoadingState } from "../components/AsyncStates";
import { formatLocalDateTime } from "../utils/format";

function blockUserData(item: BlockRead) {
  const username = item.username || item.blocked_username || "";
  return {
    username,
    fullName: item.full_name || item.blocked_full_name || username,
    blockedAt: item.blocked_at || item.created_at || "",
  };
}

function initials(name: string, username: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return (parts.length >= 2 ? `${parts[0][0]}${parts[1][0]}` : parts[0]?.slice(0, 2) || username.slice(0, 2) || "?").toUpperCase();
}

export function AccountBlockedUsersPage() {
  const [items, setItems] = useState<BlockRead[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [pendingUsername, setPendingUsername] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError("");
    try {
      setItems(await listBlocks());
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "A blokkolások betöltése nem sikerült.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const remove = async (item: BlockRead) => {
    const { username } = blockUserData(item);
    if (!username || pendingUsername !== null) return;
    setPendingUsername(username);
    setError("");
    try {
      await unblockUser(username);
      setItems((current) => current.filter((entry) => blockUserData(entry).username !== username));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "A blokkolás feloldása nem sikerült.");
    } finally {
      setPendingUsername(null);
    }
  };

  return (
    <>
      <div className="section-heading page-heading compact-page-heading blocked-users-page-heading">
        <div>
          <p className="eyebrow">Adatvédelem</p>
          <h1>Blokkolt felhasználók</h1>
          <p className="section-note">A blokkolt felhasználók nem követhetnek, és nem küldhetnek neked aukcióhoz kapcsolódó üzenetet.</p>
        </div>
      </div>

      {isLoading ? <LoadingState label="Blokkolások betöltése" /> : null}
      {error ? <ErrorState message={error} onRetry={() => void load()} /> : null}
      {!isLoading && !error && items.length === 0 ? <EmptyState title="Nincs blokkolt felhasználó" action={<Link className="button button-primary" to="/auctions">Aukciók böngészése</Link>} /> : null}

      <div className="list-panel blocked-users-list">
        {items.map((item) => {
          const user = blockUserData(item);
          return (
            <article className="side-panel blocked-user-card" key={user.username}>
              <div className="blocked-user-main">
                <span className="blocked-user-avatar" aria-hidden="true">{initials(user.fullName, user.username)}</span>
                <div className="blocked-user-identity">
                  <p className="blocked-user-label">Blokkolt profil</p>
                  <h2>{user.fullName}</h2>
                  <Link className="text-link" to={`/users/${user.username}`}>@{user.username}</Link>
                </div>
              </div>

              <div className="blocked-user-meta">
                <span>Blokkolás időpontja</span>
                <strong>{user.blockedAt ? formatLocalDateTime(user.blockedAt) : "Nem ismert"}</strong>
              </div>

              <div className="blocked-user-actions">
                <Link className="button button-ghost" to={`/users/${user.username}`}>Profil megnyitása</Link>
                <button className="button button-secondary" type="button" disabled={pendingUsername !== null} onClick={() => void remove(item)}>
                  {pendingUsername === user.username ? "Feloldás..." : "Blokkolás feloldása"}
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </>
  );
}
