"use client";

/**
 * SidebarStorageCard — the 素材中心 左下角 storage 卡 (Sidebar `storage` variant).
 *
 * [T-115] 统一存储占用到单一真实来源:去掉原来硬编码的「12.4 / 50 GB · 固定 25% ·
 * 自动同步已开启」假数据,改为客户端挂载后拉真实 `settings.storage.get`
 * (`client.getStorage`)—— 与设置页 / 素材页 StorageUsageCard 同一真实源
 * (usedBytes / totalBytes = 真实磁盘容量)。
 *
 * 放到客户端 useEffect(而非经 server 层灌 props)是刻意的:整条 shell 链
 * (ShellRouter → AppShell → Sidebar)都是 Client Component,没有干净的 server
 * 注入点;且存储用量不是导航态,不必在每次路由切换时 server 重读。挂载后异步拉一次,
 * 读中显骨架,读失败**诚实降级**为「存储用量不可用」——绝不回退假值。
 */

import * as React from "react";

import { client } from "@/lib/contract-client";
import { Badge } from "@/components/ui/badge";

interface StorageSnapshot {
  readonly usedBytes: number;
  readonly totalBytes: number;
}

type LoadState =
  | { readonly kind: "loading" }
  | { readonly kind: "ready"; readonly data: StorageSnapshot }
  | { readonly kind: "error" };

// [T-360①] 自适应单位(带单位后缀):此前死绑 GB,几 MB 用量显示 0.0 被判统计 bug。
function gb(bytes: number): string {
  if (bytes >= 1_000_000_000) return (bytes / 1_000_000_000).toFixed(1) + " GB";
  if (bytes >= 1_000_000) return (bytes / 1_000_000).toFixed(1) + " MB";
  if (bytes > 0) return Math.max(1, Math.round(bytes / 1_000)) + " KB";
  return "0 MB";
}

export function SidebarStorageCard() {
  const [state, setState] = React.useState<LoadState>({ kind: "loading" });

  React.useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const s = (await client.getStorage({
          params: undefined,
          query: undefined,
          body: undefined,
        })) as { usedBytes?: unknown; totalBytes?: unknown };
        if (!alive) return;
        const usedBytes = typeof s.usedBytes === "number" ? s.usedBytes : NaN;
        const totalBytes = typeof s.totalBytes === "number" ? s.totalBytes : NaN;
        if (Number.isFinite(usedBytes) && Number.isFinite(totalBytes)) {
          setState({ kind: "ready", data: { usedBytes, totalBytes } });
        } else {
          // 读到但形状不对 → 诚实降级,不拼半真值。
          setState({ kind: "error" });
        }
      } catch {
        // transport race / 未登录 / 读失败 → 诚实降级为「不可用」,绝不回退假值。
        if (alive) setState({ kind: "error" });
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div
      data-slot="sidebar-contextual-card"
      data-variant="storage"
      data-storage-state={state.kind}
      className="flex flex-col gap-1 rounded-card border border-border bg-surface-subtle p-3 text-xs text-muted-foreground"
    >
      <div className="flex items-center justify-between text-foreground">
        <span className="font-medium">素材库存储</span>
        {state.kind === "ready" ? (
          <Badge variant="outline" className="text-[10px]">
            {/* 与设置页完全一致的口径:真实 已用 / 真实磁盘容量。totalBytes 未知(0)时
                只显已用,不摆假分母。 */}
            {state.data.totalBytes > 0
              ? `${gb(state.data.usedBytes)} / ${gb(state.data.totalBytes)}`
              : `${gb(state.data.usedBytes)}`}
          </Badge>
        ) : null}
      </div>
      {state.kind === "ready" ? (
        <StorageBar
          usedBytes={state.data.usedBytes}
          totalBytes={state.data.totalBytes}
        />
      ) : state.kind === "loading" ? (
        // 读中:占位骨架条(无数字,不假装有值)。
        <div
          data-slot="sidebar-storage-skeleton"
          aria-hidden="true"
          className="h-1.5 w-full animate-pulse rounded-full bg-border"
        />
      ) : (
        // 诚实降级:读失败不回退假值,直接说不可用。
        <p data-slot="sidebar-storage-unavailable">存储用量不可用</p>
      )}
      {state.kind === "ready" ? (
        // ASSET-17 同款处置:去掉「自动同步已开启」假文案(无同步机制支撑)。
        <p>个人本地素材库</p>
      ) : null}
    </div>
  );
}

function StorageBar({
  usedBytes,
  totalBytes,
}: {
  readonly usedBytes: number;
  readonly totalBytes: number;
}) {
  // totalBytes 未知(0)时以 used 自身为 max(条仍渲染,不除零),与设置页 StorageUsageCard 同款。
  const max = totalBytes > 0 ? totalBytes : usedBytes || 1;
  const pct = Math.min(100, Math.max(0, Math.round((usedBytes / max) * 100)));
  return (
    <div
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label="素材库存储使用率"
      className="h-1.5 w-full overflow-hidden rounded-full bg-border"
    >
      <div className="h-full bg-brand" style={{ width: `${pct}%` }} />
    </div>
  );
}
