import { useMemo } from "react";

export type CaptchaProvider = "recaptcha" | "turnstile";

export function useCaptcha() {
  const provider: CaptchaProvider = String(import.meta.env.VITE_CAPTCHA_PROVIDER ?? "turnstile").toLowerCase() === "recaptcha"
    ? "recaptcha"
    : "turnstile";

  return useMemo(() => ({
    isCaptchaEnabled: import.meta.env.VITE_CAPTCHA_ENABLED === "true",
    captchaProvider: provider,
    captchaSiteKey: String(
      provider === "turnstile"
        ? import.meta.env.VITE_TURNSTILE_SITE_KEY ?? import.meta.env.VITE_CAPTCHA_SITE_KEY ?? ""
        : import.meta.env.VITE_CAPTCHA_SITE_KEY ?? "",
    ),
  }), [provider]);
}
