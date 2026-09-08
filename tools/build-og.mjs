/**
 * Rend tools/og-card.html en assets/brand/og-card.png (1200x630).
 *
 * Séparé de tools/build-assets.py à dessein : la carte sociale porte du texte,
 * et la composer dans Pillow imposerait de recharger les polices du site à la
 * main. Un Chromium headless réutilise directement fonts.css et tribos.css, donc
 * la carte reste alignée sur la marque sans duplication. Le gabarit intègre
 * d'ailleurs l'écran d'accueil recréé en HTML, pas une capture : la carte est
 * donc en français et suit automatiquement toute correction du site.
 *
 * Aucune dépendance npm. Le script pilote Chrome directement via le protocole
 * DevTools, comme le reste du dépôt évite les bundlers : `node tools/build-og.mjs`
 * suffit, il n'y a rien à installer.
 *
 * Prérequis :
 *   - un serveur local sur la racine du dépôt (file:// bloque les polices et le
 *     sprite SVG) ;
 *   - un Chromium/Chrome sur la machine. Le script cherche, dans l'ordre :
 *     $CHROME, les binaires Playwright déjà présents, Google Chrome, Chromium.
 *
 *   python3 -m http.server 8000 &
 *   node tools/build-og.mjs              # PORT=8000 par défaut
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import os from "node:os";
import path from "node:path";

const PORT = process.env.PORT || 8000;
const url = `http://localhost:${PORT}/tools/og-card.html`;
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, "assets", "brand", "og-card.png");

const WIDTH = 1200;
const HEIGHT = 630;

/** First existing path in the list, or null. */
function firstExisting(candidates) {
  return candidates.find((p) => p && existsSync(p)) || null;
}

function findChrome() {
  if (process.env.CHROME) return process.env.CHROME;

  // Playwright's cache, if the machine already has it, without importing it.
  const cache = path.join(os.homedir(), "Library/Caches/ms-playwright");
  const linuxCache = path.join(os.homedir(), ".cache/ms-playwright");
  for (const dir of [cache, linuxCache]) {
    if (!existsSync(dir)) continue;
    const builds = readdirSync(dir)
      .filter((d) => d.startsWith("chromium"))
      .sort()
      .reverse();
    for (const b of builds) {
      const hit = firstExisting([
        path.join(dir, b, "chrome-mac/Chromium.app/Contents/MacOS/Chromium"),
        path.join(dir, b, "chrome-headless-shell-mac-arm64/chrome-headless-shell"),
        path.join(dir, b, "chrome-headless-shell-mac-x64/chrome-headless-shell"),
        path.join(dir, b, "chrome-linux/chrome"),
        path.join(dir, b, "chrome-headless-shell-linux64/chrome-headless-shell"),
      ]);
      if (hit) return hit;
    }
  }

  return firstExisting([
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ]);
}

const bin = findChrome();
if (!bin) {
  console.error(
    "Aucun Chrome/Chromium trouvé. Indiquer le binaire via CHROME=/chemin/vers/chrome."
  );
  process.exit(2);
}

const debugPort = 9222 + Math.floor(Math.random() * 1);
const chrome = spawn(
  bin,
  [
    "--headless=new",
    `--remote-debugging-port=${debugPort}`,
    `--window-size=${WIDTH},${HEIGHT}`,
    "--hide-scrollbars",
    "--no-sandbox",
    "--disable-gpu",
    "--force-color-profile=srgb",
    "--font-render-hinting=none",
    `--user-data-dir=${path.join(os.tmpdir(), "tribos-og")}`,
    "about:blank",
  ],
  { stdio: "ignore" }
);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function target() {
  for (let i = 0; i < 80; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json();
      const page = list.find((t) => t.type === "page");
      if (page) return page;
    } catch {
      /* not up yet */
    }
    await sleep(150);
  }
  throw new Error("Chrome n'a pas démarré.");
}

let ws;
try {
  const page = await target();
  ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => {
    ws.onopen = res;
    ws.onerror = rej;
  });

  let id = 0;
  const pending = new Map();
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) {
      pending.get(m.id)(m);
      pending.delete(m.id);
    }
  };
  const send = (method, params = {}) =>
    new Promise((res) => {
      const n = ++id;
      pending.set(n, res);
      ws.send(JSON.stringify({ id: n, method, params }));
    });

  await send("Page.enable");
  await send("Runtime.enable");
  await send("Network.enable");
  await send("Network.setCacheDisabled", { cacheDisabled: true });
  // The card is authored light. Rendering it under a dark OS preference would
  // silently ship a dark social image.
  await send("Emulation.setEmulatedMedia", {
    features: [
      { name: "prefers-color-scheme", value: "light" },
      { name: "prefers-reduced-motion", value: "reduce" },
    ],
  });
  await send("Emulation.setDeviceMetricsOverride", {
    width: WIDTH,
    height: HEIGHT,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await send("Page.navigate", { url });
  await sleep(900);

  // Fonts and images must be settled before the capture, and the reveal classes
  // have to be applied by hand: nothing scrolls in a 1200x630 render, so the
  // page's IntersectionObserver would never fire.
  const ready = await send("Runtime.evaluate", {
    expression: `(async()=>{
      document.documentElement.classList.remove('js');
      document.querySelectorAll('.reveal,[data-split],[data-anim]').forEach(e=>e.classList.add('is-in'));
      await document.fonts.ready;
      await Promise.all([...document.images].filter(i=>!i.complete)
        .map(i=>new Promise(r=>{i.onload=i.onerror=r})));
      return [...document.images].filter(i=>!i.naturalWidth).map(i=>i.currentSrc).join(', ');
    })()`,
    awaitPromise: true,
    returnByValue: true,
  });
  const broken = ready.result?.result?.value;
  if (broken) {
    console.error(`Images non chargées : ${broken}`);
    console.error(`Le serveur local tourne-t-il sur le port ${PORT} ?`);
    process.exit(1);
  }
  await sleep(400);

  const shot = await send("Page.captureScreenshot", {
    format: "png",
    clip: { x: 0, y: 0, width: WIDTH, height: HEIGHT, scale: 1 },
  });
  mkdirSync(path.dirname(out), { recursive: true });
  writeFileSync(out, Buffer.from(shot.result.data, "base64"));
  console.log(`écrit : ${path.relative(root, out)} (${WIDTH}x${HEIGHT})`);
} finally {
  if (ws) ws.close();
  chrome.kill();
}
process.exit(0);
