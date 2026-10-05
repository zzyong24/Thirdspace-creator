import Link from "next/link";
import type {
  AccountMetricSnapshotResource,
  PlatformWorkResource,
  WorkMetricSnapshotResource,
} from "@creatoros/contract";
import { PLATFORM_LABELS } from "./platform-account-labels";
const METRIC_NAMES: Record<string, string> = {
  follower_count: "粉丝总数", follower_gain: "新增粉丝", play_count: "播放量",
  view_count: "观看量", read_count: "阅读量", exposure_count: "曝光量",
  like_count: "点赞", comment_count: "评论", share_count: "分享", favorite_count: "收藏",
};
const AVAILABILITY_TEXT: Record<string, string> = {
  permissionDenied: "无读取权限", sourceMissing: "平台未提供", partial: "数据不完整",
  rateLimited: "平台暂时限制访问", parseFailed: "暂时无法读取", stale: "数据已过期",
};
const VISIBILITY_TEXT: Record<string, string> = {
  public: "公开", private: "私密", hidden: "已隐藏", removed: "已删除", unknown: "公开状态未核实",
};

export interface PlatformWorkCatalogModel {
  readonly accountId: string;
  readonly accountName: string;
  readonly catalogCompleteness: "none" | "legacyPartial" | "verifiedComplete";
  readonly catalogCompletedAt: string | null;
  readonly total: number;
  readonly currentTotal: number;
  readonly unavailableTotal: number;
  readonly nextCursor: string | null;
  readonly cursor: string | null;
  readonly works: readonly PlatformWorkResource[];
  readonly selectedWork: PlatformWorkResource | null;
  readonly workMetrics: readonly WorkMetricSnapshotResource[];
  readonly workMetricNextCursor: string | null;
  readonly workMetricCursor: string | null;
  readonly workMetricError: boolean;
  readonly accountMetrics: readonly AccountMetricSnapshotResource[];
  readonly accountMetricError: boolean;
  readonly accountMetricNextCursor: string | null;
  readonly accountMetricCursor: string | null;
}

function catalogNotice(model: PlatformWorkCatalogModel) {
  if (model.catalogCompleteness === "verifiedComplete") {
    return `本次目录已核验 ${model.currentTotal} 件作品，另有 ${model.unavailableTotal} 条历史记录待核验。核验时间：${model.catalogCompletedAt ?? "未知"}。`;
  }
  if (model.catalogCompleteness === "legacyPartial") {
    return `当前显示 ${model.total} 条历史记录，尚未核验是否包含全部作品。`;
  }
  return "尚无已核验的作品目录。已有平台内容可能尚未采集到这里。";
}

function metricValue(metric: AccountMetricSnapshotResource | WorkMetricSnapshotResource) {
  return metric.availability === "available" && metric.value !== null
    ? metric.value.toLocaleString("zh-CN")
    : (AVAILABILITY_TEXT[metric.availability] ?? "暂不可用");
}

