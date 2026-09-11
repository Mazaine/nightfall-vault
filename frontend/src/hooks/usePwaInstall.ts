import { useCallback, useEffect, useRef, useState } from "react";

export const PWA_INSTALL_DISMISSAL_KEY = "nightfall-vault:pwa-install-dismissal:v1";
export const PWA_INSTALL_DISMISSAL_MS = 7 * 24 * 60 * 60 * 1000;

type InstallChoice = {
  outcome: "accepted" | "dismissed";
  platform: string;
};

export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<InstallChoice>;
}

type NavigatorWithStandalone = Navigator & {
  readonly standalone?: boolean;
};

function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches
    || (window.navigator as NavigatorWithStandalone).standalone === true;
}

function readDismissedUntil() {
  try {
    const value = Number(window.localStorage.getItem(PWA_INSTALL_DISMISSAL_KEY));
    return Number.isFinite(value) ? value : 0;
  } catch {
    return 0;
  }
}

function writeDismissedUntil(value: number) {
  try {
    window.localStorage.setItem(PWA_INSTALL_DISMISSAL_KEY, String(value));
  } catch {
    // Storage can be unavailable in private or restricted browser contexts.
  }
}

function clearDismissal() {
  try {
    window.localStorage.removeItem(PWA_INSTALL_DISMISSAL_KEY);
  } catch {
    // Installation remains successful even if storage cleanup is unavailable.
  }
}

export function usePwaInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissedUntil, setDismissedUntil] = useState(readDismissedUntil);
  const [standalone, setStandalone] = useState(isStandalone);
  const [installed, setInstalled] = useState(false);
  const promptInProgress = useRef(false);

  const dismissForNow = useCallback(() => {
    const nextAppearance = Date.now() + PWA_INSTALL_DISMISSAL_MS;
    setDismissedUntil(nextAppearance);
    setDeferredPrompt(null);
    writeDismissedUntil(nextAppearance);
  }, []);

  useEffect(() => {
    const displayMode = window.matchMedia("(display-mode: standalone)");

    const handleInstallPrompt = (rawEvent: Event) => {
      const event = rawEvent as BeforeInstallPromptEvent;
      event.preventDefault();
      if (isStandalone() || readDismissedUntil() > Date.now()) return;
      setDeferredPrompt((current) => current ?? event);
    };

    const handleInstalled = () => {
      promptInProgress.current = false;
      setInstalled(true);
      setDeferredPrompt(null);
      clearDismissal();
    };

    const handleDisplayModeChange = (event: MediaQueryListEvent) => {
      setStandalone(event.matches);
      if (event.matches) setDeferredPrompt(null);
    };

    window.addEventListener("beforeinstallprompt", handleInstallPrompt);
    window.addEventListener("appinstalled", handleInstalled);
    displayMode.addEventListener("change", handleDisplayModeChange);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleInstallPrompt);
      window.removeEventListener("appinstalled", handleInstalled);
      displayMode.removeEventListener("change", handleDisplayModeChange);
    };
  }, []);

  const promptInstall = useCallback(async () => {
    if (!deferredPrompt || promptInProgress.current) return;

    promptInProgress.current = true;
    setDeferredPrompt(null);
    try {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice.outcome === "accepted") {
        setInstalled(true);
        clearDismissal();
      } else {
        dismissForNow();
      }
    } catch {
      // A consumed or unavailable native prompt stays hidden for this page session.
    } finally {
      promptInProgress.current = false;
    }
  }, [deferredPrompt, dismissForNow]);

  return {
    canInstall: Boolean(deferredPrompt) && !standalone && !installed && dismissedUntil <= Date.now(),
    dismissForNow,
    promptInstall,
  };
}
