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

export default async function CalendarRoutePage() {
  const session = await resolveSession();
  if (!session) {
    return <ContentCalendarPage />;
  }
  return <ContentCalendarPage client={createServerClient(session.ctx)} />;
}
