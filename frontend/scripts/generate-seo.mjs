import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const outputDirectory = resolve(process.argv[2] ?? "dist");
const configuredOrigin = process.env.VITE_PUBLIC_SITE_URL?.trim() || "http://localhost:5173";
const parsedOrigin = new URL(configuredOrigin);

if (!['http:', 'https:'].includes(parsedOrigin.protocol)) {
  throw new Error("A VITE_PUBLIC_SITE_URL csak http vagy https URL lehet.");
}

const origin = parsedOrigin.origin;
const publicRoutes = ["/", "/auctions", "/how-it-works", "/about", "/contact", "/terms", "/privacy", "/support"];
const robots = [
  "User-agent: *",
  "Allow: /",
  "Disallow: /account",
  "Disallow: /admin",
  "Disallow: /login",
  "Disallow: /register",
  "Disallow: /forgot-password",
  "Disallow: /reset-password",
  "Disallow: /auth/",
  `Sitemap: ${origin}/sitemap.xml`,
  "",
].join("\n");
const sitemap = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
  ...publicRoutes.map((route) => `  <url><loc>${origin}${route}</loc></url>`),
  '</urlset>',
  '',
].join("\n");

await writeFile(resolve(outputDirectory, "robots.txt"), robots, "utf8");
await writeFile(resolve(outputDirectory, "sitemap.xml"), sitemap, "utf8");

const indexPath = resolve(outputDirectory, "index.html");
const index = await readFile(indexPath, "utf8");
const absoluteIndex = index
  .replace('content="/"', `content="${origin}/"`)
  .replaceAll('content="/assets/nightfall-vault-logo.png"', `content="${origin}/assets/nightfall-vault-logo.png"`)
  .replace('rel="canonical" href="/"', `rel="canonical" href="${origin}/"`);
await writeFile(indexPath, absoluteIndex, "utf8");
