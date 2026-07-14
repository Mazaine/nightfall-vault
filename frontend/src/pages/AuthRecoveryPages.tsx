import { FormEvent, type ReactNode, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { forgotPassword, resetPassword, verifyEmail, type MessageResponse } from "../api/auth";
import { CaptchaWidget } from "../components/security/CaptchaWidget";

const verificationRequests = new Map<string, Promise<MessageResponse>>();

function verifyOnce(token: string) {
  const existing = verificationRequests.get(token);
  if (existing) return existing;
  const request = verifyEmail(token);
  verificationRequests.set(token, request);
  return request;
}

function RecoveryShell({ eyebrow, title, lead, children }: { eyebrow: string; title: string; lead: string; children: ReactNode }) {
  return (
    <section className="container page-shell auth-page recovery-page">
      <div className="side-panel recovery-card">
        <span className="auth-vault-mark compact" aria-hidden="true">NV</span>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p className="auth-lead">{lead}</p>
        {children}
      </div>
    </section>
  );
}

export function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    setMessage("");
    setError("");
    try {
      const response = await forgotPassword(email.trim().toLowerCase(), captchaToken);
      setMessage(response.message);
      setCaptchaToken(null);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "A kérés nem sikerült.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return <RecoveryShell eyebrow="Fiókbiztonság" title="Elfelejtett jelszó" lead="Add meg a fiókodhoz tartozó e-mail-címet. Ha a fiók létezik, egy egyszer használható linket küldünk.">
    <form className="auth-form" onSubmit={submit}>
      <label>E-mail-cím<input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
      <CaptchaWidget action="forgot-password" onTokenChange={setCaptchaToken} />
      {error ? <p className="auth-message is-error" role="alert">{error}</p> : null}
      {message ? <p className="auth-message is-success" role="status">{message}</p> : null}
      <button className="button button-primary" type="submit" disabled={isSubmitting}>{isSubmitting ? "Küldés…" : "Visszaállító link kérése"}</button>
    </form>
    <Link className="text-link recovery-back" to="/login">Vissza a belépéshez</Link>
  </RecoveryShell>;
}

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage("");
    setError("");
    if (!token) return setError("A jelszó-visszaállító linkből hiányzik a biztonsági token.");
    if (password !== confirmPassword) return setError("A két jelszó nem egyezik.");
    setIsSubmitting(true);
    try {
      const response = await resetPassword(token, password, confirmPassword);
      setMessage(response.message);
      setPassword("");
      setConfirmPassword("");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "A jelszó módosítása nem sikerült.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return <RecoveryShell eyebrow="Fiókbiztonság" title="Új jelszó beállítása" lead="Adj meg egy legalább 8 karakteres új jelszót. A biztonsági link csak egyszer használható.">
    <form className="auth-form" onSubmit={submit}>
      <label>Új jelszó<span className="password-input-wrap"><input type={showPassword ? "text" : "password"} autoComplete="new-password" minLength={8} maxLength={128} value={password} onChange={(event) => setPassword(event.target.value)} required /><button type="button" onClick={() => setShowPassword((value) => !value)}>{showPassword ? "Elrejt" : "Mutat"}</button></span></label>
      <label>Új jelszó megerősítése<input type={showPassword ? "text" : "password"} autoComplete="new-password" minLength={8} maxLength={128} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required aria-invalid={Boolean(confirmPassword && password !== confirmPassword)} /></label>
      {confirmPassword && password !== confirmPassword ? <p className="auth-field-error">A két jelszó nem egyezik.</p> : null}
      {error ? <p className="auth-message is-error" role="alert">{error}</p> : null}
      {message ? <p className="auth-message is-success" role="status">{message}</p> : null}
      {!message ? <button className="button button-primary" type="submit" disabled={isSubmitting || !token}>{isSubmitting ? "Mentés…" : "Új jelszó mentése"}</button> : null}
    </form>
    <Link className="text-link recovery-back" to="/login">Vissza a belépéshez</Link>
  </RecoveryShell>;
}

export function EmailVerificationPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const [state, setState] = useState<{ loading: boolean; message: string; error: string }>({ loading: true, message: "", error: "" });

  useEffect(() => {
    if (!token) {
      setState({ loading: false, message: "", error: "Az aktiváló linkből hiányzik a biztonsági token." });
      return;
    }
    let active = true;
    verifyOnce(token)
      .then((response) => active && setState({ loading: false, message: response.message, error: "" }))
      .catch((requestError) => active && setState({ loading: false, message: "", error: requestError instanceof Error ? requestError.message : "A fiók aktiválása nem sikerült." }));
    return () => { active = false; };
  }, [token]);

  return <RecoveryShell eyebrow="E-mail-ellenőrzés" title="Fiók aktiválása" lead="Ellenőrizzük a Nightfall Vault aktiváló linkedet.">
    {state.loading ? <p className="auth-message" role="status">Aktiválás folyamatban…</p> : null}
    {state.error ? <p className="auth-message is-error" role="alert">{state.error}</p> : null}
    {state.message ? <p className="auth-message is-success" role="status">{state.message}</p> : null}
    <Link className="button button-primary recovery-back" to="/login">Tovább a belépéshez</Link>
  </RecoveryShell>;
}
