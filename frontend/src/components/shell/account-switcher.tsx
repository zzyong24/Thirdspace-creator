"use client";

/**
 * AccountSwitcher — [T-136 切片 a] sidebar 用户区的抖音号切换器(SPEC §E)。
 *
 * 一个本机 user 下可挂多个抖音号(多独立人设);此下拉是「当前号」的唯一选择入口:
 *  - 挂载后拉 `client.listAccounts`(只抖音号),诚实降级(读失败/未登录 → 不可用条)。
 *  - 归一「当前号」走纯逻辑 `resolveCurrentAccount`(§E ②③:无 current 自动选第一个 active、
 *    stored 失效自动清除回落),写 `localStorage['creatoros:current-account']`。
 *  - 切号 → 写 localStorage + `router.refresh()`;后续 client 请求由 http-transport 自动带上
 *    新的 x-account-id header,server 验属主后按号过滤(切片 b 起消费)。
 *
 * [T-332 S4] 切号 = 切整个工作区(SPEC §6.1):
 *  - 默认**直切**(保持现状机制,不做整页 hard reload);写 localStorage 的同时镜像进
 *    服务端可读 cookie(S3 的 syncCurrentAccountCookie),让紧随其后的 router.refresh()
 *    首个 RSC 渲染就是新号,不差一拍。
 *  - 切号后广播 `accountsChanged`:router.refresh() 覆盖 RSC/props 链,事件覆盖各 island
 *    组件内 state 持有的旧号实体(automations latestRuns 等)——统一失效重取。
 *  - **仅当**有进行中的前台操作(foreground-activity 注册表:AI 生成中/表单提交中)时
 *    弹确认「有进行中的操作,切号会离开当前页面」;后台任务归属由创建时 stamp 决定,
 *    不受切号影响,不弹。
 *  - stored 失效自愈(自动回落选号)后补一次 router.refresh():RSC 首屏可能已按旧号/
 *    未选号渲染,归一结果要立刻反映到整个工作区。
 *  - 「+ 绑定新抖音号」深链既有账号管理页 `/accounts`(扫码 / 新增矩阵号)。
 *  - 0 个号 → 显绑定引导(不崩;接 T-131 引导 / 账号管理)。
 *
 * 放客户端 useEffect(而非 server 灌 props)与 SidebarStorageCard 同理:整条 shell 链都是
 * Client Component,当前号也不是导航态,挂载后异步拉一次即可。localStorage 读写用 try/catch
 * 降级(隐私模式 / SSR 安全),复用 sidebar collapse 同款范式。
 */

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronsUpDown, Plus, Check, AtSign } from "lucide-react";

import { client } from "@/lib/contract-client";
import {
  CURRENT_ACCOUNT_KEY,
  syncCurrentAccountCookie,
} from "@/lib/http-transport";
import {
  useAccountsChanged,
  notifyAccountsChanged,
} from "@/lib/account-events";
import {
  hasForegroundActivity,
  listForegroundActivities,
} from "@/lib/foreground-activity";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  resolveCurrentAccount,
  type SwitcherAccount,
} from "./account-switcher-logic";

type LoadState =
  | { readonly kind: "loading" }
  | { readonly kind: "ready"; readonly accounts: readonly SwitcherAccount[] }
  | { readonly kind: "error" };

function readStoredAccountId(): string | null {
  try {
    if (typeof window === "undefined") return null;
    return window.localStorage.getItem(CURRENT_ACCOUNT_KEY);
  } catch {
    return null;
  }
}

function writeStoredAccountId(id: string | null): void {
  try {
    if (typeof window === "undefined") return;
    if (id) window.localStorage.setItem(CURRENT_ACCOUNT_KEY, id);
    else window.localStorage.removeItem(CURRENT_ACCOUNT_KEY);
  } catch {
    /* 隐私模式 / storage 禁用 → 本次会话内切号仍生效,只是不持久 */
  }
  // [T-332 S4] 同步镜像进服务端可读 cookie(在 router.refresh() 之前),否则切号后的
  // 首个 RSC 渲染仍读旧 cookie,差一拍(S3 的 http-transport 注释点名由切换器负责)。
  syncCurrentAccountCookie(id);
}

