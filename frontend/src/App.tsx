import { lazy, Suspense } from "react";
import { Navigate, Outlet, Route, Routes, useLocation } from "react-router-dom";
import { useAuth } from "./AuthContext";
import { LoadingState } from "./components/AsyncStates";
import { IncomingChatDock } from "./components/IncomingChatDock";
import { RouteMetadata } from "./components/RouteMetadata";
import { ScrollToTop } from "./components/ScrollToTop";
import { SiteFooter } from "./components/SiteFooter";
import { SiteHeader } from "./components/SiteHeader";
import { TransactionReviewPrompt } from "./components/TransactionReviewPrompt";
import { HomePage } from "./pages/HomePage";

const AboutPage = lazy(() => import("./pages/AboutPage").then((module) => ({ default: module.AboutPage })));
const AuctionDetailPage = lazy(() => import("./pages/AuctionDetailPage").then((module) => ({ default: module.AuctionDetailPage })));
const AuctionsPage = lazy(() => import("./pages/AuctionsPage").then((module) => ({ default: module.AuctionsPage })));
const AuthPage = lazy(() => import("./pages/AuthPages").then((module) => ({ default: module.AuthPage })));
const ContactPage = lazy(() => import("./pages/ContactPage").then((module) => ({ default: module.ContactPage })));
const HowItWorksPage = lazy(() => import("./pages/HowItWorksPage").then((module) => ({ default: module.HowItWorksPage })));
const NotFoundPage = lazy(() => import("./pages/NotFoundPage").then((module) => ({ default: module.NotFoundPage })));
const PrivacyPage = lazy(() => import("./pages/InfoPages").then((module) => ({ default: module.PrivacyPage })));
const SupportPage = lazy(() => import("./pages/InfoPages").then((module) => ({ default: module.SupportPage })));
const TermsPage = lazy(() => import("./pages/InfoPages").then((module) => ({ default: module.TermsPage })));
const UserProfilePage = lazy(() => import("./pages/UserProfilePage").then((module) => ({ default: module.UserProfilePage })));
const EmailVerificationPage = lazy(() => import("./pages/AuthRecoveryPages").then((module) => ({ default: module.EmailVerificationPage })));
const ForgotPasswordPage = lazy(() => import("./pages/AuthRecoveryPages").then((module) => ({ default: module.ForgotPasswordPage })));
const ResetPasswordPage = lazy(() => import("./pages/AuthRecoveryPages").then((module) => ({ default: module.ResetPasswordPage })));
const AccountLayout = lazy(() => import("./components/AccountLayout").then((module) => ({ default: module.AccountLayout })));
const AccountPage = lazy(() => import("./pages/AccountPage").then((module) => ({ default: module.AccountPage })));
const AccountBlockedUsersPage = lazy(() => import("./pages/AccountBlockedUsersPage").then((module) => ({ default: module.AccountBlockedUsersPage })));
const AccountProfilePage = lazy(() => import("./pages/AccountProfilePage").then((module) => ({ default: module.AccountProfilePage })));
const AccountReportsPage = lazy(() => import("./pages/AccountReportsPage").then((module) => ({ default: module.AccountReportsPage })));
const AccountConversationsPage = lazy(() => import("./pages/AccountConversationsPage").then((module) => ({ default: module.AccountConversationsPage })));
const AccountTransactionsPage = lazy(() => import("./pages/AccountTransactionsPage").then((module) => ({ default: module.AccountTransactionsPage })));
const NotificationsPage = lazy(() => import("./pages/NotificationsPage").then((module) => ({ default: module.NotificationsPage })));
const SavedSearchesPage = lazy(() => import("./pages/SavedSearchesPage").then((module) => ({ default: module.SavedSearchesPage })));
const WatchlistPage = lazy(() => import("./pages/WatchlistPage").then((module) => ({ default: module.WatchlistPage })));
const AdminLayout = lazy(() => import("./pages/admin/AdminLayout").then((module) => ({ default: module.AdminLayout })));
const AdminDashboardPage = lazy(() => import("./pages/admin/AdminDashboardPage").then((module) => ({ default: module.AdminDashboardPage })));
const AdminUsersPage = lazy(() => import("./pages/admin/AdminUsersPage").then((module) => ({ default: module.AdminUsersPage })));
const AdminAuctionsPage = lazy(() => import("./pages/admin/AdminAuctionsPage").then((module) => ({ default: module.AdminAuctionsPage })));
const AdminAuditLogsPage = lazy(() => import("./pages/admin/AdminAuditLogsPage").then((module) => ({ default: module.AdminAuditLogsPage })));
const AdminReportsPage = lazy(() => import("./pages/admin/AdminReportsPage").then((module) => ({ default: module.AdminReportsPage })));
const AdminModerationPage = lazy(() => import("./pages/admin/AdminModerationPage").then((module) => ({ default: module.AdminModerationPage })));

