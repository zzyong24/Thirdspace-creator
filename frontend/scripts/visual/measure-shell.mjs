// measure-shell.mjs — measure sidebar/header geometry on a running dev server
import { createRequire } from "node:module";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const FRONTEND_ROOT = resolve(__dirname, "..", "..");
const REPO_ROOT = resolve(FRONTEND_ROOT, "..");

const require = createRequire(import.meta.url);

const candidates = [
  resolve(FRONTEND_ROOT, "node_modules", "playwright"),
  resolve(FRONTEND_ROOT, "node_modules", "playwright-core"),
  resolve(REPO_ROOT, "node_modules", ".pnpm", "playwright@1.60.0", "node_modules", "playwright"),
  resolve(REPO_ROOT, "node_modules", ".pnpm", "playwright-core@1.60.0", "node_modules", "playwright-core"),
];

let playwright;
for (const c of candidates) {
  try {
    playwright = require(c);
    break;
  } catch {
    // continue
  }
}
if (!playwright) {
  console.error("no playwright found");
  process.exit(2);
}

const PORT = process.argv[2] || "3202";
const PATH_ = process.argv[3] || "/";
const BASE = `http://127.0.0.1:${PORT}`;

(async () => {
  const b = await playwright.chromium.launch();
  const c = await b.newContext({ viewport: { width: 1536, height: 1024 } });
  const p = await c.newPage();
  p.setDefaultTimeout(120_000);
  p.setDefaultNavigationTimeout(120_000);
  await p.goto(BASE + PATH_, { waitUntil: "load" });
  await p.waitForTimeout(500);

  const sidebar = await p.locator('[data-slot="app-sidebar"]').boundingBox();
  const header = await p.locator('[data-slot="app-top-header"]').boundingBox();
  const navItems = await p.locator('[data-slot="sidebar-nav-item"]').all();
  const navWidths = [];
  for (const item of navItems) {
    const bb = await item.boundingBox();
    const txt = (await item.textContent())?.trim();
    navWidths.push({ txt, w: bb?.width, h: bb?.height });
  }
  const active = await p.locator('[data-slot="sidebar-nav-item"][aria-current="page"]').boundingBox();
  const brand = await p.locator('[data-slot="sidebar-brand"]').boundingBox();
  const card = await p.locator('[data-slot="sidebar-contextual-card"]').boundingBox();
  const user = await p.locator('[data-slot="sidebar-user-profile"]').boundingBox();
  const cards = await p.locator('[data-slot="metric-card"]').all();
  const cardSizes = [];
  for (const cc of cards) {
    const bb = await cc.boundingBox();
    cardSizes.push(bb);
  }
  const sectionCards = await p.locator('[data-slot="section-card"]').all();
  const sectionSizes = [];
  for (const cc of sectionCards) {
    const bb = await cc.boundingBox();
    sectionSizes.push(bb);
  }

  console.log(JSON.stringify({ sidebar, header, navWidths, active, brand, card, user, metricCount: cardSizes.length, firstMetric: cardSizes[0], sectionCount: sectionSizes.length, firstSection: sectionSizes[0] }, null, 2));
  await b.close();
})();
