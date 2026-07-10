"use client";

/**
 * `account-manager-interactive-region.tsx` — 账号管理页客户端岛(抖音-only,极简版)。
 *
 * [T-136§D-bind⑤ · 用户 2026-07-06 截图报障] 账号页彻底简化 —— 用户原话「不是直接扫码,
 * 然后账号列表直接展示就行了吗?每扫码一次判断是否已绑定(是就更新、不是就新增),再加一个移除」。
 * 删掉全部多平台矩阵老设计(手动登记表单 handle/密钥引用/涨粉基线、平台 tab、「未配置密钥」徽标、
 * 每行涨粉基线框)—— 抖音扫码没有 API key 概念,这些字段用户全看不懂。
 *
 * 整页 = 两个动作:
 *  - `CreateAccountForm`(「扫码绑定新抖音号」单一主按钮)→ `client.loginDouyin`(复用设置页同款
 *    扫码链,零新 op);扫码成功后后端按 secUid upsert(命中已有号=更新、无则新增)+ 占位号合并
 *    (§D applyDouyinIdentity/persistence-client),`router.refresh()` 读回真实号。
 *  - `AccountRow`(每行:真实抖音昵称 + 抖音号 ID〔若已回填〕+「移除」)→「移除」复用
 *    `client.archiveAccount`(可逆/诚实,不硬删)。
 *
 * 诚实(铁律):headed 扫码端到端卡真机,前端只发起 + 据结果推进,绝不假装登录过;扫码超时/失败
 * → 明确提示重试,不写任何假账号。粉丝数暂无按号聚合的采集 metric → 不显(不造假),待接。
 */

import * as React from "react";
import { useRouter } from "next/navigation";

import { client } from "@/lib/contract-client";
import { notifyAccountsChanged } from "@/lib/account-events";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { PlatformAccountResource } from "@creatoros/backend/modules/platform-account";

// [T-136§D-bind⑥ · 用户 2026-07-06 报障] 移除账号是破坏性动作(影响该号定位/选题/项目归属),
// 必须打字二次确认(防误点)。要求逐字键入此句才放行「确认移除」。
const REMOVE_CONFIRM_PHRASE = "我已确认移除该账户";

// [T-146/T-136] 抖音-only:产品单平台聚焦抖音。保留 PLATFORM_LABELS 供已有(可能历史遗留的)
// 非抖音号行正确显示标签,但 UI 不再提供多平台选择/筛选。
const PLATFORMS = ["douyin"] as const;
type PlatformId = (typeof PLATFORMS)[number];

const PLATFORM_LABELS: Record<string, string> = {
  youtube: "YouTube",
  bilibili: "B站",
  douyin: "抖音",
  xiaohongshu: "小红书",
  wechatVideo: "视频号",
  x: "X",
};

// Shared island mutation seam: a `pending` guard blocks concurrent writes; on success
// it calls router.refresh() so the server re-reads the persisted rows.
function useMutation() {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  const run = React.useCallback(
    (mutate: () => Promise<unknown>) => {
      if (pending) return;
      setPending(true);
      void (async () => {
        try {
          await mutate();
          router.refresh();
        } finally {
          setPending(false);
        }
      })();
    },
    [pending, router],
  );
  return { pending, run };
}

// [T-136§D-bind⑤] 扫码绑定新抖音号 —— 复用设置页账号绑定的同款扫码链(client.loginDouyin,零新 op)。
// 点扫码 → 弹本机 Chromium 让用户扫码(headed,真弹窗)→ 成功后后端按 secUid upsert(命中已有号=
// 更新昵称/ID、无则新增一个带真实身份的号)+ 占位号合并 → router.refresh() 读回真实号(只剩一行)。
// 诚实(铁律):headed 扫码端到端卡真机,前端只发起 + 据结果推进,绝不假装登录过;扫码超时/失败
// → 明确提示重试,不写任何假账号。真扫码端到端(DATA-2)真机待验。
type ScanPhase = "idle" | "scanning" | "refreshing";
type ScanFeedback =
  | { kind: "none" }
  | { kind: "success"; text: string }
  | { kind: "error"; text: string };

export function CreateAccountForm() {
  const router = useRouter();
  const [phase, setPhase] = React.useState<ScanPhase>("idle");
  const [feedback, setFeedback] = React.useState<ScanFeedback>({ kind: "none" });
  const busy = phase !== "idle";

  const scan = React.useCallback(() => {
    if (busy) return;
    setPhase("scanning");
    setFeedback({ kind: "none" });
    void (async () => {
      try {
        // 复用设置页同款:client.loginDouyin({}) → headed 扫码。返回 {loggedIn}。
        const res = (await client.loginDouyin({
          params: undefined,
          query: undefined,
          body: {},
        })) as { loggedIn?: boolean };
        if (res.loggedIn) {
          // 登录成功 → 后端 upsert 按 secUid 去重 + 占位号合并;refresh 读回真实号。
          setPhase("refreshing");
          setFeedback({
            kind: "success",
            text: "抖音已连接，正在读回账号…",
          });
          // [Bug-7 T-020] 跨页失效广播(同 settings 页)。
          notifyAccountsChanged();
          router.refresh();
        } else {
          // 超时(未扫)→ 明确提示重试,不写任何假号。
          setFeedback({
            kind: "error",
            text: "未检测到登录，请重试（需在弹出的 Chrome 窗口内扫码）。",
          });
        }
      } catch {
        setFeedback({ kind: "error", text: "扫码登录失败，请重试。" });
      } finally {
        setPhase("idle");
      }
    })();
  }, [busy, router]);

  const scanLabel = busy
    ? phase === "scanning"
      ? "扫码中…"
      : "读回账号…"
    : "扫码绑定新抖音号";

  return (
    <div data-testid="create-account-form" className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          data-testid="bind-douyin-scan"
          disabled={busy}
          onClick={scan}
          className="self-start"
        >
          {scanLabel}
        </Button>
        <span className="text-xs text-muted-foreground">
          点此弹本机 Chrome 窗口，扫码即绑定；已绑过的号会自动更新，不会重复。
        </span>
      </div>
      {/* 扫码进行中的引导态(仿设置页 loginPhase):真弹本机 Chrome,前端不假装。 */}
      {phase === "scanning" ? (
        <p
          data-slot="douyin-scan-hint"
          className="text-[11px] text-muted-foreground"
        >
          扫码中…请在弹出的 Chrome 窗口扫码（最多 4 分钟）。
        </p>
      ) : null}
      {feedback.kind !== "none" ? (
        <p
          data-slot="douyin-scan-feedback"
          role="status"
          aria-live="polite"
          className={
            "text-[11px] " +
            (feedback.kind === "success" ? "text-success" : "text-destructive")
          }
        >
          {feedback.text}
        </p>
      ) : null}
    </div>
  );
}