function AdminRoute() {
  const { isAdmin, isAuthenticated, isLoading } = useAuth();
  const location = useLocation();
  if (isLoading) return <section className="container page-shell"><LoadingState label="Munkamenet ellenőrzése" /></section>;
  if (!isAuthenticated) return <Navigate to={`/login?next=${encodeURIComponent(location.pathname)}`} replace />;
  return isAdmin ? <AdminLayout /> : <Navigate to="/account" replace />;
}

function ProtectedRoute() {
  const { isAuthenticated, isLoading } = useAuth();
  const location = useLocation();
  if (isLoading) return <section className="container page-shell"><LoadingState label="Munkamenet ellenőrzése" /></section>;
  return isAuthenticated ? <Outlet /> : <Navigate to={`/login?next=${encodeURIComponent(`${location.pathname}${location.search}`)}`} replace />;
}

function App() {
  return (
    <div className="app-shell">
      <ScrollToTop />
      <RouteMetadata />
      <a className="skip-link" href="#main-content">Ugrás a fő tartalomhoz</a>
      <SiteHeader />
      <main id="main-content" tabIndex={-1}>
        <Suspense fallback={<section className="container page-shell"><LoadingState label="Oldal betöltése" /></section>}>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/auctions" element={<AuctionsPage />} />
            <Route path="/auctions/:auctionId" element={<AuctionDetailPage />} />
            <Route path="/users/:username" element={<UserProfilePage />} />
            <Route path="/categories" element={<Navigate to="/auctions" replace />} />
            <Route element={<ProtectedRoute />}>
              <Route path="/account" element={<AccountLayout />}>
                <Route index element={<Navigate to="profile" replace />} />
                <Route path="profile" element={<AccountProfilePage />} />
                <Route path="bids" element={<AccountPage section="bids" />} />
                <Route path="auctions" element={<AccountPage section="auctions" />} />
                <Route path="messages" element={<AccountConversationsPage />} />
                <Route path="transactions" element={<AccountTransactionsPage />} />
                <Route path="notifications" element={<NotificationsPage />} />
                <Route path="saved-searches" element={<SavedSearchesPage />} />
                <Route path="watchlist" element={<WatchlistPage />} />
                <Route path="reports" element={<AccountReportsPage />} />
                <Route path="blocked-users" element={<AccountBlockedUsersPage />} />
              </Route>
              <Route path="/notifications" element={<Navigate to="/account/notifications" replace />} />
              <Route path="/watchlist" element={<Navigate to="/account/watchlist" replace />} />
              <Route path="/saved-searches" element={<Navigate to="/account/saved-searches" replace />} />
            </Route>
            <Route path="/how-it-works" element={<HowItWorksPage />} />
            <Route path="/about" element={<AboutPage />} />
            <Route path="/contact" element={<ContactPage />} />
            <Route path="/login" element={<AuthPage mode="login" />} />
            <Route path="/register" element={<AuthPage mode="register" />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />
            <Route path="/auth/verify-email" element={<EmailVerificationPage />} />
            <Route path="/admin" element={<AdminRoute />}>
              <Route index element={<AdminDashboardPage />} />
              <Route path="auctions" element={<AdminAuctionsPage />} />
              <Route path="users" element={<AdminUsersPage />} />
              <Route path="audit-logs" element={<AdminAuditLogsPage />} />
              <Route path="reports" element={<AdminReportsPage />} />
              <Route path="moderation" element={<AdminModerationPage />} />
            </Route>
            <Route path="/terms" element={<TermsPage />} />
            <Route path="/privacy" element={<PrivacyPage />} />
            <Route path="/support" element={<SupportPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </Suspense>
      </main>
      <SiteFooter />
      <IncomingChatDock />
      <TransactionReviewPrompt />
    </div>
  );
}

export default App;
