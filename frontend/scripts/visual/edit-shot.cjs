// One-shot: open the positioning edit drawer/modal and screenshot it.
const { chromium } = require("@playwright/test");
const BASE = "http://localhost:3000";
const outfile = process.argv[2] || "docs/positioning-redesign/edit-current.png";

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    deviceScaleFactor: 2,
  });
  const login = await context.request.post(`${BASE}/api/v1/auth/login`, {
    headers: { "content-type": "application/json" },
    data: { email: "zyongzhu@creatoros.local", password: "creatoros-dev" },
  });
  if (!login.ok()) throw new Error("login failed: " + login.status());
  const page = await context.newPage();
  page.setDefaultTimeout(120_000);
  page.setDefaultNavigationTimeout(120_000);
  await page.goto(BASE + "/positioning", { waitUntil: "networkidle" });
  await page.waitForTimeout(1000);
  // Click the hero 编辑 button (opens the draft drawer). Fall back to 新建定位版本.
  let clicked = false;
  for (const sel of ['button:has-text("编辑")', 'button:has-text("新建定位版本")', 'text=编辑']) {
    const el = page.locator(sel).first();
    if (await el.count()) {
      await el.click();
      clicked = true;
      break;
    }
  }
  console.log("clicked edit:", clicked);
  await page.waitForTimeout(1200);
  await page.screenshot({ path: outfile, fullPage: true });
  console.log("saved", outfile);
  await browser.close();
})().catch((e) => {
  console.error("SHOT_ERR", e.message);
  process.exit(1);
});
