import { useEffect, useState } from "react";
import { listSocialProviders, startSocialAuth, type SocialProvider, type SocialProviderStatus } from "../api/auth";

const providerLabels: Record<SocialProvider, string> = { google: "Google-lel", apple: "Apple-lel", facebook: "Facebookkal" };

export function SocialAuthButtons({ link = false }: { link?: boolean }) {
  const [providers, setProviders] = useState<SocialProviderStatus[]>([]);
  const [pending, setPending] = useState<SocialProvider | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => { void listSocialProviders().then(setProviders).catch(() => setMessage("A külső bejelentkezési módok most nem tölthetők be.")); }, []);
  const configured = providers.filter((item) => item.configured);
  if (!configured.length && !message) return null;

  return <div className="social-auth-section">
    {!link ? <div className="auth-divider"><span>vagy</span></div> : null}
    <div className="social-auth-buttons">
      {configured.map(({ provider }) => <button className={`button social-auth-button is-${provider}`} type="button" key={provider} disabled={pending !== null} onClick={async () => {
        setPending(provider); setMessage("");
        try { await startSocialAuth(provider, link); }
        catch (error) { setMessage(error instanceof Error ? error.message : `A ${providerLabels[provider]} történő kapcsolódás nem sikerült.`); setPending(null); }
      }}><span aria-hidden="true">{provider === "google" ? "G" : provider === "apple" ? "●" : "f"}</span>{pending === provider ? "Átirányítás…" : link ? `${providerLabels[provider]} összekapcsolás` : `Folytatás ${providerLabels[provider]}`}</button>)}
    </div>
    {message ? <p className="auth-message is-error" role="alert">{message}</p> : null}
  </div>;
}
