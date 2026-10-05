"use client";

/**
 * `AccountManagerView` — 抖音、小红书、快手账号管理页。
 *
 * [T-136§D-bind⑤ · 用户 2026-07-06] 删掉旧平台筛选 tab。
 * 整页 = 一个先选平台的绑定入口 + 账号列表(每行真实昵称 + 平台 ID +
 * 隐藏)。默认过滤已隐藏(archived)的号,只显活跃号(隐藏即从列表消失,可逆)。[T-201c]
 *
 * Determinism (C-5): no Date.now / Math.random / fetch in render.
 */

import * as React from "react";
import Link from "next/link";

import { SectionCard } from "@/components/project/section-card";
import type { AccountManagerViewModel } from "./account-manager-page";
import { PlatformCapabilityOverview } from "./platform-capability-overview";
import { AccountRow } from "./account-manager-interactive-region";
import { BindAccountDialog } from "./bind-account-dialog";

export function AccountManagerView({
  viewModel,
}: {
  readonly viewModel: AccountManagerViewModel;
}) {
  const { accounts, capabilities = [], capabilitiesError = false, selectedAccountId } = viewModel;
  // [T-201c] 只显活跃号:隐藏(archive)后从列表消失。已隐藏的不显(可逆,但列表不摆冗余)。
  const visible = accounts.filter((a) => a.status !== "archived");

  return (
    <div
      data-slot="account-manager"
      data-testid="account-manager"
      className="flex flex-col gap-section-gap"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h2 className="text-lg font-semibold">创作账号</h2><p className="mt-1 text-sm text-muted-foreground">绑定后查看账号作品与数据，每个账号的内容独立保存。</p></div>
        <BindAccountDialog />
      </div>

      <SectionCard title="已绑定账号">
        <div className="flex flex-col gap-3 py-2">
          {visible.some((account) => account.id === selectedAccountId &&
            (account.platform === "xiaohongshu" || account.platform === "kuaishou")) ? (
            <Link href="/accounts/works" className="self-start text-sm text-primary underline-offset-2 hover:underline">
              查看当前账号作品与数据
            </Link>
          ) : null}
          <ul data-testid="account-list" className="flex flex-col gap-2">
            {visible.length === 0 ? (
              <li
                data-testid="account-empty-state"
                className="text-sm text-muted-foreground"
              >
                还没有绑定账号。点击“绑定账号”，选择平台后扫码。
              </li>
            ) : (
              // [T-136§D-bind⑥][T-201c] 只剩一个 active 号 → 传 isOnlyAccount 禁用其「隐藏」(末号保护)。
              visible.map((a) => (
                <AccountRow
                  key={a.id}
                  account={a}
                  selectedAccountId={selectedAccountId}
                  isOnlyAccount={visible.length === 1}
                />
              ))
            )}
          </ul>
        </div>
      </SectionCard>
      <details className="rounded-xl border border-border p-4">
        <summary className="cursor-pointer text-sm font-medium">查看平台接入状态</summary>
        <div className="mt-4"><PlatformCapabilityOverview capabilities={capabilities} accounts={visible} readError={capabilitiesError} /></div>
      </details>
    </div>
  );
}
