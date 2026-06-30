import type { ReactNode } from "react";
import { Link, NavLink } from "react-router-dom";
import { useI18n } from "../i18n";
import { SiteHeader } from "./SiteHeader";
import "./AdminLayout.css";

type AdminLayoutProps = { cartCount: number; children: ReactNode };

export function AdminLayout({ cartCount, children }: AdminLayoutProps) {
  const { t } = useI18n();
  const links = [
    { to: "/admin", label: t("admin.dashboard") },
    { to: "/admin/products", label: t("admin.products") },
    { to: "/admin/orders", label: t("admin.orders") },
    { to: "/admin/users", label: t("admin.users") },
    { to: "/admin/shipping", label: t("admin.shipping") },
    { to: "/admin/newsletters", label: t("admin.newsletters") },
  ];

  return (
    <main className="app-shell">
      <SiteHeader cartCount={cartCount} />
      <section className="admin-layout">
        <aside className="admin-sidebar" aria-label="Admin navigation">
          <Link className="admin-sidebar-brand" to="/admin">{t("brand.name")}</Link>
          {links.map((link) => (
            <NavLink key={link.to} to={link.to} end={link.to === "/admin"}>
              {link.label}
            </NavLink>
          ))}
        </aside>
        <div className="admin-content">{children}</div>
      </section>
    </main>
  );
}
