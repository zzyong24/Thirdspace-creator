/**
 * [T-209] 复盘报告导出 —— 客户端自包含 HTML 生成 + `<a download>` 触发下载。
 *
 * 复盘页顶栏「导出报告」按钮(header 的 WorkspacePrimaryAction)与复盘内容
 * (AnalyticsReviewInteractiveRegion)在不同的组件子树,且 header 渲染在 children
 * 之上(context 无法从 children 上浮到 header)。因此用一个 **module 级单例桥**:
 *   - 复盘内容区 mount 时 `publishReviewExportModel(vm)` 发布当前已装配的 viewModel;
 *   - header 的「导出报告」click 时 `triggerReviewReportDownload(meta)` 读取该 vm,
 *     就地生成一份自包含 HTML 报告并触发浏览器下载(桌面 webview 通用,不依赖 Tauri fs)。
 *
 * 数据源 = 复盘页已有的 AnalyticsViewModel(review-workspace-data 装配),不新拉 op。
 * 报告含:项目标题、生成时间、核心指标、转化漏斗、AI 复盘要点、本期经验(洞察)、复盘记录。
 * 无已发布 vm(空态页未挂内容区)→ 返回 false,调用方据此提示「暂无可导出的复盘数据」。
 */

import type { AnalyticsViewModel } from "@/types/view-models";

export const REVIEW_EXPORT_LABEL = "导出报告";

// --- module 级单例桥 ---------------------------------------------------------
let publishedModel: AnalyticsViewModel | null = null;

/** 复盘内容区发布当前 viewModel(mount / 更新时调用;unmount 传 null 清空)。 */
export function publishReviewExportModel(vm: AnalyticsViewModel | null): void {
  publishedModel = vm;
}

/** 当前是否有可导出的复盘数据(header 按钮可据此判断)。 */
export function hasPublishedReviewModel(): boolean {
  return publishedModel !== null;
}

export interface ReviewReportMeta {
  /** 项目标题(header identity 携带,vm 无此字段)。缺省用 projectId 兜底。 */
  readonly projectTitle?: string;
}

