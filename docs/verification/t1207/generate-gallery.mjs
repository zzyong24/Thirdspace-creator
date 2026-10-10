import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.join(here, "scenario-index.ndjson");
const rows = fs.readFileSync(indexPath, "utf8")
  .split(/\r?\n/u)
  .filter(Boolean)
  .map((line) => JSON.parse(line));

const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/gu, (char) => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
}[char]));
const counts = rows.reduce((result, row) => {
  result[row.status] = (result[row.status] ?? 0) + 1;
  return result;
}, {});
const groups = new Map();
for (const row of rows) {
  if (!groups.has(row.spec)) groups.set(row.spec, []);
  groups.get(row.spec).push(row);
}
const statusLabel = (status) => ({
  passed: "PASS",
  failed: "FAIL",
  timedOut: "TIMEOUT",
  skipped: "SKIP",
}[status] ?? status);

let html = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>T-1207 浏览器场景截图总览</title>
<style>
:root{color-scheme:light;--bg:#f4f6fa;--card:#fff;--ink:#19212e;--muted:#697586;--line:#dde3ed;--purple:#6747ff;--pass:#137b4d;--fail:#b42318;--timeout:#a15c00}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:14px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
.top{position:sticky;top:0;z-index:2;background:#fff;border-bottom:1px solid var(--line);padding:18px 24px}.wrap,.group{max-width:1480px;margin:auto}
.top h1{font-size:22px;margin:0 0 6px}.meta{color:var(--muted)}.filters{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}.filters a{border:1px solid var(--line);border-radius:999px;padding:4px 10px;background:#fff;color:inherit;text-decoration:none}
.group{padding:0 16px;margin-top:24px}.group h2{font-size:16px;margin:0 0 10px;display:flex;gap:10px;align-items:center}.count{font-size:12px;font-weight:500;color:var(--muted)}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px}.case{background:var(--card);border:1px solid var(--line);border-radius:12px;overflow:hidden}
.thumb{height:185px;display:block;background:#e7eaf1;overflow:hidden}.thumb img{width:100%;height:100%;object-fit:cover;object-position:top center;display:block}.details{padding:12px}
.line1{display:flex;justify-content:space-between;align-items:center;gap:8px}.badge{font-size:11px;font-weight:700;padding:2px 8px;border-radius:999px;white-space:nowrap}
.passed .badge{color:var(--pass);background:#e9f7ef}.failed .badge{color:var(--fail);background:#fff0ef}.timedOut .badge{color:var(--timeout);background:#fff4e5}
.title{font-weight:650;margin:8px 0;overflow-wrap:anywhere}.url{font-size:12px;color:var(--purple);overflow-wrap:anywhere}.error{font-size:12px;color:var(--fail);margin-top:8px;max-height:4.5em;overflow:hidden;white-space:pre-wrap}.testid{font:10px ui-monospace,monospace;color:var(--muted);margin-top:8px}.empty{height:100%;display:grid;place-content:center;color:var(--muted)}
@media(max-width:600px){.top{padding:14px}.group{padding:0 10px}.grid{grid-template-columns:1fr}}
</style></head><body>
<header class="top"><div class="wrap"><h1>T-1207 浏览器场景截图总览</h1>
<div class="meta">${rows.length} cases / ${groups.size} spec · ${counts.passed ?? 0} passed · ${counts.failed ?? 0} failed · ${counts.timedOut ?? 0} timed out。点击缩略图查看原图。</div>
<div class="filters"><a href="#all">全部 ${rows.length}</a><a href="#passed">PASS ${counts.passed ?? 0}</a><a href="#failed">FAIL ${counts.failed ?? 0}</a><a href="#timedOut">TIMEOUT ${counts.timedOut ?? 0}</a><a href="E2E-CASE-INDEX.md">逐例 Markdown 索引</a><a href="full-e2e.log">完整 E2E</a><a href="route-matrix-expanded.log">路由矩阵</a><a href="visual.log">视觉基线</a><a href="accessibility.log">无障碍矩阵</a><a href="media-tab.log">素材导入与导出</a><a href="appium-probe.md">Appium 探测</a></div></div></header>`;

for (const [spec, cases] of groups) {
  const anchor = spec.split("/").pop().replace(/[^a-zA-Z0-9_-]/gu, "-");
  const specCounts = cases.reduce((result, row) => {
    result[row.status] = (result[row.status] ?? 0) + 1;
    return result;
  }, {});
  html += `<section class="group" id="${escapeHtml(anchor)}"><h2>${escapeHtml(spec)} <span class="count">${cases.length} cases · ${specCounts.passed ?? 0} PASS · ${specCounts.failed ?? 0} FAIL · ${specCounts.timedOut ?? 0} TIMEOUT</span></h2><div class="grid">`;
  for (const row of cases) {
    const error = row.errors?.[0]?.message ?? row.screenshotError ?? "";
    const thumb = row.screenshot
      ? `<a class="thumb" href="${escapeHtml(row.screenshot)}" target="_blank" rel="noopener"><img loading="lazy" src="${escapeHtml(row.screenshot)}" alt="${escapeHtml(row.title)}"></a>`
      : `<div class="thumb"><span class="empty">截图缺失：${escapeHtml(row.screenshotStatus)}</span></div>`;
    html += `<article class="case ${escapeHtml(row.status)}" id="case-${escapeHtml(row.testId)}">${thumb}<div class="details"><div class="line1"><span class="count">${escapeHtml(row.spec)} · retry ${row.retry}</span><span class="badge">${statusLabel(row.status)}</span></div><div class="title">${escapeHtml(row.title)}</div><div class="url">${escapeHtml(row.url ?? "页面已关闭，URL不可用")}</div>${error ? `<div class="error">${escapeHtml(error)}</div>` : ""}<div class="testid">${escapeHtml(row.testId)}</div></div></article>`;
  }
  html += "</div></section>";
}
html += "</body></html>\n";
fs.writeFileSync(path.join(here, "E2E-GALLERY.html"), html);

let markdown = `# T-1207 浏览器场景逐例截图索引\n\n` +
  `全量截图索引包含 ${rows.length} cases / ${groups.size} 个 spec：${counts.passed ?? 0} passed、${counts.failed ?? 0} failed、${counts.timedOut ?? 0} timed out、${counts.skipped ?? 0} skipped。\n\n` +
  `[打开静态截图总览](E2E-GALLERY.html) · [完整 E2E](full-e2e.log) · [扩展路由矩阵](route-matrix-expanded.log) · [视觉基线](visual.log) · [无障碍矩阵](accessibility.log) · [媒体导入/导出](media-tab.log) · [Appium 探测](appium-probe.md)\n\n`;
for (const [spec, cases] of groups) {
  markdown += `## ${spec}\n\n| 状态 | 用例 | URL | 截图 | Test ID |\n|---|---|---|---|---|\n`;
  for (const row of cases) {
    const title = row.title.replace(/\|/gu, "\\|").replace(/\n/gu, " ");
    const url = row.url ? `[${row.url}](${row.url})` : "页面已关闭";
    const screenshot = row.screenshot ? `[查看](${row.screenshot})` : `缺失（${row.screenshotStatus}）`;
    markdown += `| ${statusLabel(row.status)} | ${title} | ${url} | ${screenshot} | \`${row.testId}\` |\n`;
    if (row.errors?.[0]?.message) {
      markdown += `\n失败证据：\n\n\`\`\`text\n${row.errors[0].message.slice(0, 1200)}\n\`\`\`\n\n`;
    }
  }
  markdown += "\n";
}
fs.writeFileSync(path.join(here, "E2E-CASE-INDEX.md"), markdown);
console.log(`已生成 ${rows.length} 条用例、${groups.size} 个 spec 的 gallery 与索引。`);
