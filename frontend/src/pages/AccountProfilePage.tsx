import { Link } from "react-router-dom";
import { useAuth } from "../AuthContext";
import { NotificationPreferencesPanel } from "../components/NotificationPreferencesPanel";

export function AccountProfilePage() {
  const { user } = useAuth();

  return (
    <>
      <div className="section-heading page-heading compact-page-heading">
        <div><p className="eyebrow">Fiók</p><h1>Profilbeállítások</h1><p className="section-note">A fiókod alapadatai és értesítési beállításai.</p></div>
        {user ? <Link className="button button-secondary" to={`/users/${user.username}`}>Publikus profil megnyitása</Link> : null}
      </div>
      <section className="side-panel profile-settings-card" aria-labelledby="profile-data-title">
        <h2 id="profile-data-title">Alapadatok</h2>
        <dl className="profile-data-list">
          <div><dt>Megjelenítési név</dt><dd>{user?.full_name}</dd></div>
          <div><dt>Felhasználónév</dt><dd>@{user?.username}</dd></div>
          <div><dt>E-mail-cím</dt><dd>{user?.email}</dd></div>
        </dl>
        <p className="section-note">Az alapadatok szerkesztéséhez még nincs aktív backend végpont; a felület ezért nem ígér nem támogatott mentést.</p>
      </section>
      <NotificationPreferencesPanel />
      <section className="side-panel" aria-labelledby="security-title">
        <h2 id="security-title">Biztonság</h2>
        <p>A jelszó-visszaállítás a bejelentkezési felületről érhető el. Aktív munkamenetnél mindig jelentkezz ki megosztott eszközön.</p>
        <Link className="text-link" to="/login">Bejelentkezési felület</Link>
      </section>
    </>
  );
}
