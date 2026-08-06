import { FormEvent, useEffect, useState } from "react";
import { Link } from "react-router";
import { listAdminUsers, searchAdminUsers, updateBidWithdrawalRestriction, type AdminUser } from "../../api/admin";
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

  const changeWithdrawalRestriction = async (event: FormEvent<HTMLFormElement>, user: AdminUser) => {
    event.preventDefault();
    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const action = submitter?.value;
    const data = new FormData(event.currentTarget);
    const reason = String(data.get("reason") ?? "").trim();
    if (reason.length < 3) { setError("A licit-visszavonási korlátozáshoz legalább 3 karakteres admini indok szükséges."); return; }
    const localExpiry = String(data.get("disabled_until") ?? "");
    if (action === "temporary" && !localExpiry) { setError("Ideiglenes korlátozáshoz adj meg lejárati időt."); return; }
    if (action === "permanent" && !window.confirm(`Biztosan végleg letiltod ${user.full_name} licit-visszavonási jogát?`)) return;
    try {
      await updateBidWithdrawalRestriction(user.id, {
        disabled_until: action === "temporary" ? new Date(localExpiry).toISOString() : null,
        permanently_disabled: action === "permanent",
        reason,
      });
      await load(query);
    } catch (reasonValue) { setError(reasonValue instanceof Error ? reasonValue.message : "A korlátozás módosítása nem sikerült."); }
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
                <div><dt>Összes / aktív / visszavont licit</dt><dd>{user.total_bids} / {user.active_bids} / {user.withdrawn_bids}</dd></div>
                <div><dt>Sikeres visszavonások</dt><dd>{user.bid_withdrawal_count}</dd></div>
                <div><dt>Figyelmeztetési szint</dt><dd>{user.bid_withdrawal_warning_level || "Nincs"}</dd></div>
                <div><dt>Utolsó visszavonás</dt><dd>{user.last_bid_withdrawal_at ? formatLocalDateTime(user.last_bid_withdrawal_at) : "Nincs"}</dd></div>
                <div><dt>Visszavonási korlátozás</dt><dd>{user.bid_withdrawal_permanently_disabled ? "Végleges" : user.bid_withdrawal_disabled_until ? `Eddig: ${formatLocalDateTime(user.bid_withdrawal_disabled_until)}` : "Nincs"}</dd></div>
              </dl>
              {user.role !== "admin" ? <form className="stack-form admin-withdrawal-restriction" onSubmit={(event) => void changeWithdrawalRestriction(event, user)}>
                <label>Admini indok<input name="reason" minLength={3} maxLength={1000} required /></label>
                <label>Ideiglenes tiltás lejárata<input name="disabled_until" type="datetime-local" /></label>
                <div className="form-actions"><button className="button button-secondary" name="action" value="temporary" type="submit">Ideiglenes tiltás</button><button className="button button-danger" name="action" value="permanent" type="submit">Végleges tiltás</button><button className="button button-ghost" name="action" value="clear" type="submit">Korlátozás feloldása</button></div>
              </form> : null}
              <Link className="button button-secondary" to={`/users/${user.username}`}>Profil megnyitása</Link>
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
}
