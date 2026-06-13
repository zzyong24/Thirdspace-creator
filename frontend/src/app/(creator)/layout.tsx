/**
 * (creator) segment layout.
 *
 * The (creator) route group is the single shell that wraps every page in
 * CreatorOS. It owns:
 *  - the shared `AppShell`, routed by `ShellRouter` based on the current
 *    pathname,
 *  - the `@modal` parallel slot for intercepting-route overlays,
 *  - the global `OverlayController` (mounted inside `OverlayHost`) that
 *    watches the `?copilot=open` search parameter and renders the AI
 *    Copilot panel above the AppShell.
 *
 * Pages remain Server Components by default. The router runs in a small
 * Client island so `usePathname()` and `useSearchParams()` can resolve
 * the active nav, header mode, contextual-card variant and overlay
 * state.
 */

import * as React from "react";

import { ShellRouter } from "./shell-router";

interface CreatorLayoutProps {
  readonly children: React.ReactNode;
  readonly modal: React.ReactNode;
}

export default function CreatorLayout({ children, modal }: CreatorLayoutProps) {
  return (
    <>
      <ShellRouter>{children}</ShellRouter>
      {/* The @modal parallel slot renders intercepting-route overlays
          (currently `/projects/new`). It is rendered above the AppShell
          so the dialog appears above the page chrome. */}
      {modal}
    </>
  );
}