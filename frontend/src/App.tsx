import { Navigate, Route, Routes } from "react-router-dom";
import { SiteFooter } from "./components/SiteFooter";
import { SiteHeader } from "./components/SiteHeader";
import { useAuth } from "./AuthContext";
import { AboutPage } from "./pages/AboutPage";
import { AccountPage } from "./pages/AccountPage";
import { AdminDashboardPage } from "./pages/admin/AdminDashboardPage";
import { AdminLayout } from "./pages/admin/AdminLayout";
import { AdminOrdersPage } from "./pages/admin/AdminOrdersPage";
import { AdminUsersPage } from "./pages/admin/AdminUsersPage";
import { AdminAuctionsPage } from "./pages/admin/AdminAuctionsPage";
import { AdminAuditLogsPage } from "./pages/admin/AdminAuditLogsPage";
import { AdminReportsPage } from "./pages/admin/AdminReportsPage";
import { AuctionDetailPage } from "./pages/AuctionDetailPage";
import { AuctionsPage } from "./pages/AuctionsPage";
import { AuthPage } from "./pages/AuthPages";
import { CartPage } from "./pages/CartPage";
import { CategoriesPage } from "./pages/CategoriesPage";
import { CheckoutPage } from "./pages/CheckoutPage";
import { ContactPage } from "./pages/ContactPage";
import { HomePage } from "./pages/HomePage";
import { HowItWorksPage } from "./pages/HowItWorksPage";
import { InfoPage } from "./pages/InfoPages";
import { NotificationsPage } from "./pages/NotificationsPage";
import { OrdersPage } from "./pages/OrdersPage";
import { UserProfilePage } from "./pages/UserProfilePage";
import { WatchlistPage } from "./pages/WatchlistPage";

function AdminRoute() {
  const { isAdmin } = useAuth();
  return isAdmin ? <AdminLayout /> : <Navigate to="/" replace />;
}

function App() {
  return (
    <div className="app-shell">
      <SiteHeader />
      <main>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/auctions" element={<AuctionsPage />} />
          <Route path="/auctions/:auctionId" element={<AuctionDetailPage />} />
          <Route path="/users/:username" element={<UserProfilePage />} />
          <Route path="/categories" element={<CategoriesPage />} />
          <Route path="/cart" element={<CartPage />} />
          <Route path="/checkout" element={<CheckoutPage />} />
          <Route path="/account" element={<AccountPage />} />
          <Route path="/notifications" element={<NotificationsPage />} />
          <Route path="/watchlist" element={<WatchlistPage />} />
          <Route path="/orders" element={<OrdersPage />} />
          <Route path="/how-it-works" element={<HowItWorksPage />} />
          <Route path="/about" element={<AboutPage />} />
          <Route path="/contact" element={<ContactPage />} />
          <Route path="/login" element={<AuthPage mode="login" />} />
          <Route path="/register" element={<AuthPage mode="register" />} />
          <Route path="/admin" element={<AdminRoute />}>
            <Route index element={<AdminDashboardPage />} />
            <Route path="auctions" element={<AdminAuctionsPage />} />
            <Route path="orders" element={<AdminOrdersPage />} />
            <Route path="users" element={<AdminUsersPage />} />
            <Route path="audit-logs" element={<AdminAuditLogsPage />} />
            <Route path="reports" element={<AdminReportsPage />} />
          </Route>
          <Route path="/terms" element={<InfoPage eyebrow="Jogi informÄ‚Ë‡ciÄ‚Ĺ‚k" title="FelhasznÄ‚Ë‡lÄ‚Ë‡si feltÄ‚Â©telek" />} />
          <Route path="/privacy" element={<InfoPage eyebrow="AdatvÄ‚Â©delem" title="AdatvÄ‚Â©delmi tÄ‚Ë‡jÄ‚Â©koztatÄ‚Ĺ‚" />} />
          <Route path="/support" element={<InfoPage eyebrow="TÄ‚Ë‡mogatÄ‚Ë‡s" title="Ä‚Ĺ›gyfÄ‚Â©lszolgÄ‚Ë‡lat" />} />
          <Route path="*" element={<InfoPage eyebrow="404" title="Az oldal nem talÄ‚Ë‡lhatÄ‚Ĺ‚" />} />
        </Routes>
      </main>
      <SiteFooter />
    </div>
  );
}

export default App;
