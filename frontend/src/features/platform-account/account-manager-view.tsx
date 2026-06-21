"use client";

/**
 * `AccountManagerView` — the 账号管理 render + the client-local platform filter tabs
 * (七步⑤ · §7.1). Split out as a client component so the filter is wired-local (NO
 * network / NO mutation — a pure filter over the hydrated rows). The mutating controls
 * are the islands from `account-manager-interactive-region.tsx`.
 *
 * Determinism (C-5): the filter is controlled local state seeded from a fixed default;
 * no Date.now / Math.random / fetch in render.
 */

import * as React from "react";

import { SectionCard } from "@/components/project/section-card";
import { Button } from "@/components/ui/button";
import type { AccountManagerViewModel } from "./account-manager-page";
import {
  CreateAccountForm,
  AccountRow,
  PLATFORMS,
  PLATFORM_LABELS,
} from "./account-manager-interactive-region";

type Filter = "all" | (typeof PLATFORMS)[number];

export function AccountManagerView({
  viewModel,
}: {
  readonly viewModel: AccountManagerViewModel;
}) {
  const { accounts } = viewModel;
  const [filter, setFilter] = React.useState<Filter>("all");

  const visible =
    filter === "all"
      ? accounts
      : accounts.filter((a) => a.platform === filter);

  return (
    <div
      data-slot="account-manager"
      data-testid="account-manager"
      className="flex flex-col gap-section-gap"
    >
      <SectionCard title="新增矩阵号">
        <div className="py-2">
          <CreateAccountForm />
        </div>
      </SectionCard>

      <SectionCard title="账号列表">
        <div className="flex flex-col gap-3 py-2">
          <div
            data-testid="account-platform-filter"
            className="flex flex-wrap items-center gap-1.5"
          >
            <Button
              type="button"
              size="sm"
              variant={filter === "all" ? "secondary" : "ghost"}
              data-active={filter === "all"}
              onClick={() => setFilter("all")}
            >
              全部
            </Button>
            {PLATFORMS.map((p) => (
              <Button
                key={p}
                type="button"
                size="sm"
                variant={filter === p ? "secondary" : "ghost"}
                data-active={filter === p}
                data-platform={p}
                onClick={() => setFilter(p)}
              >
                {PLATFORM_LABELS[p] ?? p}
              </Button>
            ))}
          </div>

          <ul data-testid="account-list" className="flex flex-col gap-2">
            {visible.length === 0 ? (
              <li
                data-testid="account-empty-state"
                className="text-sm text-muted-foreground"
              >
                还没有账号。新增一个矩阵号，让每条发布都归到真实账号。
              </li>
            ) : (
              visible.map((a) => <AccountRow key={a.id} account={a} />)
            )}
          </ul>
        </div>
      </SectionCard>
    </div>
  );
}
