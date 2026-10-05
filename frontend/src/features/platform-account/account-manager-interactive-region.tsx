"use client";

/**
 * 保留真实抖音扫码与平台账号隐藏操作。扫码成功只采信后端身份回执，并读回账号；
 * 同一账号组内的管理与其他平台手动登记位于 account-group-manager.tsx。
 * PLATFORMS仅描述本文件支持扫码的平台，不是账号组的平台枚举。
 */

import * as React from "react";
import { useRouter } from "next/navigation";

import { client } from "@/lib/contract-client";
import { notifyAccountsChanged } from "@/lib/account-events";
import { readCurrentGroupId } from "@/lib/http-transport";
import { beginForegroundActivity } from "@/lib/foreground-activity";
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

// [T-136§D-bind⑥ · 用户 2026-07-06 报障][T-201c 只隐藏不移除] 隐藏账号是破坏性动作(影响该号
// 定位/选题/项目归属),必须打字二次确认(防误点)。要求逐字键入此句才放行「确认隐藏」。
// [T-201c] 语义 = 隐藏(status→archived,可逆,永不硬删,数据按 id 锚点原地保留);文案统一「隐藏」。
const REMOVE_CONFIRM_PHRASE = "我已确认隐藏该账户";

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
  wechatOfficial: "公众号",
  kuaishou: "快手",
  x: "X",
};

// Shared island mutation seam: a `pending` guard blocks concurrent writes; on success
// it calls router.refresh() so the server re-reads the persisted rows.
function useMutation() {
  const router = useRouter();
  const [pending, setPending] = React.useState(false), [error, setError] = React.useState<string | null>(null);
  const alive=React.useRef(false), inFlight=React.useRef(false);
  React.useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
  const run = React.useCallback((mutate: () => Promise<unknown>, after?:()=>void) => {
    if(inFlight.current)return;inFlight.current=true;setPending(true);setError(null);
    const groupId=readCurrentGroupId();
    const end=beginForegroundActivity("平台账号管理正在保存");
    void(async()=>{
      try{
        await mutate();
        if(!alive.current||readCurrentGroupId()!==groupId)return;
        after?.();notifyAccountsChanged({source:"account-management",routeRefreshScheduled:true});router.refresh();
      }catch(err){if(alive.current&&readCurrentGroupId()===groupId)setError(err instanceof Error?err.message:"账号操作没有完成，请重试。");}
      finally{inFlight.current=false;end();if(alive.current)setPending(false);}
    })();
  },[router]);
  return {pending,error,run};
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

export function CreateAccountForm({ disabled = false, targetGroupId }: { disabled?: boolean; targetGroupId?: string } = {}) {
  const router = useRouter();
  const [phase, setPhase] = React.useState<ScanPhase>("idle");
  const [feedback, setFeedback] = React.useState<ScanFeedback>({ kind: "none" });
  const alive = React.useRef(false), scanning = React.useRef(false);
  React.useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const busy = disabled || phase !== "idle";

  const scan = React.useCallback(() => {
    if (busy || scanning.current) return;
    const groupId = targetGroupId ?? readCurrentGroupId();
    if (targetGroupId && readCurrentGroupId() !== targetGroupId) {
      setFeedback({ kind: "error", text: "账号组已切换，请在当前账号组重新绑定。" }); return;
    }
    scanning.current = true;
    const endActivity = beginForegroundActivity("平台账号正在扫码绑定");
    const canUpdate = () => alive.current && readCurrentGroupId() === groupId;
    setPhase("scanning");
    setFeedback({ kind: "none" });
    void (async () => {
      try {
        // [T-330] 绑**新**号必传 forceNew:后端走 staging 隔离扫码(全新空 profile 必出
        // 二维码,不会命中当前号/_default 旧 sessionid 直接"登进"旧号)→ 同步读回身份 →
        // 按 sec_uid upsert(同号重扫命中既有行=更新不重复)→ 登录态搬该号正式目录。
        // 设置页「重新扫码/重连当前号」不传 forceNew(重连复用现 profile 合理),与此有别。
        const res = (await client.loginDouyin({
          params: undefined,
          query: undefined,
          body: { forceNew: true },
        })) as { loggedIn?: boolean };
        if (!canUpdate()) return;
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
      } catch (err) {
        // [T-330] 诚实失败内联可见(沿 T-209 模式):后端 forceNew 链的明确错误(如「扫码
        // 成功但读不回账号身份」)透传给用户,不吞成笼统文案;无 message 才退化通用提示。
        const msg =
          err instanceof Error && err.message.trim()
            ? err.message
            : "扫码登录失败，请重试。";
        if (canUpdate()) setFeedback({ kind: "error", text: msg });
      } finally {
        scanning.current = false; endActivity();
        if (alive.current) setPhase("idle");
      }
    })();
  }, [busy, router, targetGroupId]);

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
          className="text-xs text-muted-foreground"
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
            "text-xs " +
            (feedback.kind === "success" ? "text-success" : "text-destructive")
          }
        >
          {feedback.text}
        </p>
      ) : null}
    </div>
  );
}

