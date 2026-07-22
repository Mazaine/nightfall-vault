import { FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { listAdminUsers, searchAdminUsers, type AdminUser } from "../../api/admin";
import { formatLocalDateTime } from "../../utils/format";
import { EmptyState, ErrorState, LoadingState } from "../../components/AsyncStates";

export function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [query, setQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  const load = async (search = "") => {
    setIsLoading(true);
    setError("");
    try {
      setUsers(search.trim().length >= 2 ? await searchAdminUsers(search.trim()) : await listAdminUsers());
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "A felhasználók betöltése nem sikerült.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void load(query);
  };

  return (
    <section className="admin-page" aria-labelledby="admin-users-title">
      <div className="section-heading page-heading">
        <div>
          <p className="eyebrow">Admin</p>
          <h1 id="admin-users-title">Felhasználók</h1>
          <p className="section-note">Fiókok, szerepkörök és hitelesítési állapotok áttekintése.</p>
        </div>
      </div>

      <form className="side-panel admin-search-row" role="search" onSubmit={submitSearch}>
        <label htmlFor="admin-user-search">Keresés név, felhasználónév vagy e-mail alapján</label>
        <div>
          <input id="admin-user-search" value={query} onChange={(event) => setQuery(event.target.value)} minLength={2} placeholder="Legalább 2 karakter" />
          <button className="button button-primary" type="submit">Keresés</button>
          <button className="button button-secondary" type="button" onClick={() => { setQuery(""); void load(); }}>Alaphelyzet</button>
        </div>
      </form>

      {error ? <ErrorState message={error} onRetry={() => void load(query)} /> : null}
      {isLoading ? <LoadingState label="Felhasználók betöltése" cards={2} /> : null}
      {!isLoading && !error && users.length === 0 ? <EmptyState title="Nincs a keresésnek megfelelő felhasználó" action={<button className="button button-secondary" type="button" onClick={() => { setQuery(""); void load(); }}>Keresés törlése</button>} /> : null}

      {!isLoading && users.length > 0 ? (
        <div className="admin-user-list" aria-label="Felhasználólista">
          {users.map((user) => (
            <article className="side-panel admin-user-card" key={user.id}>
              <div className="admin-user-main">
                <div>
                  <strong>{user.full_name}</strong>
                  <span>@{user.username} · #{user.id}</span>
                </div>
                <div className="admin-badge-row">
                  <span className="status-pill">{user.role === "admin" ? "Admin" : "Felhasználó"}</span>
                  <span className="status-pill">{user.is_active ? "Aktív" : "Inaktív"}</span>
                  <span className="status-pill">{user.is_email_verified ? "E-mail megerősítve" : "E-mail nincs megerősítve"}</span>
                </div>
              </div>
              <dl className="admin-user-meta">
                <div><dt>E-mail</dt><dd>{user.email}</dd></div>
                <div><dt>Regisztrált</dt><dd>{formatLocalDateTime(user.created_at)}</dd></div>
              </dl>
              <Link className="button button-secondary" to={`/users/${user.username}`}>Profil megnyitása</Link>
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
}