function MetricRows({ metrics }: { readonly metrics: readonly (AccountMetricSnapshotResource | WorkMetricSnapshotResource)[] }) {
  return (
    <ul className="divide-y divide-border" data-testid="platform-metric-list">
      {metrics.map((metric) => (
        <li key={metric.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
          <span>{METRIC_NAMES[metric.metricKey] ?? metric.metricKey}</span>
          <span className="font-medium" data-availability={metric.availability}>{metricValue(metric)}</span>
          <time dateTime={metric.observedAt} className="w-full text-xs text-muted-foreground">
            记录时间：{metric.observedAt}
          </time>
        </li>
      ))}
    </ul>
  );
}

function worksUrl(cursor: string | null, workId?: string, metricCursor?: string | null, accountMetricCursor?: string | null) {
  const query = new URLSearchParams();
  if (cursor) query.set("cursor", cursor);
  if (workId) query.set("workId", workId);
  if (metricCursor) query.set("metricCursor", metricCursor);
  if (accountMetricCursor) query.set("accountMetricCursor", accountMetricCursor);
  const suffix = query.toString();
  return `/accounts/works${suffix ? `?${suffix}` : ""}`;
}

export function PlatformWorkCatalog({ model }: { readonly model: PlatformWorkCatalogModel }) {
  const { works, selectedWork } = model;
  return (
    <main className="flex flex-col gap-5" data-testid="platform-work-catalog" data-account-id={model.accountId}>
      <Link href="/accounts" className="self-start text-sm text-primary hover:underline">返回账号</Link>
      <header>
        <h1 className="text-xl font-semibold">{model.accountName}的作品与数据</h1>
        <p className="mt-1 text-sm text-muted-foreground" data-testid="catalog-completeness">
          {catalogNotice(model)}
        </p>
      </header>

      <section className="rounded-lg border border-border p-4" aria-label="账号数据">
        <h2 className="font-medium">账号数据</h2>
        {model.accountMetricError ? (
          <p role="alert" className="mt-2 text-sm text-destructive">账号数据暂时无法读取，请刷新后重试。</p>
        ) : model.accountMetrics.length > 0 ? (
          <MetricRows metrics={model.accountMetrics} />
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">暂无粉丝总量记录。</p>
        )}
        {model.accountMetricNextCursor ? (
          <Link href={worksUrl(model.cursor, selectedWork?.id, model.workMetricCursor, model.accountMetricNextCursor)} className="mt-3 inline-block text-sm text-primary hover:underline">下一页账号数据</Link>
        ) : null}
      </section>

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,1fr)]" aria-label="作品目录">
        <div className="rounded-lg border border-border p-4">
          <h2 className="font-medium">作品目录</h2>
          {works.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">当前目录没有作品。可返回账号页查看平台接入状态。</p>
          ) : (
            <ul className="mt-3 divide-y divide-border" data-testid="platform-work-list">
              {works.map((work) => (
                <li key={work.id}>
                  <Link
                    href={worksUrl(model.cursor, work.id)}
                    aria-current={selectedWork?.id === work.id ? "true" : undefined}
                    className="block rounded px-2 py-3 hover:bg-surface-subtle"
                  >
                    <span className="font-medium">{work.title ?? `${PLATFORM_LABELS[work.platform] ?? work.platform}作品 ${work.externalId}`}</span>
                    <span className="ml-2 text-xs text-muted-foreground">
                      {work.directoryState === "unavailable"
                        ? "本次目录未找到，状态待核验"
                        : (VISIBILITY_TEXT[work.visibility.visibility] ?? "状态未知")}
                    </span>
                    {work.title ? <span className="block text-xs text-muted-foreground">{PLATFORM_LABELS[work.platform] ?? work.platform} · {work.externalId}</span> : null}
                    {work.publishedAt ? <time className="block text-xs text-muted-foreground" dateTime={work.publishedAt}>发布于 {work.publishedAt}</time> : null}
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {model.nextCursor ? (
            <Link href={worksUrl(model.nextCursor)} className="mt-3 inline-block text-sm text-primary hover:underline">下一页作品</Link>
          ) : null}
        </div>

        <div className="rounded-lg border border-border p-4" data-testid="platform-work-detail">
          {selectedWork ? (
            <>
              <h2 className="font-medium">{selectedWork.title ?? `作品 ${selectedWork.externalId}`}</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                {PLATFORM_LABELS[selectedWork.platform] ?? selectedWork.platform} · {selectedWork.directoryState === "unavailable"
                  ? "本次目录未找到，状态待核验"
                  : (VISIBILITY_TEXT[selectedWork.visibility.visibility] ?? "状态未知")}
              </p>
              {selectedWork.directoryState === "unavailable" ? (
                <p className="mt-2 text-xs text-muted-foreground">下方仅供查看历史数据，作品当前状态尚待平台核实。</p>
              ) : null}
              {selectedWork.legacyProjectId ? (
                <Link href={`/projects/${encodeURIComponent(selectedWork.legacyProjectId)}`} className="mt-2 inline-block text-sm text-primary hover:underline">查看关联项目</Link>
              ) : null}
              <h3 className="mt-4 text-sm font-medium">作品数据记录</h3>
              {model.workMetricError ? (
                <p role="alert" className="mt-2 text-sm text-destructive">作品数据暂时无法读取，请刷新后重试。</p>
              ) : model.workMetrics.length > 0 ? (
                <MetricRows metrics={model.workMetrics} />
              ) : (
                <p className="mt-2 text-sm text-muted-foreground">暂无可查看的作品数据记录。</p>
              )}
              {model.workMetricNextCursor ? (
                <Link href={worksUrl(model.cursor, selectedWork.id, model.workMetricNextCursor)} className="mt-3 inline-block text-sm text-primary hover:underline">下一页数据记录</Link>
              ) : null}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">选择左侧作品，查看关联项目和真实数据。</p>
          )}
        </div>
      </section>
    </main>
  );
}
