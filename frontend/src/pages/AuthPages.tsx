import { FormEvent, useState } from "react";
import { Link } from "react-router-dom";
import { login, register } from "../api/auth";

type AuthPageProps = {
  mode: "login" | "register";
};

export function AuthPage({ mode }: AuthPageProps) {
  const isLogin = mode === "login";
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    setMessage("");

    const formData = new FormData(event.currentTarget);
    const email = String(formData.get("email") ?? "");
    const password = String(formData.get("password") ?? "");
    const fullName = String(formData.get("full_name") ?? "");

    try {
      if (isLogin) {
        const user = await login(email, password);
        setMessage(`Sikeres belépés: ${user.full_name || user.email}`);
        window.location.href = "/account";
      } else {
        await register(fullName, email, password);
        setMessage("A regisztráció sikeres. E-mail aktiválás után be tudsz lépni.");
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "A művelet nem sikerült.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section className="container page-shell auth-page">
      <form className="side-panel auth-card" onSubmit={handleSubmit}>
        <p className="eyebrow">{isLogin ? "Belépés" : "Regisztráció"}</p>
        <h1>{isLogin ? "Üdvözöllek újra" : "Fiók létrehozása"}</h1>
        {!isLogin && <label>Név<input name="full_name" type="text" placeholder="Teljes név" required /></label>}
        <label>Email<input name="email" type="email" placeholder="email@example.com" required /></label>
        <label>Jelszó<input name="password" type="password" placeholder="Legalább 8 karakter" required /></label>
        {message ? <p className="form-message">{message}</p> : null}
        <button className="button button-primary" type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Folyamatban..." : isLogin ? "Belépés" : "Regisztráció"}
        </button>
        <p>
          {isLogin ? "Még nincs fiókod?" : "Már van fiókod?"}{" "}
          <Link className="text-link" to={isLogin ? "/register" : "/login"}>
            {isLogin ? "Regisztrálj" : "Lépj be"}
          </Link>
        </p>
      </form>
    </section>
  );
}