// [T-136§D-bind⑤+⑥] 账号行(极简)—— 真实抖音昵称 + 抖音号 ID(若已回填)+「移除」。
// 删掉:「未配置密钥」徽标、涨粉基线输入 + 「保存基线」按钮(用户看不懂的多平台矩阵老字段)。
// 「移除」复用 archiveAccount(status→archived,可逆/诚实,不硬删)。
// [⑥ 用户报障] 两道防线:①`isOnlyAccount`(列表只剩这一个 active 号)→ 移除禁用(服务端 archiveAccount
//   也硬拒末号,前端只是先给可见反馈);②非末号 → 点「移除」弹二次确认框,须逐字键入 REMOVE_CONFIRM_PHRASE
//   才放行(破坏性动作防误点)。
export function AccountRow({
  account,
  isOnlyAccount = false,
}: {
  readonly account: PlatformAccountResource;
  readonly isOnlyAccount?: boolean;
}) {
  const { pending, run } = useMutation();
  const [open, setOpen] = React.useState(false);
  const [confirmText, setConfirmText] = React.useState("");
  const phraseMatches = confirmText.trim() === REMOVE_CONFIRM_PHRASE;
  const canConfirm = phraseMatches && !pending;

  // 弹窗关闭即清空已输入的确认文字(下次打开须重新键入,防"记忆残留"绕过友情摩擦)。
  React.useEffect(() => {
    if (!open) setConfirmText("");
  }, [open]);

  function confirmRemove() {
    if (!canConfirm) return;
    run(() =>
      client.archiveAccount({
        params: { accountId: account.id },
        query: undefined,
        body: undefined,
      }),
    );
    setOpen(false);
  }

  // 抖音号 ID:§D 回填到 external_source.sourceIdentifier;平台账号侧尚无独立 ID 列,
  // 此处若契约后续随行带 externalId 就显,当前无 → 不显(不造假)。
  const externalId =
    (account as unknown as { externalId?: string | null }).externalId ?? null;

  const removeDisabled = pending || account.status === "archived";

  return (
    <li
      data-testid="account-row"
      data-account-id={account.id}
      data-platform={account.platform}
      data-status={account.status}
      className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-sm"
    >
      <span className="flex min-w-0 flex-1 items-center gap-2">
        <Badge variant="secondary" className="shrink-0 text-[10px]">
          {PLATFORM_LABELS[account.platform] ?? account.platform}
        </Badge>
        <span className="truncate font-medium text-foreground">
          {account.accountHandle}
        </span>
        {externalId ? (
          <span
            data-slot="account-external-id"
            className="shrink-0 font-mono text-[11px] text-muted-foreground"
          >
            抖音号 {externalId}
          </span>
        ) : null}
        {account.status === "archived" ? (
          <Badge variant="outline" className="shrink-0 text-[10px]">
            已移除
          </Badge>
        ) : null}
      </span>
      {isOnlyAccount ? (
        // ① 末号保护:唯一 active 号不准移除(否则没号可切、数据全落 NULL 退化)。
        <Button
          type="button"
          variant="ghost"
          size="sm"
          data-testid="account-remove"
          disabled
          title="至少保留一个抖音号，不能移除最后一个"
        >
          移除
        </Button>
      ) : (
        // ② 二次确认弹窗:点「移除」不直接删,弹框须逐字键入确认句才放行。
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              data-testid="account-remove"
              disabled={removeDisabled}
            >
              移除
            </Button>
          </DialogTrigger>
          <DialogContent data-testid="account-remove-dialog">
            <DialogHeader>
              <DialogTitle>移除抖音号「{account.accountHandle}」</DialogTitle>
              <DialogDescription>
                移除后该号从列表消失（可逆，不删历史数据）。此操作影响该号名下的定位/选题/项目归属。
                如确认，请在下方逐字键入「{REMOVE_CONFIRM_PHRASE}」。
              </DialogDescription>
            </DialogHeader>
            <Input
              data-testid="account-remove-confirm-input"
              aria-label="移除二次确认"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder={REMOVE_CONFIRM_PHRASE}
              autoComplete="off"
            />
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="ghost" size="sm">
                  取消
                </Button>
              </DialogClose>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                data-testid="account-remove-confirm"
                disabled={!canConfirm}
                onClick={confirmRemove}
              >
                确认移除
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </li>
  );
}

export { PLATFORMS, PLATFORM_LABELS };
export type { PlatformId };
