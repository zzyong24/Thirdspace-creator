/**
 * 内容日历 / 发布节奏 route entrypoint (七步⑦ · §7.2).
 *
 * The (creator) layout supplies the shared AppShell (Sidebar + TopHeader) and the
 * global Header is configured for `/calendar` in `shell-router.tsx`. The page itself is
 * a Server Component that renders the content-calendar feature shell, which reads
 * `accounts.calendar.list` + `accounts.cadence.get` + `accounts.cadence.attainment`
 * (real SQL via the composite transport) for the active account.
 *
 * Visual baseline: `/calendar` is "暂不纳入视觉门禁" until the stage-12 re-baseline (C-5).
 */
import { ContentCalendarPage } from "@/features/content-calendar/content-calendar-page";

export default function CalendarRoutePage() {
  return <ContentCalendarPage />;
}