// [T-136§D-bind⑤+⑥] 账号行(极简)—— 真实抖音昵称 + 抖音号 ID(若已回填)+「隐藏」。
// 删掉:「未配置密钥」徽标、涨粉基线输入 + 「保存基线」按钮(用户看不懂的多平台矩阵老字段)。
// [T-201c] 「隐藏」复用 archiveAccount(status→archived,可逆/诚实,永不硬删;数据按 id 锚点原地保留)。
// [⑥ 用户报障] 两道防线:①`isOnlyAccount`(列表只剩这一个 active 号)→ 隐藏禁用(服务端 archiveAccount
//   也硬拒末号,前端只是先给可见反馈);②非末号 → 点「隐藏」弹二次确认框,须逐字键入 REMOVE_CONFIRM_PHRASE
//   才放行(破坏性动作防误点)。
export function AccountRow({
  account,
  isOnlyAccount = false,
}: {
  readonly account: PlatformAccountResource;
  readonly isOnlyAccount?: boolean;
}) {
  const { pending, error, run } = useMutation();
  const [open, setOpen] = React.useState(false);
  const [confirmText, setConfirmText] = React.useState("");
  const phraseMatches = confirmText.trim() === REMOVE_CONFIRM_PHRASE;
  const canConfirm = phraseMatches && !pending;

  // 弹窗关闭即清空已输入的确认文字(下次打开须重新键入,防"记忆残留"绕过友情摩擦)。
  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 外部弹窗关闭时清除破坏性确认词，防止下次打开复用
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
      () => setOpen(false),
    );
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
            已隐藏
          </Badge>
        ) : null}
      </span>
      {isOnlyAccount ? (
        // ① 末号保护:唯一 active 号不准隐藏(否则没号可切、数据全落 NULL 退化)。[T-201c]
        <Button
          type="button"
          variant="ghost"
          size="sm"
          data-testid="account-remove"
          disabled
          title="至少保留一个抖音号，不能隐藏最后一个"
        >
          隐藏
        </Button>
      ) : (
        // ② 二次确认弹窗:点「隐藏」不直接生效,弹框须逐字键入确认句才放行。[T-201c]
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              data-testid="account-remove"
              disabled={removeDisabled}
            >
              隐藏
            </Button>
          </DialogTrigger>
          <DialogContent data-testid="account-remove-dialog">
            <DialogHeader>
              <DialogTitle>隐藏{PLATFORM_LABELS[account.platform] ?? account.platform}账号「{account.accountHandle}」</DialogTitle>
              <DialogDescription>
                隐藏后停止该账号采集，保留组内内容和历史数据。可以在账号组管理中恢复。
                如确认，请在下方逐字键入「{REMOVE_CONFIRM_PHRASE}」。
              </DialogDescription>
            </DialogHeader>
            <Input
              data-testid="account-remove-confirm-input"
              aria-label="隐藏二次确认"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder={REMOVE_CONFIRM_PHRASE}
              autoComplete="off"
            />
            {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
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
                确认隐藏
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
