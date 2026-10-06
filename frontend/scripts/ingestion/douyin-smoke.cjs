// 抖音真抓冒烟脚本(线 B)。证明你的常驻 CDP 连接 + 已登录态能抓到创作者中心数据。
//
// 用法:
//   1) 用 --remote-debugging-port 起 Chrome 并已登录抖音创作者中心,例如(macOS):
//      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
//        --remote-debugging-port=9222 --user-data-dir="$HOME/.creatoros-chrome"
//      在该 Chrome 里登录 https://creator.douyin.com
//   2) (可选)设端口:export CREATOROS_CDP_URL=http://localhost:9222
//   3) node frontend/scripts/ingestion/douyin-smoke.cjs
//
// 它只读、不落库、不碰 cookie 文件。落库走 ingestion.service 的 refreshDouyin(后续接线)。
const { chromium } = require("@playwright/test");

const CDP_URL = process.env.CREATOROS_CDP_URL || "http://localhost:9222";
const CREATOR_HOME = "https://creator.douyin.com/creator-micro/content/manage";
const WORK_LIST_HINT = "/creator/pc/work_list";

(async () => {
  console.log("connecting CDP:", CDP_URL);
  const browser = await chromium.connectOverCDP(CDP_URL, { timeout: 120_000 });
  try {
    const context = browser.contexts()[0] || (await browser.newContext());
    const page = context.pages()[0] || (await context.newPage());
  page.setDefaultTimeout(120_000);
  page.setDefaultNavigationTimeout(120_000);
    const workJsons = [];
    page.on("response", async (resp) => {
      if (resp.url().includes(WORK_LIST_HINT)) {
        try {
          workJsons.push(await resp.json());
        } catch {}
      }
    });
    console.log("navigating creator center …");
    await page.goto(CREATOR_HOME, { waitUntil: "networkidle" });
    for (let i = 0; i < 6; i++) {
      await page.mouse.wheel(0, 2400);
      await page.waitForTimeout(2000);
    }
    const list = workJsons.flatMap(
      (j) => (j && (j.aweme_list || j.item_list)) || [],
    );
    console.log("captured work_list responses:", workJsons.length);
    console.log("works seen:", list.length);
    const first = list[0];
    if (first) {
      const s = first.statistics || first.stats || {};
      console.log("sample:", {
        aweme_id: first.aweme_id || first.item_id,
        desc: (first.desc || first.title || "").slice(0, 30),
        play: s.play_count,
        digg: s.digg_count,
      });
    } else {
      console.log(
        "未抓到作品 —— 确认该 Chrome 已登录抖音创作者中心,且端口正确。",
      );
    }
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error("SMOKE_ERR", e.message);
  process.exit(1);
});
