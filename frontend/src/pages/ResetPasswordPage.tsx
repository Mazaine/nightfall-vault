import { FormEvent, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { resetPassword } from "../api/auth";
import { SiteHeader } from "../components/SiteHeader";
import "./PasswordResetPage.css";

type ResetPasswordPageProps = {
  cartCount: number;
};

export function ResetPasswordPage({ cartCount }: ResetPasswordPageProps) {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const passwordsMatch = password === confirmPassword;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !passwordsMatch || password.length < 8) {
      setMessage("Ellenőrizd a linket és a megadott jelszavakat.");
      return;
    }

    setIsLoading(true);
    setMessage(null);
    try {
      const response = await resetPassword({ token, new_password: password });
      setMessage(response.message);
    } catch {
      setMessage("A jelszó módosítása nem sikerült. Lehet, hogy a link lejárt.");
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
          <h1>Új jelszó beállítása</h1>
          <form onSubmit={handleSubmit}>
            <label>
              Új jelszó
              <input
                type="password"
                value={password}
                minLength={8}
                required
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>
            <label>
              Jelszó megerősítése
              <input
                type="password"
                value={confirmPassword}
                minLength={8}
                required
                onChange={(event) => setConfirmPassword(event.target.value)}
              />
            </label>
            {!passwordsMatch ? <p className="password-reset-error">A két jelszó nem egyezik.</p> : null}
            <button className="secondary-action" type="submit" disabled={isLoading || !passwordsMatch}>
              {isLoading ? "Mentés..." : "Új jelszó mentése"}
            </button>
          </form>
          {message ? <p className="password-reset-message">{message}</p> : null}
          <Link className="back-link" to="/auth">
            Belépés
          </Link>
        </div>
      </section>
    </main>
  );
}
