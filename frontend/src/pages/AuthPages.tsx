import { Link } from "react-router-dom";

type AuthPageProps = {
  mode: "login" | "register";
};

export function AuthPage({ mode }: AuthPageProps) {
  const isLogin = mode === "login";

  return (
    <section className="container page-shell auth-page">
      <form className="side-panel auth-card">
        <p className="eyebrow">{isLogin ? "Belépés" : "Regisztráció"}</p>
        <h1>{isLogin ? "Üdvözöllek újra" : "Fiók létrehozása"}</h1>
        {!isLogin && <label>Név<input type="text" placeholder="Teljes név" /></label>}
        <label>Email<input type="email" placeholder="email@example.com" /></label>
        <label>Jelszó<input type="password" placeholder="Legalább 8 karakter" /></label>
        <button className="button button-primary" type="submit">{isLogin ? "Belépés" : "Regisztráció"}</button>
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
