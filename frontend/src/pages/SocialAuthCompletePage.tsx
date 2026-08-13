import { useEffect, useState } from "react";
import { completeSocialLogin } from "../api/auth";
import { AUTH_TOKEN_STORAGE_KEY, USER_STORAGE_KEY } from "../api/client";

export function SocialAuthCompletePage() {
  const [message, setMessage] = useState("A biztonságos munkamenet létrehozása…");
  useEffect(() => {
    void completeSocialLogin().then((response) => {
      localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, response.access_token);
      localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(response.user));
      window.location.replace(response.user.role === "admin" ? "/admin" : "/");
    }).catch(() => setMessage("A külső bejelentkezés befejezése nem sikerült. Próbáld újra."));
  }, []);
  return <section className="container page-shell"><div className="side-panel"><h1>Bejelentkezés</h1><p role="status">{message}</p></div></section>;
}
