/**
 * (creator) segment layout — the single shell wrapping every authenticated
 * CreatorOS page, and (Module 00, Task 11) the SESSION GUARD.
 *
 * Foundation §2 names this layout the place where the session cookie becomes a
 * `RequestContext`:
 *  - no / invalid session cookie → `redirect("/login?from=<pathname>")`, so an
 *    unauthenticated visitor lands on the login page and returns afterwards,
 *  - a valid cookie → derive `ctx`, render the children, and bind the Shell
 *    user profile card to the REAL identity (`displayName` / `email`) — the
 *    `userResource` shape `settings.get` will eventually serve (Settings module,
 *    Wave 1). In Wave 0 the read comes from `identity.getCurrentUser(ctx)`,
 *    which returns the same DTO shape, so the card stops importing the static
 *    fixture and renders the logged-in user.
 *
 * It owns:
 *  - the shared `AppShell`, routed by `ShellRouter` based on the current
 *    pathname,
 *  - the `@modal` parallel slot for intercepting-route overlays,
 *  - the global `OverlayController` (inside the ShellRouter island).
 *
 * Pages remain Server Components by default. The router runs in a small Client
 * island so `usePathname()` / `useSearchParams()` resolve the active nav,
 * header mode, contextual-card variant and overlay state. The user card props
 * are derived here (server) and passed down, so no auth state leaks into the
 * client island beyond the display identity.
 */

import * as React from "react";
import { redirect } from "next/navigation";

import { ShellRouter, type ShellUser } from "./shell-router";
import { resolveSession, currentPathname } from "@/lib/session.server";

interface CreatorLayoutProps {
  readonly children: React.ReactNode;
  readonly modal: React.ReactNode;
}

function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 1).toUpperCase();
  return `${parts[0]!.charAt(0)}${parts[parts.length - 1]!.charAt(0)}`.toUpperCase();
}

export default async function CreatorLayout({
  children,
  modal,
}: CreatorLayoutProps) {
  const session = await resolveSession();
  if (!session) {
    const pathname = await currentPathname();
    redirect(`/login?from=${encodeURIComponent(pathname)}`);
  }

  // Real identity for the Shell user card (Shell §4 row, Module = Identity).
  // The brand mark + unread dot stay intentionally inert (decorative); only the
  // user profile card is lifted to a real read. `planLabel` is a fixed display
  // string — no billing/plan entity exists in Wave 0.
  const user: ShellUser = {
    displayName: session.user.displayName,
    email: session.user.email,
    planLabel: "个人版",
    initials: initialsFromName(session.user.displayName),
  };

  return (
    <>
      <ShellRouter user={user}>{children}</ShellRouter>
      {/* The @modal parallel slot renders intercepting-route overlays
          (currently `/projects/new`). It is rendered above the AppShell
          so the dialog appears above the page chrome. */}
      {modal}
    </>
  );
}
