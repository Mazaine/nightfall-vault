import { Link, Outlet } from "react-router-dom";

const adminLinks = [
  { label: "Dashboard", to: "/admin" },
  { label: "Aukciók", to: "/admin/auctions" },
  { label: "Felhasználók", to: "/admin/users" },
  { label: "Audit naplo", to: "/admin/audit-logs" },
  { label: "Jelentesek", to: "/admin/reports" },
];

export function AdminLayout() {
  return (
    <section className="container page-shell admin-layout">
      <aside className="side-panel admin-sidebar">
        <p className="eyebrow">Admin</p>
        <nav>
          {adminLinks.map((link) => (
            <Link className="text-link" to={link.to} key={link.to}>
              {link.label}
            </Link>
          ))}
        </nav>
      </aside>

      <div className="admin-content">
        <Outlet />
      </div>
    </section>
  );
}
