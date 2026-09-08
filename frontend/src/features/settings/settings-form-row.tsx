"use client";

import * as React from "react";

interface SettingsFormRowProps {
  readonly label: string;
  readonly controlId: string;
  readonly help?: string;
  readonly children: React.ReactNode;
}

export function SettingsFormRow({
  label,
  controlId,
  help,
  children,
}: SettingsFormRowProps) {
  return (
    <div
      data-slot="settings-form-row"
      data-control-id={controlId}
      className="grid grid-cols-1 items-start gap-2 border-b border-border/60 pb-3 last:border-b-0 last:pb-0 md:grid-cols-[160px_minmax(0,1fr)]"
    >
      <div data-slot="form-row-label" className="flex flex-col gap-0.5">
        <label
          htmlFor={controlId}
          className="text-sm font-medium text-foreground"
        >
          {label}
        </label>
        {help ? (
          <span className="text-xs text-muted-foreground">{help}</span>
        ) : null}
      </div>
      <div
        data-slot="form-row-control"
        className="flex min-w-0 items-center justify-start"
      >
        {children}
      </div>
    </div>
  );
}
