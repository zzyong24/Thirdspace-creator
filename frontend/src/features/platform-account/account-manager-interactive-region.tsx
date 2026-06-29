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

// The contract platformId enum (kept inline — deterministic, no zod in the FE bundle).
const PLATFORMS = [
  "youtube",
  "bilibili",
  "douyin",
  "xiaohongshu",
  "wechatVideo",
  "x",
] as const;
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

export function CreateAccountForm() {
  const { pending, run } = useMutation();
  const [platform, setPlatform] = React.useState<PlatformId>("douyin");
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
          platform,
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
      data-testid="create-account-form"
      className="flex w-full flex-wrap items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <select
        aria-label="平台"
        value={platform}
        onChange={(e) => setPlatform(e.target.value as PlatformId)}
        className="h-9 rounded-md border border-border bg-background px-2 text-sm"
      >
        {PLATFORMS.map((p) => (
          <option key={p} value={p}>
            {PLATFORM_LABELS[p] ?? p}
          </option>
        ))}
      </select>
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
