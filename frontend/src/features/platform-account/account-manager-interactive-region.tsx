"use client";

/**
 * `account-manager-interactive-region.tsx` — Client islands for the 账号管理 / 矩阵号
 * surface (七步⑤ · §7.1).
 *
 * needs-backend controls, each → its mapped contract op then `router.refresh()`:
 *  - `CreateAccountForm` (新增账号) → `client.createAccount({ body })`.
 *  - `AccountRow` 编辑（涨粉基线）→ `client.updateAccount`; 归档 → `client.archiveAccount`.
 *
 * wired-local: the platform filter tabs are client-side only (issue NO mutation /
 * network — a pure list filter over the already-hydrated rows).
 *
 * Secret hygiene (§7.1): `secretReference` is rendered as a masked REFERENCE label only
 * (never a raw value). The form takes a reference string (e.g. `env:DOUYIN_TOKEN_REF`),
 * never a token.
 *
 * Determinism (C-5): every visible value comes from props or controlled local state
 * seeded from props; no Date.now / Math.random / fetch in render. The mutation seam
 * mirrors the monetization/positioning islands. `/accounts` is annotated
 * "暂不纳入视觉门禁" until stage-12 re-baseline.
 */

import * as React from "react";
import { useRouter } from "next/navigation";

import { client } from "@/lib/contract-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import type { PlatformAccountResource } from "@creatoros/backend/modules/platform-account";

// [T-146] 抖音-only:产品单平台聚焦抖音,账号 UI 只呈现抖音号(此前多平台下拉/tab 与
// 「连接抖音扫码」的真实能力不符 —— 采集/登录/身份回填都只对抖音做真)。PLATFORMS 收敛为
// 单元素,账号列表 tab 只剩抖音,新增表单去掉平台下拉(平台恒为 douyin)。
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

// [T-146] 扫码绑定新抖音号 —— 复用设置页账号绑定的同款扫码链(client.loginDouyin,零新 op)。
// 点扫码 → 弹本机 Chromium 让用户扫码(headed,真弹窗)→ 成功后 loginDouyin 已 ensure
// external_source + §D 的 applyDouyinIdentity 抓真实抖音名/ID 建号 → router.refresh() 让
// 账号列表读回新号。诚实(铁律):headed 扫码端到端卡真机,前端只发起 + 据结果推进,绝不假装
// 登录过;扫码超时/失败 → 明确提示重试,不写任何假账号。真扫码端到端(DATA-2)真机待验。
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

  // 手动登记(次入口,折叠):契约 createAccount 仍是真 op(无抖音真机时也能建号占位),
  // 保留 handle/密钥/基线手填。扫码抓真名是主路径,手动登记是降级兜底。
  const [manualOpen, setManualOpen] = React.useState(false);

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
          // 登录成功 → loginDouyin 已 ensure external_source + applyDouyinIdentity 建/更新号。
          setPhase("refreshing");
          setFeedback({
            kind: "success",
            text: "抖音已连接，正在读回账号…",
          });
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
          点此弹本机 Chrome 窗口，扫码即绑定；成功后自动抓取抖音昵称与 ID。
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
      {/* 手动登记(次入口):无抖音真机 / 想补历史号时手填。默认折叠。 */}
      <button
        type="button"
        data-testid="manual-account-toggle"
        onClick={() => setManualOpen((v) => !v)}
        className="self-start text-[11px] text-muted-foreground underline underline-offset-2 hover:text-foreground"
      >
        {manualOpen ? "收起手动登记" : "或手动登记账号"}
      </button>
      {manualOpen ? <ManualAccountForm /> : null}
    </div>
  );
}

// 手动登记表单(次入口)—— 平台恒为 douyin(抖音-only),去掉平台下拉。
function ManualAccountForm() {
  const { pending, run } = useMutation();
  const [accountHandle, setAccountHandle] = React.useState("");
  const [secretReference, setSecretReference] = React.useState("");
  const [followerBaseline, setFollowerBaseline] = React.useState("");

  const valid = accountHandle.trim().length > 0;

  function submit() {
    if (!valid) return;
    const baseline = Number(followerBaseline);
    run(() =>
      client.createAccount({
        params: undefined,
        query: undefined,
        body: {
          // [T-146] 抖音-only:平台恒 douyin,不再从下拉取。
          platform: "douyin",
          accountHandle: accountHandle.trim(),
          secretReference:
            secretReference.trim().length > 0
              ? secretReference.trim()
              : undefined,
          followerBaseline:
            followerBaseline.trim().length > 0 &&
            Number.isInteger(baseline) &&
            baseline >= 0
              ? baseline
              : undefined,
        },
      }),
    );
  }

  return (
    <form
      data-testid="manual-account-form"
      className="flex w-full flex-wrap items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <Input
        aria-label="账号 handle"
        placeholder="账号 handle（如 @我的主账号）"
        value={accountHandle}
        onChange={(e) => setAccountHandle(e.target.value)}
        className="max-w-[14rem]"
      />
      <Input
        aria-label="密钥引用"
        placeholder="密钥引用（如 env:TOKEN_REF，非明文）"
        value={secretReference}
        onChange={(e) => setSecretReference(e.target.value)}
        className="max-w-[16rem]"
      />
      <Input
        aria-label="涨粉基线"
        placeholder="涨粉基线（可空）"
        value={followerBaseline}
        onChange={(e) => setFollowerBaseline(e.target.value)}
        className="max-w-[10rem]"
      />
      <Button type="submit" disabled={pending || !valid} className="self-start">
        新增账号
      </Button>
    </form>
  );
}

export function AccountRow({
  account,
}: {
  readonly account: PlatformAccountResource;
}) {
  const { pending, run } = useMutation();
  const [baseline, setBaseline] = React.useState(
    String(account.followerBaseline),
  );

  function saveBaseline() {
    const n = Number(baseline);
    if (!Number.isInteger(n) || n < 0) return;
    if (n === account.followerBaseline) return;
    run(() =>
      client.updateAccount({
        params: { accountId: account.id },
        query: undefined,
        body: { followerBaseline: n },
      }),
    );
  }

  function archive() {
    run(() =>
      client.archiveAccount({
        params: { accountId: account.id },
        query: undefined,
        body: undefined,
      }),
    );
  }

  return (
    <li
      data-testid="account-row"
      data-account-id={account.id}
      data-platform={account.platform}
      data-status={account.status}
      className="flex flex-col gap-2 rounded-md border border-border px-3 py-2 text-sm"
    >
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-2">
          <Badge variant="secondary" className="text-[10px]">
            {PLATFORM_LABELS[account.platform] ?? account.platform}
          </Badge>
          <span className="font-medium text-foreground">
            {account.accountHandle}
          </span>
          {/* Secret hygiene (§7.1): show only that a reference is configured, never
              the value. */}
          <Badge
            variant="outline"
            data-testid="account-secret-indicator"
            className="text-[10px]"
          >
            {account.secretReference ? "已配置密钥引用" : "未配置密钥"}
          </Badge>
          {account.status === "archived" ? (
            <Badge variant="outline" className="text-[10px]">
              已归档
            </Badge>
          ) : null}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={pending || account.status === "archived"}
          onClick={archive}
        >
          归档
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          aria-label={`涨粉基线 ${account.accountHandle}`}
          value={baseline}
          onChange={(e) => setBaseline(e.target.value)}
          className="max-w-[10rem]"
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={pending || account.status === "archived"}
          onClick={saveBaseline}
        >
          保存基线
        </Button>
      </div>
    </li>
  );
}

export { PLATFORMS, PLATFORM_LABELS };
export type { PlatformId };
