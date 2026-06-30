import { FormEvent, useState } from "react";
import { Link } from "react-router-dom";
import { forgotPassword } from "../api/auth";
import { SiteHeader } from "../components/SiteHeader";
import { CaptchaWidget } from "../components/security/CaptchaWidget";
import { useCaptcha } from "../hooks/useCaptcha";
import "./PasswordResetPage.css";

type ForgotPasswordPageProps = {
  cartCount: number;
};

export function ForgotPasswordPage({ cartCount }: ForgotPasswordPageProps) {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const { captchaToken, setCaptchaToken, resetCaptcha, isCaptchaEnabled } = useCaptcha();

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsLoading(true);
    setMessage(null);

    if (isCaptchaEnabled && !captchaToken) {
      setMessage("A folytatáshoz végezd el a botvédelmi ellenőrzést.");
      setIsLoading(false);
      return;
    }

    try {
      const response = await forgotPassword({ email, captcha_token: captchaToken });
      setMessage(response.message);
    } catch {
      resetCaptcha();
      setMessage("A jelszó-visszaállítás indítása nem sikerült.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <main className="app-shell">
      <SiteHeader cartCount={cartCount} />
      <section className="password-reset-page page-content">
        <div className="password-reset-panel">
          <p className="eyebrow">Fiók</p>
          <h1>Elfelejtett jelszó</h1>
          <p className="lead">
            Add meg az email címed, és küldünk egy jelszó-visszaállító linket.
          </p>
          <form onSubmit={handleSubmit}>
            <label>
              Email cím
              <input
                type="email"
                value={email}
                required
                onChange={(event) => setEmail(event.target.value)}
              />
            </label>
            <CaptchaWidget action="forgot-password" onTokenChange={setCaptchaToken} />
            <button
              className="secondary-action"
              type="submit"
              disabled={isLoading || (isCaptchaEnabled && !captchaToken)}
            >
              {isLoading ? "Küldés..." : "Link küldése"}
            </button>
          </form>
          {message ? <p className="password-reset-message">{message}</p> : null}
          <Link className="back-link" to="/auth">
            Vissza a belépéshez
          </Link>
        </div>
      </section>
    </main>
  );
}
