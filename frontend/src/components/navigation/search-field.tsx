"use client";

/**
 * `SearchField` (SPEC §7, 导航与筛选) is the shared search input — an
 * accessible `role="search"` form with a leading icon built on the
 * `ui/input` primitive. It is reused by the global TopHeader and any page
 * that exposes a search box. Routing/submit handling is left to callers;
 * by default it prevents the native submit so it behaves as a controlled
 * filter surface.
 */

import * as React from "react";

import { Input } from "@/components/ui/input";
import { creatorIcons } from "@/lib/icons";
import { cn } from "@/lib/utils";

const SearchIcon = creatorIcons.search;

export interface SearchFieldProps {
  readonly id: string;
  readonly placeholder: string;
  readonly value?: string;
  readonly label?: string;
  readonly dataSlot?: string;
  readonly className?: string;
  readonly inputClassName?: string;
  readonly onSubmit?: (event: React.FormEvent<HTMLFormElement>) => void;
}

export function SearchField({
  id,
  placeholder,
  value,
  label = "搜索",
  dataSlot = "search-field",
  className,
  inputClassName,
  onSubmit,
}: SearchFieldProps) {
  return (
    <form
      role="search"
      data-slot={dataSlot}
      className={cn("flex min-w-0 flex-1 items-center gap-2", className)}
      onSubmit={(event) => {
        if (onSubmit) {
          onSubmit(event);
        } else {
          event.preventDefault();
        }
      }}
    >
      <label className="sr-only" htmlFor={id}>
        {label}
      </label>
      <div className="relative flex flex-1 items-center">
        <SearchIcon
          className="pointer-events-none absolute left-2.5 size-4 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          id={id}
          type="search"
          placeholder={placeholder}
          defaultValue={value}
          autoComplete="off"
          className={cn("h-9 w-full pl-8", inputClassName)}
        />
      </div>
    </form>
  );
}
