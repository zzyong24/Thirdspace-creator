/**
 * 变现 / 漏斗中心 route entrypoint (七步⑦ · SPEC §4.7).
 *
 * The (creator) layout supplies the shared AppShell (Sidebar + TopHeader) and the
 * global Header is configured for `/monetization` in `shell-router.tsx`. The page
 * itself is a Server Component that renders the monetization feature shell, which
 * reads products.list + monetization.funnel.get + leads.list (real SQL via the
 * composite transport).
 */
import { MonetizationCenterPage } from "@/features/monetization/monetization-center-page";

export default function MonetizationRoutePage() {
  return <MonetizationCenterPage />;
}
