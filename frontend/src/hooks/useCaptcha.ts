import { useCallback, useMemo, useState } from "react";

type CaptchaProvider = "recaptcha" | "turnstile";

function getCaptchaEnabled() {
  return import.meta.env.VITE_CAPTCHA_ENABLED === "true";
}

function getCaptchaProvider(): CaptchaProvider {
  const provider = String(import.meta.env.VITE_CAPTCHA_PROVIDER ?? "recaptcha").toLowerCase();
  return provider === "turnstile" ? "turnstile" : "recaptcha";
}

export function useCaptcha() {
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const provider = getCaptchaProvider();

  const resetCaptcha = useCallback(() => {
    setCaptchaToken(null);
  }, []);

  return useMemo(
    () => ({
      captchaToken,
      setCaptchaToken,
      resetCaptcha,
      isCaptchaEnabled: getCaptchaEnabled(),
      captchaProvider: provider,
      captchaSiteKey: String(
        provider === "turnstile"
          ? import.meta.env.VITE_TURNSTILE_SITE_KEY ?? import.meta.env.VITE_CAPTCHA_SITE_KEY ?? ""
          : import.meta.env.VITE_CAPTCHA_SITE_KEY ?? "",
      ),
    }),
    [captchaToken, provider, resetCaptcha],
  );
}
