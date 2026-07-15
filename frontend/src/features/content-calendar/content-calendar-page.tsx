/**
 * 内容日历 page (T-083a 样板 · SPEC 2026-07-03-content-calendar-redesign §1 方案 C)。
 *
 * 核心翻转:**过去格直接渲 publications 真数据**(经 publishing-center 的
 * `buildPublishingCenterViewModelReal` 复用 T-082 views 口径),未来格才读
 * `content_calendar_entries`(现 0 行 → 诚实空)。三张 SectionCard 列表被替换为
 * 月历格视图(`ContentCalendarView`),日详情抽屉本片只读。
 *
 * Server-component shell with a `viewModel?` test seam。月份来自路由
 * `?month=YYYY-MM`(静态跳转),缺省取「今天」所在月。
 *
 * [FE-H04] 「今天」= 真实系统 now(经可注入的 `now` clock,默认 `new Date()`)。
 * 参考日 `referenceDateKey` 取本地日历日(见 `localDateKey`),分界过去/今天/未来。
 * 时钟只在 server 组件加载时读一次,派生出的 `referenceDateKey` / `month` 作为**纯 props**
 * 喂给下游 view;view/selectors 仍是确定性的(不含 Date.now / Math.random / fetch),
 * 满足 C-5——时钟注入被收敛在这一处边界。
 */

import { ContentCalendarView } from "./content-calendar-view";
import {
  localDateKey,
  localMonthKey,
  nextMonthOf,
  normalizeMonth,
} from "./calendar-month";
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

/** 排期表单的项目下拉最小投影(id + 标题;可选绑到某项目/产出)。 */
export interface CalendarProjectOption {
  readonly id: string;
  readonly title: string;
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
  /** 用户的项目列表(排期表单「选项目」用;读失败 → 诚实空)。 */
  readonly projects: CalendarProjectOption[];
  readonly cadence: PublishingCadenceResource | null;
  readonly attainment: CadenceAttainmentResource | null;
  readonly window: { from: string; to: string };
}

export interface ContentCalendarPageProps {
  /** Override hook for tests; defaults to the server reads. */
  readonly viewModel?: ContentCalendarViewModel;
  /** 路由 `?month=YYYY-MM`;非法/缺省 → 「今天」(clock)所在月。 */
  readonly month?: string;
  /**
   * Session-scoped contract client for the production read path. The route
   * passes `createServerClient(session.ctx)`; defaults to the singleton seam so
   * SSR / direct render still resolves.
   */
  readonly client?: ContentCalendarReadClient;
  /**
   * [FE-H04] 可注入的「今天」时钟(默认真实系统 now)。生产不传 → 每次请求取当天;
   * 测试可传固定 `Date` 断言分界行为(过去/今天/未来)不再写死某日。
   */
  readonly now?: Date;
  /**
   * [T-332 S4] 当前选中的抖音号(route 传 `session.ctx.accountId`;S3 已把当前号
   * cookie 解析进 RSC ctx)。以前这里自选「第一个 active 号」——账号全域隔离后,
   * 自选号 ≠ ctx 当前号会撞 S2 的号一致性门(OwnershipError 404)。null/缺省 =
   * 未选号 → 诚实空态引导,绝不代用户猜号。
   */
  readonly currentAccountId?: string | null;
}

export async function ContentCalendarPage({
  viewModel,
  month,
  client = defaultClient,
  now,
  currentAccountId = null,
}: ContentCalendarPageProps) {
  const vm =
    viewModel ??
    (await loadViewModel(client, month, now ?? new Date(), currentAccountId));
  return <ContentCalendarView viewModel={vm} />;
}

async function loadViewModel(
  client: ContentCalendarReadClient,
  monthParam: string | undefined,
  now: Date,
  currentAccountId: string | null,
): Promise<ContentCalendarViewModel> {
  // [FE-H04] 参考日/缺省月都从真实 now 派生(本地日历日/月),不再写死 2026-07-03。
  const referenceDateKey = localDateKey(now);
  const month = normalizeMonth(monthParam) ?? localMonthKey(now);
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

  // [T-332 S4] 只认 ctx 当前号(切号 = 切工作区,SPEC §6.1):当前号必须在本 user 的
  // active 号里;未选号 / 号已删 / 已归档 → 诚实空态(view 按 accounts 区分「没号要绑」
  // vs「有号未选」),不再自选第一个 active(那会与 ctx 撞 S2 的号一致性门 404)。
  const active = currentAccountId
    ? (accounts.find(
        (a) => a.id === currentAccountId && a.status === "active",
      ) ?? null)
    : null;
  if (!active) {
    return {
      accountId: null,
      accounts,
      month,
      referenceDateKey,
      publications: [],
      entries: [],
      projects: [],
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

  // 排期表单「选项目」的候选:读用户项目列表(id + 标题)。读失败 → 诚实空,
  // 表单退化为「只填计划标题」,不阻断排期。
  let projects: CalendarProjectOption[] = [];
  try {
    const rows = (await client.listProjects({
      params: undefined,
      query: { page: 1, pageSize: 100 },
      body: undefined,
    })) as unknown as Array<{ id: string; title: string }>;
    projects = rows.map((p) => ({ id: p.id, title: p.title }));
  } catch {
    projects = [];
  }

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
    projects,
    cadence,
    attainment,
    window,
  };
}
