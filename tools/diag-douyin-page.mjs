// T-463 诊断脚本:headed 起 Chromium 复用抖音登录态,跳数据中心页面 → 用户手动看页面版式。
// 使用: 双击运行 tools\diag-douyin-page.mjs (需 Node 25 + Playwright)
//
// 前提:
//   - 你在 CreatorOS 里已经扫码绑定过抖音号(登录态在 %APPDATA%\...\aitongban.creatoros\.auth\douyin\<accountId>\)
//   - 已装 Playwright Chromium(CreatorOS 首次运行时已装)
//
// 脚本会:
//   1. 找 .auth/douyin 下最新的账号目录
//   2. 用它 headed 启一个 Chromium(用户可见的窗口)
//   3. 打开数据中心页 https://creator.douyin.com/creator-micro/data-center/content
//   4. 停在那里,等用户手动观察 tab 文字/DOM
//   5. 用户按 Ctrl+C 或关窗口结束

import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import { pathToFileURL } from "node:url";

const AUTH_ROOT = join(
  process.env.APPDATA ?? join(homedir(), "AppData", "Roaming"),
  "cloud.aitongban.creatoros",
  ".auth",
  "douyin",
);
const DATA_CENTER_URL = "https://creator.douyin.com/creator-micro/data-center/content";

async function findLatestAuthDir() {
  const entries = await readdir(AUTH_ROOT).catch(() => []);
  if (entries.length === 0) {
    console.error(`[diag] 未找到抖音登录态目录 ${AUTH_ROOT}`);
    console.error(`[diag] 请先在 CreatorOS 里扫码绑定抖音号。`);
    process.exit(1);
  }
  let latest = null;
  let latestMtime = 0;
  for (const name of entries) {
    if (!name.startsWith("acct-")) continue;
    const full = join(AUTH_ROOT, name);
    const st = await stat(full).catch(() => null);
    if (st && st.mtimeMs > latestMtime) {
      latestMtime = st.mtimeMs;
      latest = full;
    }
  }
  if (!latest) {
    console.error("[diag] 未找到 acct-* 目录");
    process.exit(1);
  }
  return latest;
}

