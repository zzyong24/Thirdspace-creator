"use client";

/**
 * `AccountManagerView` — 账号管理页渲染(抖音-only,极简版)。
 *
 * [T-136§D-bind⑤ · 用户 2026-07-06] 删掉平台筛选 tab(全部/抖音)—— 只支持抖音,筛选无意义。
 * 整页 = 「扫码绑定新抖音号」主操作(CreateAccountForm)+ 账号列表(每行真实昵称 + 抖音号 ID +
 * 隐藏)。默认过滤已隐藏(archived)的号,只显活跃号(隐藏即从列表消失,可逆)。[T-201c]
 *
 * Determinism (C-5): no Date.now / Math.random / fetch in render.
 */

import * as React from "react";

import { SectionCard } from "@/components/project/section-card";
import type { AccountManagerViewModel } from "./account-manager-page";
import {
  CreateAccountForm,
  AccountRow,
} from "./account-manager-interactive-region";

export function AccountManagerView({
  viewModel,
}: {
  readonly viewModel: AccountManagerViewModel;
}) {
  const { accounts } = viewModel;
  // [T-201c] 只显活跃号:隐藏(archive)后从列表消失。已隐藏的不显(可逆,但列表不摆冗余)。
  const visible = accounts.filter((a) => a.status !== "archived");

  return (
    <div
      data-slot="account-manager"
      data-testid="account-manager"
      className="flex flex-col gap-section-gap"
    >
      <SectionCard title="绑定抖音号">
        <div className="py-2">
          <CreateAccountForm />
        </div>
      </SectionCard>

      <SectionCard title="我的抖音号">
        <div className="flex flex-col gap-3 py-2">
          <ul data-testid="account-list" className="flex flex-col gap-2">
            {visible.length === 0 ? (
              <li
                data-testid="account-empty-state"
                className="text-sm text-muted-foreground"
              >
                还没有绑定抖音号。点上方「扫码绑定新抖音号」即可。
              </li>
            ) : (
              // [T-136§D-bind⑥][T-201c] 只剩一个 active 号 → 传 isOnlyAccount 禁用其「隐藏」(末号保护)。
              visible.map((a) => (
                <AccountRow
                  key={a.id}
                  account={a}
                  isOnlyAccount={visible.length === 1}
                />
              ))
            )}
          </ul>
        </div>
      </SectionCard>
    </div>
  );
}
