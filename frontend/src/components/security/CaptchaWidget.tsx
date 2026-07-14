import { useEffect, useRef, useState } from "react";
import { useCaptcha } from "../../hooks/useCaptcha";

type CaptchaWidgetProps = {
  action: string;
  onTokenChange: (token: string | null) => void;
};

type CaptchaOptions = {
  sitekey: string;
  callback: (token: string) => void;
  "expired-callback": () => void;
  "error-callback": () => void;
};

declare global {
  interface Window {
    grecaptcha?: {
      render: (container: HTMLElement, options: CaptchaOptions) => number;
      reset: (widgetId?: number) => void;
    };
    turnstile?: {
      render: (container: HTMLElement, options: CaptchaOptions & { action?: string; theme?: string }) => string;
      remove: (widgetId: string) => void;
    };
  }
}

const scriptSources = {
  recaptcha: "https://www.google.com/recaptcha/api.js?render=explicit",
  turnstile: "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit",
};

function loadScript(provider: "recaptcha" | "turnstile") {
  const id = `nightfall-${provider}-script`;
  if (document.getElementById(id)) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.id = id;
    script.src = scriptSources[provider];
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("captcha_script_load_failed"));
    document.head.appendChild(script);
  });
}

export function CaptchaWidget({ action, onTokenChange }: CaptchaWidgetProps) {
  const { isCaptchaEnabled, captchaProvider, captchaSiteKey } = useCaptcha();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isCaptchaEnabled) {
      onTokenChange(null);
      return;
    }
    if (!captchaSiteKey) {
      setError("A botvédelem nyilvános kulcsa nincs beállítva.");
      onTokenChange(null);
      return;
    }

    let mounted = true;
    let widgetId: string | number | null = null;
    const render = async () => {
      try {
        await loadScript(captchaProvider);
        await new Promise((resolve) => window.setTimeout(resolve, 120));
        if (!mounted || !containerRef.current) return;
        const options: CaptchaOptions = {
          sitekey: captchaSiteKey,
          callback: onTokenChange,
          "expired-callback": () => onTokenChange(null),
          "error-callback": () => onTokenChange(null),
        };
        if (captchaProvider === "turnstile" && window.turnstile) {
          widgetId = window.turnstile.render(containerRef.current, { ...options, action, theme: "dark" });
        } else if (captchaProvider === "recaptcha" && window.grecaptcha) {
          widgetId = window.grecaptcha.render(containerRef.current, options);
        } else {
          setError("A botvédelem nem tölthető be.");
        }
      } catch {
        setError("A botvédelem nem tölthető be.");
        onTokenChange(null);
      }
    };
    void render();

    return () => {
      mounted = false;
      if (captchaProvider === "turnstile" && typeof widgetId === "string") window.turnstile?.remove(widgetId);
      if (captchaProvider === "recaptcha" && typeof widgetId === "number") window.grecaptcha?.reset(widgetId);
    };
  }, [action, captchaProvider, captchaSiteKey, isCaptchaEnabled, onTokenChange]);

  if (!isCaptchaEnabled) return null;
  return <div className="captcha-widget"><div ref={containerRef} />{error ? <p role="alert">{error}</p> : null}</div>;
}
