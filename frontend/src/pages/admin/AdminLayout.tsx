import { NavLink, Outlet } from "react-router-dom";

const adminLinks = [
  { label: "Áttekintés", to: "/admin", end: true },
  { label: "Jelentések", to: "/admin/reports" },
  { label: "Moderáció", to: "/admin/moderation" },
  { label: "Aukciók", to: "/admin/auctions" },
  { label: "Felhasználók", to: "/admin/users" },
  { label: "VIP-kódok", to: "/admin/vip-codes" },
  { label: "Auditnapló", to: "/admin/audit-logs" },
];

export function AdminLayout() {
  return (
    <section className="container page-shell admin-layout">
      <aside className="side-panel admin-sidebar">
        <p className="eyebrow">Admin</p>
        <nav aria-label="Adminisztráció">
          {adminLinks.map((link) => (
            <NavLink className={({ isActive }) => `admin-nav-link${isActive ? " is-active" : ""}`} to={link.to} end={link.end} key={link.to}>
              {link.label}
            </NavLink>
          ))}
        </nav>
      </aside>

      <div className="admin-content">
        <Outlet />
      </div>
    </section>
  );
}
