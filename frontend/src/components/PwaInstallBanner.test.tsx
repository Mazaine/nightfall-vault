import { StrictMode } from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PWA_INSTALL_DISMISSAL_KEY, PWA_INSTALL_DISMISSAL_MS, type BeforeInstallPromptEvent } from "../hooks/usePwaInstall";
import { PwaInstallBanner } from "./PwaInstallBanner";

function setStandaloneMode(matches: boolean) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: query === "(display-mode: standalone)" && matches,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

function dispatchInstallPrompt(outcome: "accepted" | "dismissed" = "accepted") {
  const prompt = vi.fn().mockResolvedValue(undefined);
  const event = new Event("beforeinstallprompt", { cancelable: true }) as BeforeInstallPromptEvent;
  Object.defineProperties(event, {
    prompt: { value: prompt },
    userChoice: { value: Promise.resolve({ outcome, platform: "web" }) },
  });
  const preventDefault = vi.spyOn(event, "preventDefault");
  act(() => window.dispatchEvent(event));
  return { event, preventDefault, prompt };
}

describe("PwaInstallBanner", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
    setStandaloneMode(false);
    Object.defineProperty(window.navigator, "standalone", { configurable: true, value: false });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("does not render without a beforeinstallprompt event", () => {
    render(<PwaInstallBanner />);
    expect(screen.queryByText("Nightfall Vault a telefonodon")).not.toBeInTheDocument();
  });

  it("renders after a beforeinstallprompt event and suppresses automatic prompting", () => {
    render(<PwaInstallBanner />);
    const { preventDefault } = dispatchInstallPrompt();
    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Nightfall Vault a telefonodon")).toBeInTheDocument();
  });

  it("opens the native prompt only after the install button is clicked", async () => {
    render(<PwaInstallBanner />);
    const { prompt } = dispatchInstallPrompt();
    expect(prompt).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Telepítés" }));
    await waitFor(() => expect(prompt).toHaveBeenCalledTimes(1));
  });

  it("hides after an accepted native install choice", async () => {
    render(<PwaInstallBanner />);
    dispatchInstallPrompt("accepted");
    fireEvent.click(screen.getByRole("button", { name: "Telepítés" }));
    await waitFor(() => expect(screen.queryByText("Nightfall Vault a telefonodon")).not.toBeInTheDocument());
    expect(window.localStorage.getItem(PWA_INSTALL_DISMISSAL_KEY)).toBeNull();
  });

  it("hides after a dismissed native install choice", async () => {
    render(<PwaInstallBanner />);
    dispatchInstallPrompt("dismissed");
    fireEvent.click(screen.getByRole("button", { name: "Telepítés" }));
    await waitFor(() => expect(screen.queryByText("Nightfall Vault a telefonodon")).not.toBeInTheDocument());
  });

  it("hides when the browser reports appinstalled", () => {
    render(<PwaInstallBanner />);
    dispatchInstallPrompt();
    act(() => window.dispatchEvent(new Event("appinstalled")));
    expect(screen.queryByText("Nightfall Vault a telefonodon")).not.toBeInTheDocument();
  });

  it("does not render in display-mode standalone", () => {
    setStandaloneMode(true);
    render(<PwaInstallBanner />);
    dispatchInstallPrompt();
    expect(screen.queryByText("Nightfall Vault a telefonodon")).not.toBeInTheDocument();
  });

  it("does not render when the iOS standalone flag is true", () => {
    Object.defineProperty(window.navigator, "standalone", { configurable: true, value: true });
    render(<PwaInstallBanner />);
    dispatchInstallPrompt();
    expect(screen.queryByText("Nightfall Vault a telefonodon")).not.toBeInTheDocument();
  });

  it("stores a seven-day dismissal when Now not is clicked", () => {
    const now = 1_800_000_000_000;
    vi.spyOn(Date, "now").mockReturnValue(now);
    render(<PwaInstallBanner />);
    dispatchInstallPrompt();
    fireEvent.click(screen.getByRole("button", { name: "Most nem" }));
    expect(Number(window.localStorage.getItem(PWA_INSTALL_DISMISSAL_KEY))).toBe(now + PWA_INSTALL_DISMISSAL_MS);
    expect(screen.queryByText("Nightfall Vault a telefonodon")).not.toBeInTheDocument();
  });

  it("does not reappear during the dismissal period", () => {
    const now = 1_800_000_000_000;
    vi.spyOn(Date, "now").mockReturnValue(now);
    window.localStorage.setItem(PWA_INSTALL_DISMISSAL_KEY, String(now + PWA_INSTALL_DISMISSAL_MS));
    render(<PwaInstallBanner />);
    dispatchInstallPrompt();
    expect(screen.queryByText("Nightfall Vault a telefonodon")).not.toBeInTheDocument();
  });

  it("can reappear after the dismissal period expires", () => {
    const now = 1_800_000_000_000;
    vi.spyOn(Date, "now").mockReturnValue(now);
    window.localStorage.setItem(PWA_INSTALL_DISMISSAL_KEY, String(now - 1));
    render(<PwaInstallBanner />);
    dispatchInstallPrompt();
    expect(screen.getByText("Nightfall Vault a telefonodon")).toBeInTheDocument();
  });

  it("does not crash when localStorage reads and writes are blocked", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
    render(<PwaInstallBanner />);
    dispatchInstallPrompt();
    expect(screen.getByText("Nightfall Vault a telefonodon")).toBeInTheDocument();
    expect(() => fireEvent.click(screen.getByRole("button", { name: "Most nem" }))).not.toThrow();
    expect(screen.queryByText("Nightfall Vault a telefonodon")).not.toBeInTheDocument();
  });

  it("does not invoke the native prompt twice in React Strict Mode", async () => {
    render(<StrictMode><PwaInstallBanner /></StrictMode>);
    const { prompt } = dispatchInstallPrompt();
    const installButton = screen.getByRole("button", { name: "Telepítés" });
    fireEvent.click(installButton);
    fireEvent.click(installButton);
    await waitFor(() => expect(prompt).toHaveBeenCalledTimes(1));
  });

  it("exposes both actions as keyboard-accessible buttons with clear names", () => {
    render(<PwaInstallBanner />);
    dispatchInstallPrompt();
    const installButton = screen.getByRole("button", { name: "Telepítés" });
    const dismissButton = screen.getByRole("button", { name: "Most nem" });
    expect(installButton.tagName).toBe("BUTTON");
    expect(dismissButton.tagName).toBe("BUTTON");
    expect(installButton).toHaveAttribute("type", "button");
    installButton.focus();
    expect(installButton).toHaveFocus();
  });
});
