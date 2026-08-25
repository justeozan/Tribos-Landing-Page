/**
 * Rend tools/og-card.html en assets/brand/og-card.png (1200x630).
 *
 * Séparé de tools/build-assets.py à dessein : la carte sociale porte du texte,
 * et la composer dans Pillow imposerait de recharger les polices du site à la
 * main. Un Chromium headless réutilise directement fonts.css et tribos.css, donc
 * la carte reste alignée sur la marque sans duplication.
 *
 * Prérequis : un serveur local sur le dépôt (file:// bloque les polices et le
 * sprite), et Playwright.
 *
 *   python3 -m http.server 8000 &
 *   npx playwright@1.62.1 install chromium   # une seule fois
 *   node tools/build-og.mjs                  # variable PORT pour changer de port
 */
import { chromium } from "playwright";
import { fileURLToPath } from "node:url";
import path from "node:path";

const PORT = process.env.PORT || 8000;
const url = `http://localhost:${PORT}/tools/og-card.html`;
const out = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "assets",
  "brand",
  "og-card.png"
);

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1200, height: 630 },
  deviceScaleFactor: 1,
});

const response = await page.goto(url, { waitUntil: "networkidle" });
if (!response || !response.ok()) {
  await browser.close();
  throw new Error(
    `${url} a répondu ${response ? response.status() : "rien"}. ` +
      `Lance d'abord un serveur : python3 -m http.server ${PORT}`
  );
}

// Sans cette attente la carte peut être capturée avec la police de repli.
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(300);

await page.screenshot({ path: out, type: "png" });
await browser.close();
console.log(`og-card.png écrite dans ${out}`);
