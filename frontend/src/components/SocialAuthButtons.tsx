import { useEffect, useState } from "react";
import { listSocialProviders, startSocialAuth, type SocialProvider } from "../api/auth";

const providers: Array<{ provider: SocialProvider; label: string; mark: string }> = [
  { provider: "google", label: "Google-lel", mark: "G" },
  { provider: "facebook", label: "Facebookkal", mark: "f" },
];

export function SocialAuthButtons({ link = false }: { link?: boolean }) {
  const [configured, setConfigured] = useState<Set<SocialProvider> | null>(null);
  const [pending, setPending] = useState<SocialProvider | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    void listSocialProviders()
      .then((items) => setConfigured(new Set(items.filter((item) => item.configured).map((item) => item.provider))))
      .catch(() => setConfigured(new Set()));
  }, []);

  return <div className="social-auth-section">
    {!link ? <div className="auth-divider"><span>vagy folytasd külső fiókkal</span></div> : null}
    <div className="social-auth-buttons">
      {providers.map(({ provider, label, mark }) => {
        const unavailable = configured !== null && !configured.has(provider);
        return <button
          className={`button social-auth-button is-${provider}`}
          type="button"
          key={provider}
          disabled={pending !== null}
          aria-describedby={unavailable ? "social-auth-status" : undefined}
          onClick={async () => {
            if (unavailable) {
              setMessage(`A ${provider === "google" ? "Google" : "Facebook"}-belépés konfigurálása még folyamatban van.`);
              return;
            }
            setPending(provider); setMessage("");
            try { await startSocialAuth(provider, link); }
            catch (error) { setMessage(error instanceof Error ? error.message : `A ${label} történő kapcsolódás nem sikerült.`); setPending(null); }
          }}
        ><span aria-hidden="true">{mark}</span>{pending === provider ? "Átirányítás…" : link ? `${label} összekapcsolás` : `Folytatás ${label}`}</button>;
      })}
    </div>
    {message ? <p className="auth-message is-error" id="social-auth-status" role="alert">{message}</p> : null}
  </div>;
}
