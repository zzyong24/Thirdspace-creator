/**
 * (creator) segment layout.
 *
 * The (creator) route group is the single shell that wraps every page in
 * CreatorOS. It owns:
 *  - the shared `AppShell`, routed by `ShellRouter` based on the current
 *    pathname,
 *  - the `@modal` parallel slot for intercepting-route overlays.
 *
 * Pages remain Server Components by default. The router runs in a small
 * Client island so `usePathname()` can resolve the active nav, header
 * mode and contextual-card variant.
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
      {/* @modal is rendered at the root level so overlays appear above the
          page chrome. It contains intercepting routes for `/projects/new`
          and the global AI Copilot trigger (added in Task 8). */}
      {modal}
    </>
  );
}
