"use client";

import * as React from "react";
import { usePathname } from "next/navigation";

import { isZeroAccountAllowedPath, ZeroAccountGuidance } from "./zero-account-guidance";

/**
 * The creator layout persists across client navigation. Read the active path here so
 * moving from a guarded page to /accounts immediately reveals the new page content.
 */
export function ZeroAccountRouteGuard({ hasActiveAccount, children }: {
  hasActiveAccount: boolean;
  children: React.ReactNode;
}) {
  const pathname = usePathname() ?? "/";
  return hasActiveAccount || isZeroAccountAllowedPath(pathname) ? children : <ZeroAccountGuidance />;
}
