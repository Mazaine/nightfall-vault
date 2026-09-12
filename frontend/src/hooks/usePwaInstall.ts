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

let sharedDeferredPrompt: BeforeInstallPromptEvent | null = null;
let sharedInstalled = false;
const installStateSubscribers = new Set<() => void>();

function publishInstallState() {
  installStateSubscribers.forEach((subscriber) => subscriber());
}

function setSharedPrompt(prompt: BeforeInstallPromptEvent | null) {
  sharedDeferredPrompt = prompt;
  publishInstallState();
}

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
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(sharedDeferredPrompt);
  const [dismissedUntil, setDismissedUntil] = useState(readDismissedUntil);
  const [standalone, setStandalone] = useState(isStandalone);
  const [installed, setInstalled] = useState(false);
  const promptInProgress = useRef(false);

  const dismissForNow = useCallback(() => {
    const nextAppearance = Date.now() + PWA_INSTALL_DISMISSAL_MS;
    setDismissedUntil(nextAppearance);
    writeDismissedUntil(nextAppearance);
    setSharedPrompt(null);
  }, []);

  useEffect(() => {
    const displayMode = window.matchMedia("(display-mode: standalone)");
    const syncSharedState = () => {
      setDeferredPrompt(sharedDeferredPrompt);
      setInstalled(sharedInstalled);
      setDismissedUntil(readDismissedUntil());
    };

    const handleInstallPrompt = (rawEvent: Event) => {
      const event = rawEvent as BeforeInstallPromptEvent;
      event.preventDefault();
      if (isStandalone() || readDismissedUntil() > Date.now()) return;
      if (!sharedDeferredPrompt) setSharedPrompt(event);
    };

    const handleInstalled = () => {
      promptInProgress.current = false;
      sharedInstalled = true;
      sharedDeferredPrompt = null;
      clearDismissal();
      publishInstallState();
    };

    const handleDisplayModeChange = (event: MediaQueryListEvent) => {
      setStandalone(event.matches);
      if (event.matches) setSharedPrompt(null);
    };

    installStateSubscribers.add(syncSharedState);
    syncSharedState();
    window.addEventListener("beforeinstallprompt", handleInstallPrompt);
    window.addEventListener("appinstalled", handleInstalled);
    displayMode.addEventListener("change", handleDisplayModeChange);

    return () => {
      installStateSubscribers.delete(syncSharedState);
      window.removeEventListener("beforeinstallprompt", handleInstallPrompt);
      window.removeEventListener("appinstalled", handleInstalled);
      displayMode.removeEventListener("change", handleDisplayModeChange);
      if (installStateSubscribers.size === 0) {
        sharedDeferredPrompt = null;
        sharedInstalled = false;
      }
    };
  }, []);

  const promptInstall = useCallback(async () => {
    if (!deferredPrompt || promptInProgress.current) return;

    promptInProgress.current = true;
    setSharedPrompt(null);
    try {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice.outcome === "accepted") {
        sharedInstalled = true;
        clearDismissal();
        publishInstallState();
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
    isInstalled: standalone || installed,
    dismissForNow,
    promptInstall,
  };
}
