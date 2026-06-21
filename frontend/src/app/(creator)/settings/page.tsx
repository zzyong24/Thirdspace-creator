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
import { resolveSession } from "@/lib/session.server";

export default async function SettingsRoutePage() {
  // The (creator) layout already guards the session, so a resolved
  // session is expected here; if absent (race / direct render) the page
  // falls back to the fixture-derived account (Module 00, Task 12).
  // Binds the account card's name / email / timezone / locale to the
  // REAL logged-in identity (`userResource` — what `settings.get` will
  // serve in Wave 1; in Wave 0 it comes from `identity.getCurrentUser`).
  const session = await resolveSession();
  const identity = session
    ? {
        displayName: session.user.displayName,
        email: session.user.email,
        timezone: session.user.timezone,
        locale: session.user.locale,
      }
    : undefined;
  return <SettingsPage identity={identity} />;
}
