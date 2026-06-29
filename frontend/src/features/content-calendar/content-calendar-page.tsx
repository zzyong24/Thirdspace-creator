/**
 * 内容日历 / 发布节奏 page (七步⑦ · §7.2) — the account-scoped calendar + cadence surface
 * that answers §9 验收 #4「我这周该发什么？哪个账号断更了？」from real, user-scoped data.
 *
 * Server-component shell with a `viewModel?` test seam (mirrors platform-account/
 * monetization). The default render picks the first owned PlatformAccount (`accounts.list`)
 * and reads its calendar window (`accounts.calendar.list`), cadence (`accounts.cadence.get`),
 * and attainment (`accounts.cadence.attainment`) — all REAL SQL via the composite transport.
 * The mutating controls (新增计划 / 改期 / 标记已发布 / 删除 / 发布节奏) live in the client
 * island `content-calendar-interactive-region.tsx`, calling the mapped contract op then
 * `router.refresh()`.
 *
 * Determinism (C-5): the "this week" window is derived from an injected `referenceInstant`
 * (a fixed constant for the seed page) — NEVER wall-clock. No Date.now / Math.random /
 * fetch in render or selectors. `/calendar` is "暂不纳入视觉门禁" until the stage-12
 * re-baseline.
 */

import { ContentCalendarView } from "./content-calendar-view";
import { client as defaultClient } from "@/lib/contract-client.server";
import type {
  ContentCalendarEntryResource,
  PublishingCadenceResource,
  CadenceAttainmentResource,
} from "@creatoros/backend/modules/content-calendar";
import type { PlatformAccountResource } from "@creatoros/backend/modules/platform-account";

/**
 * Structural seam for the server reads. The route passes a session-scoped
 * `createServerClient(ctx)` so accounts/calendar/cadence/attainment stay
 * user-scoped (a brand-new empty account reads empty, not the user-zyongzhu
 * seed); the default keeps the singleton (canonical ctx) as the SSR/test
 * fallback seam.
 */
export type ContentCalendarReadClient = Pick<
  typeof defaultClient,
  "listAccounts" | "listCalendar" | "getCadence" | "getCadenceAttainment"
>;

// A deterministic 4-week reference window anchored on a fixed instant (C-5 — never
// wall-clock). The seed/page reads this window so the render is reproducible.
const REFERENCE_INSTANT = "2026-07-20T00:00:00.000Z";
const WINDOW_FROM = "2026-06-22T00:00:00.000Z";
const WINDOW_TO = "2026-07-20T00:00:00.000Z";

export interface ContentCalendarViewModel {
  readonly accountId: string | null;
  readonly accounts: PlatformAccountResource[];
  readonly entries: ContentCalendarEntryResource[];
  readonly cadence: PublishingCadenceResource | null;
  readonly attainment: CadenceAttainmentResource | null;
  readonly window: { from: string; to: string };
}

export interface ContentCalendarPageProps {
  /** Override hook for tests; defaults to the server reads. */
  readonly viewModel?: ContentCalendarViewModel;
  /**
   * Session-scoped contract client for the production read path. The route
   * passes `createServerClient(session.ctx)`; defaults to the singleton seam so
   * SSR / direct render still resolves.
   */
  readonly client?: ContentCalendarReadClient;
}

export async function ContentCalendarPage({
  viewModel,
  client = defaultClient,
}: ContentCalendarPageProps) {
  const vm = viewModel ?? (await loadViewModel(client));
  return <ContentCalendarView viewModel={vm} />;
}

async function loadViewModel(
  client: ContentCalendarReadClient,
): Promise<ContentCalendarViewModel> {
  const accounts = (await client.listAccounts({
    params: undefined,
    query: { page: 1, pageSize: 100 },
    body: undefined,
  })) as unknown as PlatformAccountResource[];

  const window = { from: WINDOW_FROM, to: WINDOW_TO };
  const active = accounts.find((a) => a.status === "active") ?? accounts[0];
  if (!active) {
    return {
      accountId: null,
      accounts,
      entries: [],
      cadence: null,
      attainment: null,
      window,
    };
  }

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
    entries,
    cadence,
    attainment,
    window,
  };
}

export { REFERENCE_INSTANT };
