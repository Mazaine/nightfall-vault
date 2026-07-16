import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { deleteProfile, updateProfile } from "../api/auth";
import { useAuth } from "../AuthContext";
import { NotificationPreferencesPanel } from "../components/NotificationPreferencesPanel";

export function AccountProfilePage() {
  const { user, refreshMe, logout } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ full_name: "", username: "", email: "" });
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [showDelete, setShowDelete] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => { if (user) setForm({ full_name: user.full_name, username: user.username, email: user.email }); }, [user?.email, user?.full_name, user?.username]);

  async function save(event: FormEvent) {
    event.preventDefault();
    setIsSaving(true); setMessage("");
    try {
      await updateProfile({ full_name: form.full_name.trim(), username: form.username.trim(), email: form.email.trim() });
      await refreshMe();
      setIsEditing(false);
      setMessage("A profiladatok mentése sikerült. E-mail-cím módosításakor új megerősítés szükséges.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "A profiladatokat nem sikerült menteni."); }
    finally { setIsSaving(false); }
  }

  async function removeAccount(event: FormEvent) {
    event.preventDefault();
    if (deleteConfirmation !== "FIÓK TÖRLÉSE") { setMessage("A megerősítő mezőbe pontosan ezt írd: FIÓK TÖRLÉSE"); return; }
    setIsDeleting(true); setMessage("");
    try {
      await deleteProfile(deletePassword);
      logout();
      navigate("/", { replace: true });
    } catch (error) { setMessage(error instanceof Error ? error.message : "A fiókot nem sikerült törölni."); setIsDeleting(false); }
  }

  return (
    <>
      <div className="section-heading page-heading compact-page-heading"><div><p className="eyebrow">Fiók</p><h1>Profilbeállítások</h1><p className="section-note">A fiókod alapadatai, értesítései és biztonsági műveletei.</p></div>{user ? <Link className="button button-secondary" to={`/users/${user.username}`}>Publikus profil megnyitása</Link> : null}</div>
      <section className="side-panel profile-settings-card" aria-labelledby="profile-data-title">
        <div className="section-heading"><h2 id="profile-data-title">Alapadatok</h2>{!isEditing ? <button className="button button-secondary" type="button" onClick={() => { setIsEditing(true); setMessage(""); }}>Adatok szerkesztése</button> : null}</div>
        {isEditing ? <form className="stack-form" onSubmit={save}>
          <label htmlFor="profile-full-name">Megjelenítési név</label><input id="profile-full-name" minLength={2} maxLength={160} required value={form.full_name} onChange={(event) => setForm({ ...form, full_name: event.target.value })} />
          <label htmlFor="profile-username">Felhasználónév</label><input id="profile-username" minLength={3} maxLength={80} required value={form.username} onChange={(event) => setForm({ ...form, username: event.target.value })} />
          <label htmlFor="profile-email">E-mail-cím</label><input id="profile-email" type="email" required value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} />
          <div className="form-actions"><button className="button button-primary" type="submit" disabled={isSaving}>{isSaving ? "Mentés…" : "Mentés"}</button><button className="button button-ghost" type="button" disabled={isSaving} onClick={() => { if (user) setForm({ full_name: user.full_name, username: user.username, email: user.email }); setIsEditing(false); }}>Mégse</button></div>
        </form> : <dl className="profile-data-list"><div><dt>Megjelenítési név</dt><dd>{user?.full_name}</dd></div><div><dt>Felhasználónév</dt><dd>@{user?.username}</dd></div><div><dt>E-mail-cím</dt><dd>{user?.email}</dd></div></dl>}
        {message ? <p className="form-message" role="status">{message}</p> : null}
      </section>
      <NotificationPreferencesPanel />
      <section className="side-panel danger-zone" aria-labelledby="delete-account-title">
        <p className="eyebrow">Veszélyes művelet</p><h2 id="delete-account-title">Profil törlése</h2><p>A törlés deaktiválja és anonimizálja a fiókot. Ez a művelet nem vonható vissza.</p>
        {!showDelete ? <button className="button button-danger" type="button" onClick={() => setShowDelete(true)}>Profil törlésének megkezdése</button> : <form className="stack-form" onSubmit={removeAccount}>
          <label htmlFor="delete-password">Jelenlegi jelszó</label><input id="delete-password" type="password" autoComplete="current-password" required value={deletePassword} onChange={(event) => setDeletePassword(event.target.value)} />
          <label htmlFor="delete-confirmation">Megerősítés: írd be, hogy FIÓK TÖRLÉSE</label><input id="delete-confirmation" required value={deleteConfirmation} onChange={(event) => setDeleteConfirmation(event.target.value)} />
          <div className="form-actions"><button className="button button-danger" type="submit" disabled={isDeleting || deleteConfirmation !== "FIÓK TÖRLÉSE"}>{isDeleting ? "Törlés…" : "Profil végleges törlése"}</button><button className="button button-ghost" type="button" disabled={isDeleting} onClick={() => { setShowDelete(false); setDeletePassword(""); setDeleteConfirmation(""); }}>Mégse</button></div>
        </form>}
      </section>
    </>
  );
}
