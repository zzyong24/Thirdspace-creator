/**
 * `SectionCard` is the standard wrapper used by every page section in
 * CreatorOS. It is a thin composition of the shadcn `Card` primitive
 * with a title, optional description, and an arbitrary body slot.
 *
 * It MUST remain a server component: it has no client interactivity.
 *
 * Per `specs/shared-components.md` this component is used by almost every
 * page section, so it is approved for the shared inventory.
 */

import * as React from "react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

export interface SectionCardProps {
  readonly title: string;
  readonly description?: string;
  readonly children: React.ReactNode;
  readonly action?: React.ReactNode;
  readonly className?: string;
  readonly contentClassName?: string;
}

export function SectionCard({
  title,
  description,
  children,
  action,
  className,
  contentClassName,
}: SectionCardProps) {
  const labelledBy = `section-card-${slugify(title)}`;
  return (
    <Card
      role="region"
      aria-labelledby={labelledBy}
      data-slot="section-card"
      className={cn("gap-(--card-gap)", className)}
    >
      <CardHeader className="flex flex-row items-start justify-between gap-(--card-gap)">
        <div className="flex min-w-0 flex-col gap-0.5">
          <CardTitle id={labelledBy} className="text-[15px] font-semibold">
            {title}
          </CardTitle>
          {description ? (
            <CardDescription>{description}</CardDescription>
          ) : null}
        </div>
        {action ? (
          <div data-slot="section-card-action" className="shrink-0">
            {action}
          </div>
        ) : null}
      </CardHeader>
      <CardContent className={cn("text-sm", contentClassName)}>
        {children}
      </CardContent>
    </Card>
  );
}

function slugify(value: string): string {
  return value
    .trim()
    .replace(/[\s/]+/g, "-")
    .replace(/[^\p{L}\p{N}\-_]/gu, "")
    .toLowerCase();
}
