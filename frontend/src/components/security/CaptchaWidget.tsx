import { useEffect, useRef, useState } from "react";
import { useCaptcha } from "../../hooks/useCaptcha";
import "./CaptchaWidget.css";

type CaptchaWidgetProps = {
  action?: string;
  onTokenChange: (token: string | null) => void;
};

declare global {
  interface Window {
    grecaptcha?: {
      render: (
        container: HTMLElement,
        options: {
          sitekey: string;
          callback: (token: string) => void;
          "expired-callback": () => void;
          "error-callback": () => void;
        },
      ) => number;
      reset: (widgetId?: number) => void;
    };
    turnstile?: {
      render: (
        container: HTMLElement,
        options: {
          sitekey: string;
          action?: string;
          callback: (token: string) => void;
          "expired-callback": () => void;
          "error-callback": () => void;
        },
      ) => string;
      reset: (widgetId?: string) => void;
      remove: (widgetId: string) => void;
    };
  }
}

const SCRIPT_IDS = {
  recaptcha: "webshop-recaptcha-script",
  turnstile: "webshop-turnstile-script",
};

const SCRIPT_SOURCES = {
  recaptcha: "https://www.google.com/recaptcha/api.js?render=explicit",
  turnstile: "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit",
};

function loadCaptchaScript(provider: "recaptcha" | "turnstile") {
  const scriptId = SCRIPT_IDS[provider];
  const existingScript = document.getElementById(scriptId);
  if (existingScript) {
    return Promise.resolve();
  }

  return new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.id = scriptId;
    script.src = SCRIPT_SOURCES[provider];
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
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isCaptchaEnabled) {
      onTokenChange(null);
      return undefined;
    }

    if (!captchaSiteKey) {
      setError("Bot protection site key is not configured.");
      onTokenChange(null);
      return undefined;
    }

    let isMounted = true;
    let widgetId: number | string | null = null;

    async function renderWidget() {
      try {
        await loadCaptchaScript(captchaProvider);
        await new Promise((resolve) => window.setTimeout(resolve, 120));

        if (!isMounted || !containerRef.current) {
          return;
        }

        containerRef.current.innerHTML = "";
        setError(null);

        const sharedOptions = {
          sitekey: captchaSiteKey,
          callback: (token: string) => onTokenChange(token),
          "expired-callback": () => onTokenChange(null),
          "error-callback": () => onTokenChange(null),
        };

        if (captchaProvider === "turnstile" && window.turnstile) {
          widgetId = window.turnstile.render(containerRef.current, {
            ...sharedOptions,
            action,
          });
          return;
        }

        if (captchaProvider === "recaptcha" && window.grecaptcha) {
          widgetId = window.grecaptcha.render(containerRef.current, sharedOptions);
          return;
        }

        setError("Bot protection could not be loaded.");
      } catch {
        setError("Bot protection could not be loaded.");
        onTokenChange(null);
      }
    }

    renderWidget();

    return () => {
      isMounted = false;
      onTokenChange(null);
      if (captchaProvider === "turnstile" && typeof widgetId === "string") {
        window.turnstile?.remove(widgetId);
      }
      if (captchaProvider === "recaptcha" && typeof widgetId === "number") {
        window.grecaptcha?.reset(widgetId);
      }
    };
  }, [action, captchaProvider, captchaSiteKey, isCaptchaEnabled, onTokenChange]);

  if (!isCaptchaEnabled) {
    return null;
  }

  return (
    <div className="captcha-widget">
      <div ref={containerRef} />
      {error ? <p className="captcha-widget__error">{error}</p> : null}
    </div>
  );
}

