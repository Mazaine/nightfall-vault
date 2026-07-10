import { FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { changePassword, deleteMe, updateMe } from "../api/auth";
import { getMyNewsletterStatus, updateMyNewsletterStatus } from "../api/newsletter";
import { SiteHeader } from "../components/SiteHeader";
import { Button, Card, PageHeader } from "../components/ui";
import { useAuth } from "../hooks/useAuth";
import { useI18n } from "../i18n";
import "./AccountPage.css";

type AccountPageProps = { cartCount: number };

export function AccountPage({ cartCount }: AccountPageProps) {
  const { t } = useI18n();
  const { user, logout, refreshMe } = useAuth();
  const [profileForm, setProfileForm] = useState({ full_name: user?.full_name ?? "", username: user?.username ?? "", email: user?.email ?? "" });
  const [passwordForm, setPasswordForm] = useState({ current_password: "", new_password: "", confirm_password: "" });
  const [newsletterChecked, setNewsletterChecked] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { getMyNewsletterStatus().then((res) => setNewsletterChecked(res.is_active)).catch(() => setNewsletterChecked(false)); }, []);

  async function run(action: () => Promise<void>, success: string) { try { setError(null); await action(); setMessage(success); } catch { setError(t("common.error")); } }
  async function saveProfile(event: FormEvent<HTMLFormElement>) { event.preventDefault(); await run(async () => { await updateMe(profileForm); await refreshMe(); }, t("account.profileSaved")); }
  async function savePassword(event: FormEvent<HTMLFormElement>) { event.preventDefault(); await run(async () => { await changePassword(passwordForm); setPasswordForm({ current_password: "", new_password: "", confirm_password: "" }); }, t("account.passwordSaved")); }
  async function saveNewsletter() { await run(async () => { await updateMyNewsletterStatus(newsletterChecked); }, t("account.newsletterSaved")); }
  async function removeAccount(event: FormEvent<HTMLFormElement>) { event.preventDefault(); await deleteMe(deletePassword); logout(); }

  return (
    <main className="app-shell">
      <SiteHeader cartCount={cartCount} />
      <section className="account-page page-content">
        <PageHeader eyebrow={t("nav.account")} title={t("account.title")} lead={t("account.lead")} />
        {message ? <div className="account-message">{message}</div> : null}
        {error ? <div className="account-error">{error}</div> : null}
        <div className="account-actions"><Link to="/my-orders">{t("account.myOrders")}</Link></div>
        <div className="account-grid">
          <form onSubmit={saveProfile} className="account-card"><h2>{t("account.profile")}</h2><input aria-label={t("common.name")} value={profileForm.full_name} onChange={(e) => setProfileForm((c) => ({ ...c, full_name: e.target.value }))} /><input aria-label={t("common.username")} value={profileForm.username} onChange={(e) => setProfileForm((c) => ({ ...c, username: e.target.value }))} /><input aria-label={t("common.email")} value={profileForm.email} onChange={(e) => setProfileForm((c) => ({ ...c, email: e.target.value }))} /><Button type="submit">{t("common.save")}</Button></form>
          <form onSubmit={savePassword} className="account-card"><h2>{t("account.password")}</h2><input type="password" value={passwordForm.current_password} onChange={(e) => setPasswordForm((c) => ({ ...c, current_password: e.target.value }))} placeholder={t("auth.currentPassword")} /><input type="password" value={passwordForm.new_password} onChange={(e) => setPasswordForm((c) => ({ ...c, new_password: e.target.value }))} placeholder={t("auth.newPassword")} /><input type="password" value={passwordForm.confirm_password} onChange={(e) => setPasswordForm((c) => ({ ...c, confirm_password: e.target.value }))} placeholder={t("auth.confirmPassword")} /><Button type="submit">{t("common.update")}</Button></form>
          <Card className="account-card"><h2>{t("account.newsletter")}</h2><label><input type="checkbox" checked={newsletterChecked} onChange={(e) => setNewsletterChecked(e.target.checked)} /> {t("auth.newsletter")}</label><Button type="button" onClick={saveNewsletter}>{t("common.save")}</Button></Card>
          <form onSubmit={removeAccount} className="account-card danger-zone"><h2>{t("account.deleteAccount")}</h2><p>{t("account.dangerLead")}</p><input type="password" value={deletePassword} onChange={(e) => setDeletePassword(e.target.value)} placeholder={t("common.password")} /><Button variant="secondary" type="submit">{t("account.deleteAccount")}</Button></form>
        </div>
      </section>
    </main>
  );
}