export function AccountSwitcher({ collapsed }: { collapsed: boolean }) {
  const router = useRouter();
  // [T-332 S4] router 经 ref 消费:useRouter 在部分测试 harness(以及理论上的 provider
  // 重建)下每渲染返回新对象,直接进 useCallback/useEffect 依赖会造成「load 变 → effect
  // 重跑 → setState → 再渲染」死循环。ref 每渲染同步、回调恒拿最新,load 保持稳定标识。
  const routerRef = React.useRef(router);
  routerRef.current = router;
  const [state, setState] = React.useState<LoadState>({ kind: "loading" });
  const [currentId, setCurrentId] = React.useState<string | null>(null);

  const load = React.useCallback(() => {
    let alive = true;
    void (async () => {
      try {
        // 只列抖音号(本期只支持抖音;platform=douyin)。listAccounts 是 user 域内读,
        // 不需要当前号 —— 即使还没选号也能拉到该 user 的全部抖音号。list op 的 client 返回类型
        // 推断成单条(本仓 ClientMethod 已知类型缺口),按既有 island 惯例 `as unknown as [] 取。
        const rows = (await client.listAccounts({
          params: undefined,
          query: { page: 1, pageSize: 100, platform: "douyin" },
          body: undefined,
        })) as unknown as ReadonlyArray<{
          readonly id: string;
          readonly accountHandle: string;
          readonly platform: string;
          readonly status: "active" | "archived";
        }> | null | undefined;
        if (!alive) return;
        const accounts: SwitcherAccount[] = (rows ?? []).map((r) => ({
          id: r.id,
          accountHandle: r.accountHandle,
          platform: r.platform,
          status: r.status,
        }));

        // §E ②③ 归一当前号(auto-select 第一个 active / 清除失效 stored)。
        const stored = readStoredAccountId();
        const { currentId: resolved, shouldPersist } = resolveCurrentAccount(
          accounts,
          stored,
        );
        if (shouldPersist) {
          writeStoredAccountId(resolved);
          // [T-332 S4] 归一改变了当前号(stored 失效回落 / 从无到有自动选):RSC 首屏
          // 可能已按旧号/未选号渲染 —— 补一次 refresh 让整个工作区立刻反映归一结果。
          // 不会循环:persist 后下次 load 的 stored === resolved,shouldPersist=false。
          routerRef.current.refresh();
        }
        setCurrentId(resolved);
        setState({ kind: "ready", accounts });
      } catch {
        // 读失败 / 未登录 → 诚实降级(显不可用),不回退假号。
        if (alive) setState({ kind: "error" });
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // [Bug-7 T-020] mount 时拉一次(settings/account-manager 页 loginDouyin 之后 router.refresh
  // 刷不到 layout 里的 sidebar → 收事件重拉,左下账号名立刻翻新)。
  React.useEffect(() => {
    return load();
  }, [load]);

  // [Bug-7 T-020] 跨页失效广播(loginDouyin/mergeDouyinPlaceholders 等成功后 notifyAccountsChanged)
  // → 立即重拉账号列表 + 归一当前号,避免 sidebar 显陈旧 handle。
  useAccountsChanged(load);

  // [T-332 S4] 确认弹窗状态:仅当切号时存在进行中的前台操作才弹(§6.1)。
  // pendingSwitch = 待确认的目标号 id + 弹窗展示用的操作名单快照。
  const [pendingSwitch, setPendingSwitch] = React.useState<{
    readonly id: string;
    readonly activities: readonly string[];
  } | null>(null);

  // 真正执行切号:写 localStorage(+ 镜像 cookie)→ 广播失效 → refresh。
  // 顺序有讲究:cookie 先落,refresh 的首个 RSC 才是新号;事件先于 refresh 广播,
  // 让 island 的重拉与 RSC 刷新并行,不留旧号残影。
  const performSwitch = React.useCallback((id: string) => {
    writeStoredAccountId(id);
    setCurrentId(id);
    // 全面失效重取(SPEC §6.1):router.refresh() 覆盖 RSC/props 链;accountsChanged
    // 覆盖 refresh 刷不到的 island 内部缓存态(mount 时拉一次的 client state)。
    notifyAccountsChanged();
    routerRef.current.refresh();
  }, []);

  const handleSelect = React.useCallback(
    (id: string) => {
      if (id === currentId) return;
      // 有进行中的前台操作(AI 生成中 / 表单提交中)→ 先确认再切,防丢进行时上下文。
      if (hasForegroundActivity()) {
        setPendingSwitch({ id, activities: listForegroundActivities() });
        return;
      }
      // 默认直切(SPEC §6.1 保持现状机制)。
      performSwitch(id);
    },
    [currentId, performSwitch],
  );

  const accounts = state.kind === "ready" ? state.accounts : [];
  const activeAccounts = accounts.filter((a) => a.status === "active");
  const current = accounts.find((a) => a.id === currentId) ?? null;

  // 收拢态:仅一个图标按钮(tooltip 显当前号)。
  const triggerLabel = current
    ? current.accountHandle
    : state.kind === "loading"
      ? "载入账号…"
      : "未绑定账号";

  const trigger = (
    <button
      type="button"
      data-slot="account-switcher-trigger"
      data-testid="account-switcher-trigger"
      aria-label={`当前抖音号：${triggerLabel}`}
      className={cn(
        "flex cursor-pointer items-center rounded-card border border-border bg-surface text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        collapsed ? "size-9 justify-center p-0" : "w-full gap-2 px-2.5 py-2",
      )}
    >
      <span
        aria-hidden="true"
        className="flex size-6 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand"
      >
        <AtSign className="size-3.5" />
      </span>
      {!collapsed ? (
        <>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-[11px] uppercase tracking-wide text-text-subtle">
              当前抖音号
            </span>
            <span className="truncate text-sm font-medium text-foreground">
              {triggerLabel}
            </span>
          </span>
          <ChevronsUpDown
            className="size-4 shrink-0 text-muted-foreground"
            aria-hidden="true"
          />
        </>
      ) : null}
    </button>
  );

  const menu = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {collapsed ? (
          <Tooltip>
            <TooltipTrigger asChild>{trigger}</TooltipTrigger>
            <TooltipContent side="right">{triggerLabel}</TooltipContent>
          </Tooltip>
        ) : (
          trigger
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        side={collapsed ? "right" : "top"}
        className="w-60"
        data-testid="account-switcher-menu"
      >
        <DropdownMenuLabel>切换抖音号</DropdownMenuLabel>
        {state.kind === "error" ? (
          <div
            data-testid="account-switcher-error"
            className="px-2 py-1.5 text-xs text-muted-foreground"
          >
            账号列表暂不可用
          </div>
        ) : activeAccounts.length === 0 ? (
          <div
            data-testid="account-switcher-empty"
            className="px-2 py-1.5 text-xs text-muted-foreground"
          >
            还没有绑定抖音号。绑定后即可按号切换工作空间。
          </div>
        ) : (
          activeAccounts.map((a) => {
            const selected = a.id === currentId;
            return (
              <DropdownMenuItem
                key={a.id}
                data-testid="account-switcher-item"
                data-account-id={a.id}
                data-selected={selected ? "true" : "false"}
                onSelect={() => handleSelect(a.id)}
                className="flex items-center gap-2"
              >
                <AtSign
                  className="size-3.5 shrink-0 text-muted-foreground"
                  aria-hidden="true"
                />
                <span className="min-w-0 flex-1 truncate">
                  {a.accountHandle}
                </span>
                {selected ? (
                  <Check
                    className="size-4 shrink-0 text-brand"
                    aria-hidden="true"
                  />
                ) : null}
              </DropdownMenuItem>
            );
          })
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild data-testid="account-switcher-bind">
          <Link href="/accounts" className="flex items-center gap-2">
            <Plus className="size-4 shrink-0" aria-hidden="true" />
            <span>绑定新抖音号</span>
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  return (
    <div
      data-slot="account-switcher"
      data-testid="account-switcher"
      data-state={state.kind}
      className={cn("flex", collapsed ? "justify-center" : "w-full")}
    >
      {menu}
      {/* [T-332 S4] 切号确认弹窗:仅前台操作进行中出现(§6.1)。取消 = 留在当前号。 */}
      <Dialog
        open={pendingSwitch !== null}
        onOpenChange={(open) => {
          if (!open) setPendingSwitch(null);
        }}
      >
        <DialogContent data-testid="account-switch-confirm">
          <DialogHeader>
            <DialogTitle>有进行中的操作,切号会离开当前页面</DialogTitle>
            <DialogDescription>
              切换抖音号 = 切换整个工作区,以下进行中的操作会被打断(后台任务不受影响,完成后仍归原账号):
            </DialogDescription>
          </DialogHeader>
          {pendingSwitch && pendingSwitch.activities.length > 0 ? (
            <ul
              data-testid="account-switch-confirm-activities"
              className="list-disc pl-5 text-sm text-muted-foreground"
            >
              {pendingSwitch.activities.map((label) => (
                <li key={label}>{label}</li>
              ))}
            </ul>
          ) : null}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              data-testid="account-switch-cancel"
              onClick={() => setPendingSwitch(null)}
            >
              留在当前账号
            </Button>
            <Button
              type="button"
              data-testid="account-switch-confirm-action"
              onClick={() => {
                const target = pendingSwitch;
                setPendingSwitch(null);
                if (target) performSwitch(target.id);
              }}
            >
              仍要切换
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