// --- HTML 生成 ---------------------------------------------------------------

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function dateStamp(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function timeStamp(d: Date): string {
  return `${dateStamp(d)} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/** 生成一份自包含复盘报告 HTML(骨架完整 + inline 样式,可直接双击打开)。 */
export function buildReviewReportHtml(
  vm: AnalyticsViewModel,
  meta: ReviewReportMeta,
  now: Date = new Date(),
): string {
  const title = (meta.projectTitle ?? "").trim() || vm.projectId;
  const metrics = vm.metrics ?? [];
  const funnel = vm.conversionFunnel ?? [];
  const aiPoints = vm.aiAnalysis ?? [];
  const learnings = vm.candidateLearnings ?? [];
  const history = vm.reviewHistory ?? [];

  const metricsBlock =
    metrics.length === 0
      ? `<p class="empty">暂无采集到的核心指标。</p>`
      : `<div class="metrics">${metrics
          .map((m) => {
            const delta = m.delta ? escapeHtml(m.delta) : "";
            const trend =
              m.trend === "up" ? "▲" : m.trend === "down" ? "▼" : "";
            return `<div class="metric"><div class="metric-label">${escapeHtml(
              m.label,
            )}</div><div class="metric-value">${escapeHtml(
              String(m.value),
            )}</div>${
              delta
                ? `<div class="metric-delta t-${m.trend ?? "flat"}">${trend} ${delta}</div>`
                : ""
            }</div>`;
          })
          .join("")}</div>`;

  const funnelBlock =
    funnel.length === 0
      ? ""
      : `<section><h2>转化漏斗</h2><table><thead><tr><th>阶段</th><th>数值</th></tr></thead><tbody>${funnel
          .map(
            (row) =>
              `<tr><td>${escapeHtml(row.label)}</td><td class="num">${row.value.toLocaleString()}</td></tr>`,
          )
          .join("")}</tbody></table></section>`;

  const aiBlock = `<section><h2>AI 复盘要点</h2>${
    aiPoints.length === 0
      ? `<p class="empty">本条视频还没有生成 AI 复盘要点。</p>`
      : `<ul class="cards">${aiPoints
          .map(
            (p) =>
              `<li><div class="card-title">${escapeHtml(p.title)}</div>${
                p.body ? `<div class="card-body">${escapeHtml(p.body)}</div>` : ""
              }</li>`,
          )
          .join("")}</ul>`
  }</section>`;

  const learningsBlock = `<section><h2>本期经验(洞察)</h2>${
    learnings.length === 0
      ? `<p class="empty">本期还没有可采纳的经验候选。</p>`
      : `<ul class="cards">${learnings
          .map(
            (l) =>
              `<li><div class="card-title">${escapeHtml(l.title)}</div>${
                l.insight
                  ? `<div class="card-body">${escapeHtml(l.insight)}</div>`
                  : ""
              }</li>`,
          )
          .join("")}</ul>`
  }</section>`;

  const historyBlock =
    history.length === 0
      ? ""
      : `<section><h2>复盘记录</h2><ul class="history">${history
          .map(
            (h) =>
              `<li><span>${escapeHtml(h.title)}</span><span class="muted">${escapeHtml(
                h.completedAt,
              )}</span></li>`,
          )
          .join("")}</ul></section>`;

  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>复盘报告 · ${escapeHtml(title)}</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { margin: 0; padding: 32px 20px 64px; font-family: -apple-system, "PingFang SC", "Microsoft YaHei", system-ui, sans-serif; color: #1a1a1e; background: #fafafa; line-height: 1.5; }
  main { max-width: 860px; margin: 0 auto; }
  header.report-head { border-bottom: 2px solid #6d5efc; padding-bottom: 16px; margin-bottom: 24px; }
  header.report-head h1 { margin: 0 0 4px; font-size: 22px; }
  header.report-head .meta { color: #6b6b72; font-size: 13px; }
  section { margin: 24px 0; }
  h2 { font-size: 15px; margin: 0 0 12px; color: #2a2a30; border-left: 3px solid #6d5efc; padding-left: 8px; }
  .metrics { display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 10px; }
  .metric { border: 1px solid #e5e5ea; border-radius: 10px; padding: 12px; background: #fff; }
  .metric-label { font-size: 12px; color: #6b6b72; }
  .metric-value { font-size: 20px; font-weight: 600; margin-top: 2px; font-variant-numeric: tabular-nums; }
  .metric-delta { font-size: 12px; margin-top: 2px; }
  .t-up { color: #16a34a; } .t-down { color: #dc2626; } .t-flat { color: #6b6b72; }
  table { width: 100%; border-collapse: collapse; background: #fff; border: 1px solid #e5e5ea; border-radius: 10px; overflow: hidden; }
  th, td { text-align: left; padding: 8px 12px; font-size: 13px; border-bottom: 1px solid #f0f0f4; }
  th { background: #f5f5f8; color: #6b6b72; font-weight: 500; }
  td.num { text-align: right; font-variant-numeric: tabular-nums; }
  ul { list-style: none; margin: 0; padding: 0; }
  ul.cards li { border: 1px solid #e5e5ea; border-radius: 10px; padding: 12px 14px; background: #fff; margin-bottom: 8px; }
  .card-title { font-weight: 600; font-size: 14px; }
  .card-body { color: #4a4a52; font-size: 13px; margin-top: 4px; white-space: pre-wrap; }
  ul.history li { display: flex; justify-content: space-between; gap: 12px; padding: 8px 0; border-bottom: 1px solid #f0f0f4; font-size: 13px; }
  .muted { color: #9a9aa2; font-variant-numeric: tabular-nums; }
  .empty { color: #9a9aa2; font-size: 13px; font-style: italic; }
  footer { margin-top: 40px; color: #9a9aa2; font-size: 12px; text-align: center; }
</style>
</head>
<body>
<main>
  <header class="report-head">
    <h1>复盘报告 · ${escapeHtml(title)}</h1>
    <div class="meta">项目 ${escapeHtml(vm.projectId)} · 数据截至 ${escapeHtml(timeStamp(now))}</div>
  </header>
  <section><h2>核心指标</h2>${metricsBlock}</section>
  ${funnelBlock}
  ${aiBlock}
  ${learningsBlock}
  ${historyBlock}
  <footer>由 CreatorOS 复盘页导出 · ${escapeHtml(timeStamp(now))}</footer>
</main>
</body>
</html>`;
}

/** 报告文件名:`复盘-<项目名>-<日期>.html`(去掉文件系统敏感字符)。 */
export function reviewReportFileName(
  vm: AnalyticsViewModel,
  meta: ReviewReportMeta,
  now: Date = new Date(),
): string {
  const raw = (meta.projectTitle ?? "").trim() || vm.projectId;
  const safe = raw.replace(/[\\/:*?"<>|]+/g, "").slice(0, 40) || "复盘";
  return `复盘-${safe}-${dateStamp(now)}.html`;
}

/**
 * 读当前发布的复盘 vm → 生成报告 → 触发下载。
 * @returns true 已触发下载;false 无可导出数据(调用方据此提示)。
 */
export function triggerReviewReportDownload(meta: ReviewReportMeta): boolean {
  const vm = publishedModel;
  if (!vm) return false;
  if (typeof document === "undefined" || typeof URL.createObjectURL !== "function") {
    return false;
  }
  const now = new Date();
  const html = buildReviewReportHtml(vm, meta, now);
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = reviewReportFileName(vm, meta, now);
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  // 释放 objectURL(延迟一拍,确保 click 已发起下载)。
  setTimeout(() => URL.revokeObjectURL(url), 0);
  return true;
}
