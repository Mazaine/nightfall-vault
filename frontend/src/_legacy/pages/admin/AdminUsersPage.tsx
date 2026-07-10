import { useEffect, useState } from "react";
import { deleteAdminUser, getAdminUsers, updateAdminUser } from "../../api/admin";
import { AdminLayout } from "../../components/AdminLayout";
import { Badge, EmptyState, ErrorState, LoadingState, PageHeader } from "../../components/ui";
import { useI18n } from "../../i18n";
import type { User, UserRole } from "../../types";
import "./AdminUsersPage.css";

type AdminUsersPageProps = { cartCount: number };

export function AdminUsersPage({ cartCount }: AdminUsersPageProps) {
  const { t } = useI18n();
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(false);
  function refresh() { setIsLoading(true); getAdminUsers().then(setUsers).catch(() => setError(true)).finally(() => setIsLoading(false)); }
  useEffect(refresh, []);
  async function setRole(user: User, role: UserRole) { const updated = await updateAdminUser(user.id, { role }); setUsers((items) => items.map((item) => item.id === user.id ? updated : item)); }
  async function toggleActive(user: User) { const updated = await updateAdminUser(user.id, { is_active: !user.is_active }); setUsers((items) => items.map((item) => item.id === user.id ? updated : item)); }
  async function remove(user: User) { const updated = await deleteAdminUser(user.id); setUsers((items) => items.map((item) => item.id === user.id ? updated : item)); }
  return <AdminLayout cartCount={cartCount}><section className="admin-users-page"><PageHeader eyebrow="Admin" title={t("admin.users")} lead={t("admin.manageUsers")} />{isLoading ? <LoadingState text={t("states.loadingUsers")} /> : null}{error ? <ErrorState title={t("states.userError")} /> : null}{!isLoading && !error && users.length === 0 ? <EmptyState title={t("common.empty")} /> : null}<div className="admin-users-list">{users.map((user) => <article className="admin-user-card" key={user.id}><div><strong>{user.full_name}</strong><span>{user.email}</span><span>{user.username}</span></div><Badge tone={user.is_active ? "gold" : "muted"}>{user.is_active ? t("admin.active") : t("admin.inactive")}</Badge><div><select value={user.role} onChange={(event) => setRole(user, event.target.value as UserRole)}><option value="user">User</option><option value="admin">Admin</option></select><button type="button" onClick={() => toggleActive(user)}>{user.is_active ? t("admin.deactivate") : t("admin.activate")}</button><button type="button" onClick={() => remove(user)}>{t("common.delete")}</button></div></article>)}</div></section></AdminLayout>;
}
