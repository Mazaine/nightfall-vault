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
import { OrdersPage } from "./pages/OrdersPage";

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
          <Route path="/categories" element={<CategoriesPage />} />
          <Route path="/cart" element={<CartPage />} />
          <Route path="/checkout" element={<CheckoutPage />} />
          <Route path="/account" element={<AccountPage />} />
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
          </Route>
          <Route path="/terms" element={<InfoPage eyebrow="Jogi információk" title="Felhasználási feltételek" />} />
          <Route path="/privacy" element={<InfoPage eyebrow="Adatvédelem" title="Adatvédelmi tájékoztató" />} />
          <Route path="/support" element={<InfoPage eyebrow="Támogatás" title="Ügyfélszolgálat" />} />
          <Route path="*" element={<InfoPage eyebrow="404" title="Az oldal nem található" />} />
        </Routes>
      </main>
      <SiteFooter />
    </div>
  );
}

export default App;
