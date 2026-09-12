import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const frontendRoot = process.cwd();
const readProjectFile = (path) => readFileSync(resolve(frontendRoot, path), "utf8");

function pngDimensions(path) {
  const png = readFileSync(path);
  expect(png.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
}

describe("minimal PWA foundation", () => {
  const manifest = JSON.parse(readProjectFile("public/manifest.webmanifest"));

  it("defines the required manifest fields", () => {
    expect(manifest).toMatchObject({
      id: "/",
      name: "Nightfall Vault",
      short_name: "Nightfall Vault",
      start_url: "/",
      scope: "/",
      display: "standalone",
      theme_color: "#050509",
      background_color: "#050509",
      lang: "hu",
      dir: "ltr",
    });
  });

  it("references real, correctly sized PNG icons", () => {
    expect(manifest.icons).toEqual([
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ]);

    for (const icon of manifest.icons) {
      const iconPath = resolve(frontendRoot, "public", icon.src.slice(1));
      expect(existsSync(iconPath)).toBe(true);
      const [width, height] = icon.sizes.split("x").map(Number);
      expect(pngDimensions(iconPath)).toEqual({ width, height });
    }
  });

  it("links the manifest and PWA metadata from the HTML entry point", () => {
    const html = readProjectFile("index.html");
    expect(html).toContain('rel="manifest" href="/manifest.webmanifest"');
    expect(html).toContain('name="theme-color" content="#050509"');
    expect(html).toContain('name="mobile-web-app-capable" content="yes"');
  });

  it("keeps the service worker free of request interception and storage", () => {
    const serviceWorker = readProjectFile("public/service-worker.js");
    expect(serviceWorker).not.toMatch(/addEventListener\s*\(\s*["']fetch["']/);
    expect(serviceWorker).not.toMatch(/\bcaches\b/);
    expect(serviceWorker).not.toMatch(/\bCacheStorage\b/);
    expect(serviceWorker).not.toContain("skipWaiting");
    expect(serviceWorker).not.toContain("clients.claim");
  });

  it("contains validated push and notification click handlers with local assets", () => {
    const serviceWorker = readProjectFile("public/service-worker.js");
    expect(serviceWorker).toMatch(/addEventListener\s*\(\s*["']push["']/);
    expect(serviceWorker).toMatch(/addEventListener\s*\(\s*["']notificationclick["']/);
    expect(serviceWorker).toContain("registration.showNotification");
    expect(serviceWorker).toContain('icon: "/icons/icon-192.png"');
    expect(serviceWorker).not.toMatch(/icon:\s*payload\./);
  });

  it("registers the same root-scoped service worker in production and secure localhost development", () => {
    const registration = readProjectFile("src/registerServiceWorker.ts");
    expect(registration).toContain("import.meta.env.PROD");
    expect(registration).toContain('SERVICE_WORKER_PATH = "/service-worker.js"');
    expect(registration).toContain('SERVICE_WORKER_SCOPE = "/"');
    expect(registration).toContain("isLocalhost");
    expect(registration).toContain("isSecureContext");
    expect(registration).toContain("SERVICE_WORKER_READY_TIMEOUT_MS = 10_000");
    expect(registration).toContain(".catch(");
  });

  it("serves manifest and service worker as exact files instead of SPA HTML", () => {
    const nginx = readProjectFile("nginx-spa.conf");
    const manifestLocation = nginx.match(/location = \/manifest\.webmanifest \{([\s\S]*?)\n    \}/)?.[1] ?? "";
    const workerLocation = nginx.match(/location = \/service-worker\.js \{([\s\S]*?)\n    \}/)?.[1] ?? "";

    expect(manifestLocation).toContain("default_type application/manifest+json");
    expect(manifestLocation).toContain("try_files $uri =404");
    expect(manifestLocation).not.toContain("/index.html");
    expect(workerLocation).toContain("default_type application/javascript");
    expect(workerLocation).toContain("try_files $uri =404");
    expect(workerLocation).not.toContain("/index.html");
    expect(nginx).toContain("location ~* \\.webmanifest$");
    expect(nginx).toContain("location ~* (^|/)[^/]*service-worker[^/]*\\.js$");
    expect(nginx).toMatch(/location = \/sw\.js \{\s*return 404;/);
  });
});
