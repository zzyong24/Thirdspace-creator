import type { RequestContext, ENDPOINTS } from "@creatoros/contract";
type DailyReportPage = typeof ENDPOINTS.getDailyReport.response["_output"];
type Projects = ReturnType<typeof import("../../modules/projects").createProjectsService>;
type Publishing = ReturnType<typeof import("../../modules/publishing").createPublishingService>;
type Analytics = ReturnType<typeof import("../../modules/analytics").createAnalyticsService>;
export interface DailyReportPorts {
  now: () => string;
  projectsService: Pick<Projects, "listOutputRefsByOutputIds">;
  publishingService: Pick<Publishing, "listPublishedInWindow">;
  analyticsService: Pick<Analytics, "listLatestSnapshotsByPublicationIds">;
  trafficService: Pick<import("../../modules/analytics").TrafficService, "getProject">;
  readAccountName?: (ctx: RequestContext) => Promise<string | null>;
  readScript: (ctx: RequestContext, projectId: string) => Promise<string | null>;
  readPositioning: (ctx: RequestContext) => Promise<string | null>;
}
const DAY = 86_400_000;
/** SEMANTIC_BOUNDARY_ALLOW: 仅确定北京时间日期边界与真实指标字段，不进行内容选择或运营归因。 */
export function yesterdayBeijing(now: string) {
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(now));
  const start = Date.parse(day + "T00:00:00+08:00") - DAY;
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(start));
  return { date, start, end: start + DAY };
}

export function createDailyReportApplication(ports: DailyReportPorts) {
  return { async getDailyReport(ctx: RequestContext, date?: string): Promise<DailyReportPage> {
    const generatedAt = ports.now();
    const window = date ? { date, start: Date.parse(date + "T00:00:00+08:00"), end: Date.parse(date + "T00:00:00+08:00") + DAY } : yesterdayBeijing(generatedAt);
    if (date && (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(window.start) || new Date(date + "T00:00:00Z").toISOString().slice(0, 10) !== date)) throw new Error("日期无效");
    const report: DailyReportPage = { date: window.date, timeZone: "Asia/Shanghai", generatedAt, accountId: ctx.accountId ?? null, accountName: null, positioning: null, warnings: [], works: [], recentWorks: [] };
    if (!ctx.accountId) return report;
    const recentStart = window.start - 6 * DAY;
    // 从发布事实收窄到七天，避免先读取账号全部项目与产物。
    const pubs = await ports.publishingService.listPublishedInWindow(ctx, { start: new Date(recentStart).toISOString(), end: new Date(window.end).toISOString() });
    const visible = pubs.filter(p => p.accountId === ctx.accountId && p.status === "published" && !p.hiddenAt && !p.removedAt && p.publishedAt && Date.parse(p.publishedAt) >= recentStart && Date.parse(p.publishedAt) < window.end);
    const refs = await ports.projectsService.listOutputRefsByOutputIds(ctx, [...new Set(visible.map(p => p.contentOutputId))]);
    const byOutput = new Map(refs.map(r => [r.outputId, r]));
    const selected = visible.filter(p => byOutput.has(p.contentOutputId));
    let snapshots: Awaited<ReturnType<Analytics["listLatestSnapshotsByPublicationIds"]>> = [];
    const optionalReads = [
      (async () => { try { report.accountName = await ports.readAccountName?.(ctx) ?? null; } catch { report.warnings.push("账号名称暂时读取失败"); } })(),
      (async () => { try { report.positioning = await ports.readPositioning(ctx); } catch { report.warnings.push("定位暂时读取失败"); } })(),
      (async () => { try { snapshots = selected.length ? await ports.analyticsService.listLatestSnapshotsByPublicationIds(ctx, selected.map(p => p.id)) : []; } catch { report.warnings.push("作品指标暂时读取失败"); } })(),
    ];
    const current = selected.filter(p => Date.parse(p.publishedAt!) >= window.start);
    type Detail = { script: string | null; traffic: DailyReportPage["works"][number]["traffic"] };
    const projectData = new Map<string, Detail>();
    const projectIds = [...new Set(current.map(p => byOutput.get(p.contentOutputId)!.projectId))];
    let cursor = 0;
    // 历史列表不读取稿件和来源；同一项目仅读一次，最多四个项目同时取详情。
    async function readDetails() {
      while (cursor < projectIds.length) {
        const projectId = projectIds[cursor++]!;
        const detail: Detail = { script: null, traffic: [] };
        try { detail.script = await ports.readScript(ctx, projectId); } catch { report.warnings.push("部分作品稿件读取失败"); }
        try { detail.traffic = (await ports.trafficService.getProject(ctx, projectId)).items; } catch { report.warnings.push("部分流量来源读取失败"); }
        projectData.set(projectId, detail);
      }
    }
    await Promise.all([...optionalReads, ...Array.from({ length: Math.min(4, projectIds.length) }, () => readDetails())]);
    const byPublication = new Map(snapshots.map(s => [s.publicationId, s]));
    for (const pub of selected) {
      const ref = byOutput.get(pub.contentOutputId)!, snapshot = byPublication.get(pub.id), metrics: Record<string, number> = {};
      for (const [key, value] of Object.entries(snapshot?.rawMetrics ?? {})) if (typeof value === "number" && Number.isFinite(value)) metrics[key] = value;
      const work = { publicationId: pub.id, projectId: ref.projectId, title: ref.title || "未命名作品", publishedAt: pub.publishedAt!, capturedAt: snapshot?.capturedAt ?? null, metrics };
      report.recentWorks.push(work);
      if (Date.parse(pub.publishedAt!) >= window.start) {
        const detail = projectData.get(ref.projectId)!;
        report.works.push({ ...work, script: detail.script, traffic: detail.traffic.filter(t => t.publicationId === pub.id) });
      }
    }
    const newestFirst = (a: {publishedAt: string}, b: {publishedAt: string}) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt);
    report.works.sort(newestFirst); report.recentWorks.sort(newestFirst);
    report.warnings = [...new Set(report.warnings)];
    return report;
  } };
}