async function main() {
  console.log("[diag] T-463 抖音数据中心页面诊断");
  console.log("========================================");

  const authDir = await findLatestAuthDir();
  console.log(`[diag] 使用登录态: ${authDir}`);

  const playwrightUrl = pathToFileURL(
    "D:/workbase/Thirdspace-creator/frontend/node_modules/@playwright/test/index.mjs",
  );
  const { chromium } = await import(playwrightUrl.href);
  const ctx = await chromium.launchPersistentContext(authDir, {
    headless: false, // 用户能看到浏览器窗口
    viewport: { width: 1440, height: 900 },
    acceptDownloads: true,
    args: [
      "--disable-blink-features=AutomationControlled",
      "--no-proxy-server",
    ],
  });

  const page = ctx.pages()[0] ?? (await ctx.newPage());

  console.log(`[diag] 打开 ${DATA_CENTER_URL}`);
  await page.goto(DATA_CENTER_URL, { waitUntil: "domcontentloaded", timeout: 60_000 });

  console.log("[diag] 等 Garfish 微前端加载(15 秒)…");
  await page.waitForTimeout(15_000);

  console.log("");
  console.log("========================================");
  console.log("[diag] 浏览器窗口已打开,请观察:");
  console.log("  1. 当前默认停在哪个 tab?(直播场次 / 投稿作品 / ...)");
  console.log('  2. 点"投稿作品"这个 tab,能不能点开?');
  console.log('  3. 点开后有没有"投稿列表"这个子 tab?名字是不是这四个字?');
  console.log("  4. 打开 F12 → Elements → 找到 tab 那些按钮,把文字复制发我");
  console.log("");
  console.log("[diag] 关闭浏览器窗口 或 Ctrl+C 结束");

  // 页面里跑一次页扫描,把所有可见 tab 文字打印出来(方便快速看)
  try {
    const tabTexts = await page.evaluate(() => {
      const results = [];
      const isVisible = (el) => {
        const rect = el.getBoundingClientRect();
        const style = getComputedStyle(el);
        return (
          rect.width > 0 &&
          rect.height > 0 &&
          style.visibility !== "hidden" &&
          style.display !== "none"
        );
      };
      // 找有 role=tab 或含"tab"字样类名的元素
      const nodes = document.querySelectorAll(
        '[role="tab"], [class*="tab"], [class*="Tab"]',
      );
      for (const n of nodes) {
        if (!isVisible(n)) continue;
        const text = (n.textContent ?? "").trim();
        if (text.length === 0 || text.length > 20) continue;
        const rect = n.getBoundingClientRect();
        results.push({
          text,
          className: (n.className ?? "").toString().slice(0, 60),
          x: Math.round(rect.x),
          y: Math.round(rect.y),
        });
      }
      return results;
    });
    console.log("[diag] 页面可见 tab 元素(前 30 个):");
    tabTexts.slice(0, 30).forEach((t) => {
      console.log(`  · "${t.text}" @ (${t.x},${t.y})  class=${t.className}`);
    });

    // [T-463] 关键增补:扫描页面上所有可见按钮,专门找"导出数据/刷新数据/日期"等关键字
    console.log("");
    console.log("[diag] 关键按钮扫描(导出/刷新/时间):");
    const buttons = await page.evaluate(() => {
      const isVisible = (el) => {
        const rect = el.getBoundingClientRect();
        const style = getComputedStyle(el);
        return (
          rect.width > 0 &&
          rect.height > 0 &&
          style.visibility !== "hidden" &&
          style.display !== "none"
        );
      };
      const keywords = ["导出", "刷新", "全部", "近", "天", "月", "日", "筛选"];
      const results = [];
      // 找 button + [role="button"] + 所有含关键字的可点击元素
      const all = document.querySelectorAll(
        'button, [role="button"], a, [class*="btn"], [class*="Button"]',
      );
      for (const n of all) {
        if (!isVisible(n)) continue;
        const text = (n.textContent ?? "").trim();
        if (text.length === 0 || text.length > 30) continue;
        if (!keywords.some((k) => text.includes(k))) continue;
        const rect = n.getBoundingClientRect();
        results.push({
          text,
          tag: n.tagName,
          className: (n.className ?? "").toString().slice(0, 60),
          x: Math.round(rect.x),
          y: Math.round(rect.y),
        });
      }
      return results;
    });
    buttons.forEach((b) => {
      console.log(`  · <${b.tag}> "${b.text}" @ (${b.x},${b.y})  class=${b.className}`);
    });

    // [T-463 v2] 专门找"投稿分析/投稿列表"这两个子 tab —— 用户截图确认它们存在,但主 tab 扫描
    //   没抓到(用了非 role=tab / class 里没 "tab" 的元素?)。用**文本匹配**逐字扫,把长度/字节
    //   / DOM 深度打印出来,看为什么 hasVisibleByCharCodesInPage(t.length===4 严格等长)漏掉。
    console.log("");
    console.log("[diag] 「投稿分析/投稿列表」文本命中扫描:");
    const subtabs = await page.evaluate(() => {
      const target1 = "投稿分析";
      const target2 = "投稿列表";
      const isVisible = (el) => {
        const rect = el.getBoundingClientRect();
        const style = getComputedStyle(el);
        return (
          rect.width > 0 &&
          rect.height > 0 &&
          style.visibility !== "hidden" &&
          style.display !== "none"
        );
      };
      const results = [];
      // 遍历所有元素,找 textContent 精确含"投稿分析"或"投稿列表"的
      for (const el of document.querySelectorAll("*")) {
        const raw = el.textContent ?? "";
        const trimmed = raw.trim();
        if (!trimmed.includes(target1) && !trimmed.includes(target2)) continue;
        // 只关心「最深且短」的元素:含目标文本 + 自身文本长度 <= 目标长度+5(去掉嵌套父元素)
        if (trimmed.length > 12) continue;
        if (!isVisible(el)) continue;
        const rect = el.getBoundingClientRect();
        // 序列化 char codes 便于对比 SUBTAB_LIST_CODES = [25237, 31295, 21015, 34920]
        const codes = [];
        for (let i = 0; i < trimmed.length; i++) codes.push(trimmed.charCodeAt(i));
        results.push({
          text: JSON.stringify(trimmed),
          length: trimmed.length,
          codes: codes.join(","),
          tag: el.tagName,
          className: (el.className ?? "").toString().slice(0, 80),
          x: Math.round(rect.x),
          y: Math.round(rect.y),
        });
      }
      return results;
    });
    subtabs.forEach((s) => {
      console.log(
        `  · <${s.tag}> text=${s.text} len=${s.length} codes=[${s.codes}] @ (${s.x},${s.y}) class=${s.className}`,
      );
    });

    // [T-463 v3] 关键复现:模拟真机步骤 —— 现在点"投稿作品"标签(如果默认已在,再点一次也无害),
    //   然后再扫描"投稿列表"是否可见。目的:证明"点击是否生效"、"是不是初始就默认停在投稿作品"、
    //   "投稿列表被 hover-only / 折叠的可能"。
    console.log("");
    console.log("[diag] 模拟点击「投稿作品」并观察后续状态:");
    const clickTest = await page.evaluate(() => {
      // 找 charCodes=[25237,31295,20316,21697] 的最深可见元素并点它
      const target = [25237, 31295, 20316, 21697];
      let hit = null;
      let bestDepth = -1;
      for (const el of document.querySelectorAll("*")) {
        const t = (el.textContent ?? "").trim();
        if (t.length !== 4) continue;
        if (
          t.charCodeAt(0) !== target[0] ||
          t.charCodeAt(1) !== target[1] ||
          t.charCodeAt(2) !== target[2] ||
          t.charCodeAt(3) !== target[3]
        )
          continue;
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) continue;
        let depth = 0;
        for (let p = el.parentElement; p; p = p.parentElement) depth++;
        if (depth > bestDepth) {
          bestDepth = depth;
          hit = el;
        }
      }
      if (!hit) return { clicked: false, reason: "未找到「投稿作品」元素" };
      hit.click();
      return { clicked: true, tag: hit.tagName, class: hit.className.toString().slice(0, 60) };
    });
    console.log(`  点击结果: ${JSON.stringify(clickTest)}`);

    // 等 1 秒后再扫「投稿列表」
    await page.waitForTimeout(1000);
    const listAfter = await page.evaluate(() => {
      const target = [25237, 31295, 21015, 34920];
      const found = [];
      for (const el of document.querySelectorAll("*")) {
        const t = (el.textContent ?? "").trim();
        if (t.length !== 4) continue;
        if (
          t.charCodeAt(0) !== target[0] ||
          t.charCodeAt(1) !== target[1] ||
          t.charCodeAt(2) !== target[2] ||
          t.charCodeAt(3) !== target[3]
        )
          continue;
        const rect = el.getBoundingClientRect();
        found.push({
          tag: el.tagName,
          visible: rect.width > 0 && rect.height > 0,
          rect: `${rect.width.toFixed(0)}x${rect.height.toFixed(0)}`,
          x: Math.round(rect.x),
          y: Math.round(rect.y),
        });
      }
      return { count: found.length, items: found };
    });
    console.log(`  1s 后扫描「投稿列表」: 找到 ${listAfter.count} 个元素`);
    listAfter.items.forEach((it) => {
      console.log(`    · <${it.tag}> ${it.rect} @ (${it.x},${it.y}) visible=${it.visible}`);
    });
  } catch (e) {
    console.error("[diag] 扫描 tab 失败:", e?.message ?? e);
  }

  // 用户关窗口即退出
  await new Promise((resolve) => {
    ctx.on("close", resolve);
  });
  console.log("[diag] 浏览器已关闭,退出");
}

main().catch((err) => {
  console.error("[diag] 挂了:", err);
  process.exit(1);
});
