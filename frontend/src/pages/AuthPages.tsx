import { FormEvent, type KeyboardEvent, useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { register, resendVerification } from "../api/auth";
import { ApiError } from "../api/client";
import { useAuth } from "../AuthContext";
import { CaptchaWidget } from "../components/security/CaptchaWidget";

type AuthPageProps = {
  mode: "login" | "register";
};

function passwordStrength(password: string) {
  let score = 0;
  if (password.length >= 8) score += 1;
  if (password.length >= 12) score += 1;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score += 1;
  if (/\d/.test(password)) score += 1;
  if (/[^\w\s]/.test(password)) score += 1;
  return { score, label: password ? ["Gyenge", "Gyenge", "Elfogadható", "Közepes", "Erős", "Nagyon erős"][score] : "Nincs megadva" };
}

function safeNext(search: string) {
  const next = new URLSearchParams(search).get("next");
  return next && next.startsWith("/") && !next.startsWith("//") ? next : null;
}

export function AuthPage({ mode }: AuthPageProps) {
  const isLogin = mode === "login";
  const auth = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [message, setMessage] = useState("");
  const [messageTone, setMessageTone] = useState<"error" | "success">("error");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [registeredEmail, setRegisteredEmail] = useState("");
  const strength = passwordStrength(password);
  const togglePasswordVisibility = () => setShowPassword((value) => !value);
  const handlePasswordToggleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    togglePasswordVisibility();
  };

  useEffect(() => {
    setMessage("");
    setFieldErrors({});
    setPassword("");
    setConfirmPassword("");
    setCaptchaToken(null);
    setRegisteredEmail("");
  }, [mode]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    setIsSubmitting(true);
    setMessage("");
    setFieldErrors({});

    const formData = new FormData(form);
    const email = String(formData.get("email") ?? "").trim().toLowerCase();

    try {
      if (isLogin) {
        const user = await auth.login(email, password, captchaToken);
        navigate(safeNext(location.search) ?? (user.role === "admin" ? "/admin" : "/"), { replace: true });
      } else {
        const acceptedTerms = formData.get("accepted_terms") === "on";
        const acceptedPrivacy = formData.get("accepted_privacy") === "on";
        const errors: Record<string, string> = {};
        if (password !== confirmPassword) errors.confirm_password = "A két jelszó nem egyezik.";
        if (!acceptedTerms) errors.accepted_terms = "A felhasználási feltételek elfogadása kötelező.";
        if (!acceptedPrivacy) errors.accepted_privacy = "Az adatkezelési tájékoztató elfogadása kötelező.";
        if (Object.keys(errors).length) {
          setFieldErrors(errors);
          setMessageTone("error");
          setMessage("Ellenőrizd a megjelölt mezőket.");
          return;
        }
        const response = await register({
          email,
          username: String(formData.get("username") ?? "").trim(),
          full_name: String(formData.get("full_name") ?? "").trim(),
          password,
          confirm_password: confirmPassword,
          accepted_terms: acceptedTerms,
          accepted_privacy: acceptedPrivacy,
          subscribed_newsletter: false,
          captcha_token: captchaToken,
        });
        setRegisteredEmail(email);
        setMessageTone("success");
        setMessage(response.message);
        form.reset();
        setPassword("");
        setConfirmPassword("");
        setCaptchaToken(null);
      }
    } catch (error) {
      if (error instanceof ApiError) setFieldErrors(error.fieldErrors);
      setMessageTone("error");
      setMessage(error instanceof Error ? error.message : "A művelet nem sikerült.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResend = async () => {
    if (!registeredEmail) return;
    setIsSubmitting(true);
    setMessage("");
    try {
      const response = await resendVerification(registeredEmail, captchaToken);
      setMessageTone("success");
      setMessage(response.message);
      setCaptchaToken(null);
    } catch (error) {
      setMessageTone("error");
      setMessage(error instanceof Error ? error.message : "Az aktiváló e-mail küldése nem sikerült.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const fieldError = (field: string) => fieldErrors[field]
    ? <span className="auth-field-error" id={`${field}-error`}>{fieldErrors[field]}</span>
    : null;

  return (
    <section className="container page-shell auth-page auth-layout">
      <aside className="auth-intro-panel" aria-label="Nightfall Vault fiókelőnyök">
        <span className="auth-vault-mark" aria-hidden="true">NV</span>
        <p className="eyebrow">Nightfall Vault</p>
        <h2>{isLogin ? "Térj vissza a gyűjtemények világába" : "Lépj be az aukciók közösségébe"}</h2>
        <p className="auth-lead">Biztonságos fiókkal licitálhatsz, aukciót indíthatsz és közvetlenül egyeztethetsz a másik féllel.</p>
        <div className="auth-benefits">
          <span><strong>Átlátható licitálás</strong><small>Valós aukciós előzmények</small></span>
          <span><strong>Közvetlen kapcsolat</strong><small>Az eladó és a nyertes egymással egyeztet</small></span>
          <span><strong>Védett hozzáférés</strong><small>E-mail-aktiválás és botvédelem</small></span>
        </div>
        <p className="auth-boundary">A Nightfall Vault nem kezel fizetést vagy szállítást.</p>
      </aside>

      <div className="side-panel auth-card">
        <nav className="auth-mode-switch" aria-label="Belépési mód">
          <Link className={isLogin ? "is-active" : ""} to={`/login${location.search}`}>Belépés</Link>
          <Link className={!isLogin ? "is-active" : ""} to={`/register${location.search}`}>Regisztráció</Link>
        </nav>
        <div>
          <p className="eyebrow">{isLogin ? "Fiókhozzáférés" : "Új fiók"}</p>
          <h1>{isLogin ? "Üdvözlünk újra" : "Hozd létre a fiókodat"}</h1>
          <p className="auth-helper">{isLogin ? "Admin és normál felhasználó ugyanitt jelentkezik be." : "Minden regisztráció normál felhasználói fiókot hoz létre."}</p>
        </div>

        <form className="auth-form" onSubmit={handleSubmit} noValidate>
          {!isLogin ? <>
            <label>Teljes név<input name="full_name" type="text" autoComplete="name" minLength={2} maxLength={160} required aria-invalid={Boolean(fieldErrors.full_name)} aria-describedby={fieldErrors.full_name ? "full_name-error" : undefined} />{fieldError("full_name")}</label>
            <label>Felhasználónév<input name="username" type="text" autoComplete="username" minLength={3} maxLength={80} required aria-invalid={Boolean(fieldErrors.username)} aria-describedby={fieldErrors.username ? "username-error" : undefined} />{fieldError("username")}<small>Ez jelenik meg nyilvánosan az aukcióknál.</small></label>
          </> : null}

          <label>E-mail-cím<input name="email" type="email" autoComplete="email" required aria-invalid={Boolean(fieldErrors.email)} aria-describedby={fieldErrors.email ? "email-error" : undefined} />{fieldError("email")}</label>

          <label>Jelszó
            <span className="password-input-wrap"><input name="password" type={showPassword ? "text" : "password"} autoComplete={isLogin ? "current-password" : "new-password"} minLength={isLogin ? 1 : 8} maxLength={128} value={password} onChange={(event) => setPassword(event.target.value)} required aria-invalid={Boolean(fieldErrors.password)} aria-describedby={fieldErrors.password ? "password-error" : undefined} /><button type="button" onClick={togglePasswordVisibility} onKeyDown={handlePasswordToggleKeyDown} aria-label={showPassword ? "Jelszó elrejtése" : "Jelszó megjelenítése"}>{showPassword ? "Elrejt" : "Mutat"}</button></span>
            {fieldError("password")}
          </label>

          {!isLogin ? <>
            <label>Jelszó megerősítése<input name="confirm_password" type={showPassword ? "text" : "password"} autoComplete="new-password" minLength={8} maxLength={128} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required aria-invalid={Boolean(fieldErrors.confirm_password) || Boolean(confirmPassword && password !== confirmPassword)} aria-describedby="confirm_password-error" />{fieldError("confirm_password")}{!fieldErrors.confirm_password && confirmPassword && password !== confirmPassword ? <span className="auth-field-error" id="confirm_password-error">A két jelszó nem egyezik.</span> : null}</label>
            <div className="password-strength" aria-live="polite"><span>Jelszó erőssége</span><strong>{strength.label}</strong><meter min="0" max="5" value={strength.score}>{strength.score}/5</meter></div>
            <div className="auth-checkboxes">
              <label className={fieldErrors.accepted_terms ? "auth-checkbox has-error" : "auth-checkbox"}><input name="accepted_terms" type="checkbox" aria-invalid={Boolean(fieldErrors.accepted_terms)} /><span>Elfogadom a <Link to="/terms" target="_blank">felhasználási feltételeket</Link>.</span></label>{fieldError("accepted_terms")}
              <label className={fieldErrors.accepted_privacy ? "auth-checkbox has-error" : "auth-checkbox"}><input name="accepted_privacy" type="checkbox" aria-invalid={Boolean(fieldErrors.accepted_privacy)} /><span>Elfogadom az <Link to="/privacy" target="_blank">adatkezelési tájékoztatót</Link>.</span></label>{fieldError("accepted_privacy")}
            </div>
          </> : null}

          <CaptchaWidget action={registeredEmail ? "resend-verification" : isLogin ? "login" : "register"} onTokenChange={setCaptchaToken} />
          {message ? <p className={`auth-message is-${messageTone}`} role={messageTone === "error" ? "alert" : "status"}>{message}</p> : null}
          {registeredEmail ? <button className="button button-secondary" type="button" onClick={handleResend} disabled={isSubmitting}>Aktiváló e-mail újraküldése</button> : <button className="button button-primary auth-submit" type="submit" disabled={isSubmitting}>{isSubmitting ? "Feldolgozás…" : isLogin ? "Belépés" : "Fiók létrehozása"}</button>}
        </form>

        {isLogin ? <div className="auth-links"><Link className="text-link" to="/forgot-password">Elfelejtetted a jelszavad?</Link><span>Nincs még fiókod? <Link className="text-link" to={`/register${location.search}`}>Regisztrálj</Link></span></div> : <p className="auth-links">Már van fiókod? <Link className="text-link" to={`/login${location.search}`}>Lépj be</Link></p>}
      </div>
    </section>
  );
}
