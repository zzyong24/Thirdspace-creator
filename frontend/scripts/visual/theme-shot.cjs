// Screenshot a route under a chosen theme (light|dark) — sets the same
// localStorage key the root-layout theme-init script reads, so .dark applies
// before paint. Usage: node scripts/visual/theme-shot.cjs <route> <outfile> <theme>
const { chromium } = require("@playwright/test");
const BASE = "http://localhost:3000";
const route = process.argv[2] || "/topics";
const outfile = process.argv[3] || "docs/positioning-redesign/theme.png";
const theme = process.argv[4] || "dark";

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1600, height: 1000 },
    deviceScaleFactor: 2,
  });
  const login = await context.request.post(`${BASE}/api/v1/auth/login`, {
    headers: { "content-type": "application/json" },
    data: { email: "zyongzhu@creatoros.local", password: "creatoros-dev" },
  });
  if (!login.ok()) throw new Error("login failed: " + login.status());
  await context.addInitScript((t) => {
    try {
      localStorage.setItem("creatoros.settings.theme", t);
    } catch (e) {}
  }, theme);
  const page = await context.newPage();
  await page.goto(BASE + route, { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: outfile, fullPage: true });
  console.log("saved", outfile, "theme=" + theme);
  await browser.close();
})().catch((e) => {
  console.error("SHOT_ERR", e.message);
  process.exit(1);
});
