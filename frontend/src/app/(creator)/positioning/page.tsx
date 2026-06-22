/**
 * 定位中心 route entrypoint (七步①② · SPEC §3.4).
 *
 * The (creator) layout supplies the shared AppShell (Sidebar + TopHeader) and the
 * global Header is configured for `/positioning` in `shell-router.tsx`. The page
 * itself is a Server Component that renders the positioning feature shell, which
 * reads pages.positioning.get (real SQL via the composite transport).
 */
import { PositioningCenterPage } from "@/features/positioning/positioning-center";

export default function PositioningRoutePage() {
  return <PositioningCenterPage />;
}
