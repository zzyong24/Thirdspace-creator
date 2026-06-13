/**
 * Settings route entrypoint.
 *
 * The (creator) layout supplies the shared AppShell (Sidebar + TopHeader)
 * and the global Header is configured for `/settings` with title
 * "设置", description "账号、偏好与系统" and the approved `assistant`
 * contextual-card variant in `shell-router.tsx` (D-003, page-specs §17).
 * The page itself is a Server Component (page-specs §17) and just
 * provides the page slot.
 */
import { SettingsPage } from "@/features/settings/settings-page";

export default function SettingsRoutePage() {
  return <SettingsPage />;
}
