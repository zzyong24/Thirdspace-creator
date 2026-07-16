/**
 * 内容日历 / 发布节奏 route entrypoint (七步⑦ · §7.2).
 *
 * The (creator) layout supplies the shared AppShell (Sidebar + TopHeader) and the
 * global Header is configured for `/calendar` in `shell-router.tsx`. The page itself is
 * a Server Component that renders the content-calendar feature shell, which reads
 * `accounts.list` + `accounts.calendar.list` + `accounts.cadence.get` +
 * `accounts.cadence.attainment` (real SQL via the composite transport) for the
 * active account.
 *
 * Session-scoped read (lane center-pages): the route resolves the request's
 * session and constructs `createServerClient(session.ctx)` so the active account
 * + its calendar/cadence/attainment stay scoped to the logged-in user — a
 * brand-new empty account reads empty, not the user-zyongzhu seed. With no
 * session the singleton seam (the feature's own default client) renders so
 * SSR/tests never crash.
 *
 * Visual baseline: `/calendar` is "暂不纳入视觉门禁" until the stage-12 re-baseline (C-5).
 */
import { ContentCalendarPage } from "@/features/content-calendar/content-calendar-page";
import { createServerClient } from "@/lib/contract-client.server";
import { resolveSession } from "@/lib/session.server";
import { ZeroAccountGuidance } from "@/components/shell/zero-account-guidance";

export default async function CalendarRoutePage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  // 月份切换是静态跳转:`?month=YYYY-MM`(非法/缺省 → 参考月,feature 内校验)。
  const params = (await searchParams) ?? {};
  const month = typeof params.month === "string" ? params.month : undefined;
  const session = await resolveSession();
  if (!session) {
    return <ContentCalendarPage month={month} />;
  }

  // [T-353] 未选号(含 0 号)= 引导态(T-332 §4.2):本页 per-account 读会撞 S2 strict 门
  // (AccountRequiredError → 整页错误边界)。layout 的零账号守卫只在首次渲染判定(App Router
  // 客户端导航不重渲 layout),故页面自兜:ctx 无选中号 → 渲绑定引导,不发注定失败的读。
  if (!session.ctx.accountId) {
    return <ZeroAccountGuidance />;
  }
  return (
    <ContentCalendarPage
      month={month}
      client={createServerClient(session.ctx)}
      // [T-332 S4] 当前号来自 RSC ctx(S3 的 current-account cookie 解析),页面不再自选首号。
      currentAccountId={session.ctx.accountId ?? null}
    />
  );
}
