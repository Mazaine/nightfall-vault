import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { useI18n } from "../i18n";

type ProtectedRouteProps = { children: React.ReactNode; requireAdmin?: boolean };

export function ProtectedRoute({ children, requireAdmin = false }: ProtectedRouteProps) {
  const { isAuthenticated, isLoading, user } = useAuth();
  const { t } = useI18n();
  const location = useLocation();

  if (isLoading) {
    return <main className="app-shell"><section className="page-content"><strong className="health-waiting">{t("common.loading")}</strong></section></main>;
  }
  if (!isAuthenticated) return <Navigate to="/auth" replace state={{ from: location }} />;
  if (requireAdmin && user?.role !== "admin") {
    return <main className="app-shell"><section className="page-content"><p className="eyebrow">Admin</p><h1>{t("states.adminOnly")}</h1><p className="lead">{t("admin.adminLead")}</p></section></main>;
  }
  return children;
}
