/**
 * 内容日历 page (T-083a 样板 · SPEC 2026-07-03-content-calendar-redesign §1 方案 C)。
 *
 * 核心翻转:**过去格直接渲 publications 真数据**(经 publishing-center 的
 * `buildPublishingCenterViewModelReal` 复用 T-082 views 口径),未来格才读
 * `content_calendar_entries`(现 0 行 → 诚实空)。三张 SectionCard 列表被替换为
 * 月历格视图(`ContentCalendarView`),日详情抽屉本片只读。
 *
 * Server-component shell with a `viewModel?` test seam。月份来自路由
 * `?month=YYYY-MM`(静态跳转),缺省取 REFERENCE_INSTANT 所在月。
 *
 * Determinism (C-5): 月窗从注入的 `referenceInstant`(固定常量)+ month 参数派生,
 * NEVER wall-clock。No Date.now / Math.random / fetch in render or selectors。
 */

import { ContentCalendarView } from "./content-calendar-view";
import { nextMonthOf, normalizeMonth } from "./calendar-month";
import { client as defaultClient } from "@/lib/contract-client.server";
import {
  buildPublishingCenterViewModelReal,
  type PublishingCenterDataClient,
} from "@/features/publishing-center/publishing-center-data";
import type {
  ContentCalendarEntryResource,
  PublishingCadenceResource,
  CadenceAttainmentResource,
} from "@creatoros/backend/modules/content-calendar";
import type { PlatformAccountResource } from "@creatoros/backend/modules/platform-account";

/**
 * Structural seam for the server reads. The route passes a session-scoped
 * `createServerClient(ctx)` so reads stay user-scoped. Includes the
 * publishing-side ops (projects → outputs → publications → revisions +
 * analytics) because the month grid renders publications 真数据。
 */
export type ContentCalendarReadClient = Pick<
  typeof defaultClient,
  | "listAccounts"
  | "listCalendar"
  | "getCadence"
  | "getCadenceAttainment"
  | "listProjects"
  | "listOutputs"
  | "listPublications"
  | "listPublicationRevisions"
  | "getPublicationAnalytics"
>;

// 注入的参考时刻(C-5 决定论 — 不用 wall-clock)。派生「当前月」缺省值与
// 过去/未来分界(空窗淡色只标过去格)。T-083b 全量时改为路由注入的真实 now。
const REFERENCE_INSTANT = "2026-07-03T00:00:00.000Z";

/** 单条已发布作品在月历格/抽屉里需要的最小投影(publications 真数据)。 */
export interface CalendarPublicationItem {
  readonly id: string;
  /** 归属日 key,"YYYY-MM-DD"(publishedAt 的 UTC 日切片,与发布中心同口径)。 */
  readonly dateKey: string;
  readonly title: string;
  /** 归属项目(跳稿面);行未携带项目时为 null → 链接回退项目列表。 */
  readonly projectId: string | null;
  readonly platformLabel: string;
  /** 表现字符串("N 播放" / "暂无数据"),T-082 views 口径照实透传,不造假。 */
  readonly views: string;
  /** 真封面 assetId(T-078 渲染链);null → 渐变占位。 */
  readonly coverAssetId: string | null;
}

export interface ContentCalendarViewModel {
  readonly accountId: string | null;
  readonly accounts: PlatformAccountResource[];
  /** 渲染的月份,"YYYY-MM"。 */
  readonly month: string;
  /** 参考「今天」日 key(C-5 注入),分界过去空窗淡色 vs 未来格。 */
  readonly referenceDateKey: string;
  /** 本月已发布作品(publications 真数据,已按月过滤)。 */
  readonly publications: CalendarPublicationItem[];
  /** 本月排期 entries(content_calendar_entries;现 0 行 → 诚实空)。 */
  readonly entries: ContentCalendarEntryResource[];
  readonly cadence: PublishingCadenceResource | null;
  readonly attainment: CadenceAttainmentResource | null;
  readonly window: { from: string; to: string };
}

export interface ContentCalendarPageProps {
  /** Override hook for tests; defaults to the server reads. */
  readonly viewModel?: ContentCalendarViewModel;
  /** 路由 `?month=YYYY-MM`;非法/缺省 → REFERENCE_INSTANT 所在月。 */
  readonly month?: string;
  /**
   * Session-scoped contract client for the production read path. The route
   * passes `createServerClient(session.ctx)`; defaults to the singleton seam so
   * SSR / direct render still resolves.
   */
  readonly client?: ContentCalendarReadClient;
}

export async function ContentCalendarPage({
  viewModel,
  month,
  client = defaultClient,
}: ContentCalendarPageProps) {
  const vm = viewModel ?? (await loadViewModel(client, month));
  return <ContentCalendarView viewModel={vm} />;
}

async function loadViewModel(
  client: ContentCalendarReadClient,
  monthParam: string | undefined,
): Promise<ContentCalendarViewModel> {
  const month = normalizeMonth(monthParam) ?? REFERENCE_INSTANT.slice(0, 7);
  const referenceDateKey = REFERENCE_INSTANT.slice(0, 10);
  // 月窗 [本月 1 号, 下月 1 号) — entries/attainment 都按这个窗读。
  const window = {
    from: `${month}-01T00:00:00.000Z`,
    to: `${nextMonthOf(month)}-01T00:00:00.000Z`,
  };

  const accounts = (await client.listAccounts({
    params: undefined,
    query: { page: 1, pageSize: 100 },
    body: undefined,
  })) as unknown as PlatformAccountResource[];

  const active = accounts.find((a) => a.status === "active") ?? accounts[0];
  if (!active) {
    return {
      accountId: null,
      accounts,
      month,
      referenceDateKey,
      publications: [],
      entries: [],
      cadence: null,
      attainment: null,
      window,
    };
  }

  // 过去格真相:publications(复用发布中心已有装配——revision 真标题/真封面 +
  // T-082 views 口径的表现字符串),再按月过滤到本月已发布行。
  // 读失败 → 装配器返回 error VM(publications:[]),日历诚实渲空,不抛不造假。
  const publishingVm = await buildPublishingCenterViewModelReal(
    client as unknown as PublishingCenterDataClient,
  );
  const publications: CalendarPublicationItem[] = publishingVm.publications
    .filter(
      (row) =>
        row.status === "published" && row.publishedAt.slice(0, 7) === month,
    )
    .map((row) => ({
      id: row.id,
      dateKey: row.publishedAt.slice(0, 10),
      title: row.contentTitle,
      projectId: row.projectId ?? null,
      platformLabel: row.platformLabel,
      views: row.views,
      coverAssetId: row.coverAssetId ?? null,
    }));

  const entries = (await client.listCalendar({
    params: { accountId: active.id },
    query: { from: window.from, to: window.to, page: 1, pageSize: 100 },
    body: undefined,
  })) as unknown as ContentCalendarEntryResource[];

  const cadence = (await client.getCadence({
    params: { accountId: active.id },
    query: undefined,
    body: undefined,
  })) as unknown as PublishingCadenceResource | null;

  const attainment = (await client.getCadenceAttainment({
    params: { accountId: active.id },
    query: { from: window.from, to: window.to },
    body: undefined,
  })) as unknown as CadenceAttainmentResource;

  return {
    accountId: active.id,
    accounts,
    month,
    referenceDateKey,
    publications,
    entries,
    cadence,
    attainment,
    window,
  };
}

export { REFERENCE_INSTANT };
