import axios from "axios";
import { FormEvent, useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { SiteHeader } from "../components/SiteHeader";
import { CaptchaWidget } from "../components/security/CaptchaWidget";
import { Button, Card } from "../components/ui";
import { useAuth } from "../hooks/useAuth";
import { useCaptcha } from "../hooks/useCaptcha";
import { useI18n } from "../i18n";
import "./AuthPage.css";

type AuthMode = "login" | "register";
type AuthPageProps = { cartCount: number };

export function AuthPage({ cartCount }: AuthPageProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { t } = useI18n();
  const { login, register } = useAuth();
  const { captchaToken, setCaptchaToken, resetCaptcha, isCaptchaEnabled } = useCaptcha();
  const [mode, setMode] = useState<AuthMode>(location.pathname.includes("register") ? "register" : "login");
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [acceptedPrivacy, setAcceptedPrivacy] = useState(false);
  const [subscribedNewsletter, setSubscribedNewsletter] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isRegisterMode = mode === "register";

  useEffect(() => {
    setMode(location.pathname.includes("register") ? "register" : "login");
  }, [location.pathname]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccessMessage(null);
    if (isCaptchaEnabled && !captchaToken) { setError(t("auth.captchaError")); return; }
    if (isRegisterMode && (!acceptedTerms || !acceptedPrivacy || password !== confirmPassword)) { setError(t("auth.requiredError")); return; }
    setIsSubmitting(true);
    try {
      if (isRegisterMode) {
        const response = await register(email, username, fullName, password, confirmPassword, acceptedTerms, acceptedPrivacy, subscribedNewsletter, captchaToken);
        setSuccessMessage(response.message);
        setPassword("");
        setConfirmPassword("");
      } else {
        await login(email, password, captchaToken);
        navigate("/account", { replace: true });
      }
    } catch (caughtError) {
      resetCaptcha();
      if (axios.isAxiosError(caughtError) && typeof caughtError.response?.data?.detail === "string") setError(caughtError.response.data.detail);
      else setError(isRegisterMode ? t("auth.registerFailed") : t("auth.loginFailed"));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="app-shell">
      <SiteHeader cartCount={cartCount} />
      <section className="auth-page">
        <div className="auth-intro-panel">
          <p className="eyebrow">{t("brand.name")}</p>
          <h1>{isRegisterMode ? t("auth.registerTitle") : t("auth.loginTitle")}</h1>
          <p className="lead">{t("auth.intro")}</p>
          <div className="auth-benefit-grid"><span>{t("orders.title")}</span><span>{t("account.profile")}</span><span>{t("checkout.title")}</span></div>
        </div>
        <Card className="auth-form-panel">
          <div className="auth-mode-switch">
            <button className={!isRegisterMode ? "active-auth-mode" : undefined} type="button" onClick={() => setMode("login")}>{t("auth.loginTitle")}</button>
            <button className={isRegisterMode ? "active-auth-mode" : undefined} type="button" onClick={() => setMode("register")}>{t("auth.registerTitle")}</button>
          </div>
          <form className="auth-form" onSubmit={handleSubmit}>
            <label><span>{t("common.email")} *</span><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
            {isRegisterMode ? <><label><span>{t("auth.fullName")} *</span><input value={fullName} onChange={(e) => setFullName(e.target.value)} required /></label><label><span>{t("common.username")} *</span><input value={username} onChange={(e) => setUsername(e.target.value)} required /></label></> : null}
            <label><span>{t("common.password")} *</span><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required /></label>
            {isRegisterMode ? <><label><span>{t("auth.confirmPassword")} *</span><input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required /></label><label className="auth-checkbox-card"><input type="checkbox" checked={acceptedTerms} onChange={(e) => setAcceptedTerms(e.target.checked)} />{t("auth.acceptTerms")} *</label><label className="auth-checkbox-card"><input type="checkbox" checked={acceptedPrivacy} onChange={(e) => setAcceptedPrivacy(e.target.checked)} />{t("auth.acceptPrivacy")} *</label><label className="auth-checkbox-card"><input type="checkbox" checked={subscribedNewsletter} onChange={(e) => setSubscribedNewsletter(e.target.checked)} />{t("auth.newsletter")}</label></> : null}
            <CaptchaWidget action={isRegisterMode ? "register" : "login"} onTokenChange={setCaptchaToken} />
            {error ? <div className="auth-error">{error}</div> : null}
            {successMessage ? <div className="auth-success">{successMessage}</div> : null}
            <Button type="submit" disabled={isSubmitting}>{isSubmitting ? t("auth.working") : isRegisterMode ? t("auth.registerTitle") : t("auth.loginTitle")}</Button>
          </form>
          {!isRegisterMode ? <Link className="back-link" to="/forgot-password">{t("auth.forgotPassword")}</Link> : null}
          <Link className="back-link" to="/">{t("common.back")}</Link>
        </Card>
      </section>
    </main>
  );
}
