// Visual-verify harness step — screenshot an authenticated route for design
// comparison against a target design (the "render → screenshot → compare to the
// target image → fix → re-shoot" loop). NOT a committed test; a dev tool.
//
// Usage (dev server must already be running on :3000):
//   node scripts/visual/design-shot.cjs <route> <outfile> [width]
//   node scripts/visual/design-shot.cjs /positioning docs/positioning-redesign/live.png 1440
const { chromium } = require("@playwright/test");

const route = process.argv[2] || "/positioning";
const outfile = process.argv[3] || "docs/positioning-redesign/live.png";
const width = Number(process.argv[4]) || 1440;
const BASE = "http://localhost:3000";

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width, height: 1000 },
    deviceScaleFactor: 2,
  });
  // Dev session login (the canonical seeded user / documented dev credential).
  const login = await context.request.post(`${BASE}/api/v1/auth/login`, {
    headers: { "content-type": "application/json" },
    data: { email: "zyongzhu@creatoros.local", password: "creatoros-dev" },
  });
  if (!login.ok()) throw new Error("login failed: " + login.status());
  const page = await context.newPage();
  await page.goto(BASE + route, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: outfile, fullPage: true });
  console.log("saved", outfile);
  await browser.close();
})().catch((e) => {
  console.error("SHOT_ERR", e.message);
  process.exit(1);
});
