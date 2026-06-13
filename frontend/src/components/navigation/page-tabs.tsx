"use client";

/**
 * `PageTabs` is the standard horizontal tabbed navigation strip used by
 * Analytics, Planning, Script, Experience, Publishing workspace, Search,
 * Settings, and a handful of other pages.
 *
 * It is a client component because the underlying `@base-ui/react/tabs`
 * is interactive.
 *
 * The component is intentionally thin: it does NOT own page routing.
 * Page-level callers wire `id` to their own router (via Next.js Link or
 * search params). This component only manages the visual + a11y state.
 */

import * as React from "react";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

export interface PageTabDescriptor {
  readonly id: string;
  readonly label: string;
  readonly disabled?: boolean;
}

export interface PageTabsProps {
  readonly tabs: ReadonlyArray<PageTabDescriptor>;
  readonly value?: string;
  readonly defaultValue?: string;
  readonly onValueChange?: (value: string) => void;
  readonly ariaLabel?: string;
  readonly className?: string;
}

export function PageTabs({
  tabs,
  value,
  defaultValue,
  onValueChange,
  ariaLabel = "页内导航",
  className,
}: PageTabsProps) {
  return (
    <Tabs
      value={value}
      defaultValue={defaultValue ?? tabs[0]?.id}
      onValueChange={onValueChange}
      aria-label={ariaLabel}
      className={cn("w-full", className)}
    >
      <TabsList variant="line">
        {tabs.map((tab) => (
          <TabsTrigger
            key={tab.id}
            value={tab.id}
            disabled={tab.disabled}
            data-tab-id={tab.id}
          >
            {tab.label}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
