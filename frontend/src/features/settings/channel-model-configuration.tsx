"use client";

import { useRouter } from "next/navigation";
import * as React from "react";

import { SectionCard } from "@/components/project/section-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { client } from "@/lib/contract-client";
import { handshakeHeaders } from "@/lib/handshake-client";
import { fetchCreatorApi, readCurrentAccountId, readCurrentGroupId } from "@/lib/http-transport";
import { executionTimeoutMs } from "@creatoros/contract/timeout-policy";
import { openAiCreditCenter } from "@/lib/open-ai-credit-center";
import { cn } from "@/lib/utils";
import {
  Loader2
} from "lucide-react";

import type {
  ChannelModelServiceState,
  ModelCapabilityAuthorityState
} from "./settings-page";

import { TestConnectionButton } from "./model-connection-test";
import { useSettingsMutation } from "./use-settings-mutation";
export function AiCreditCenterCard({ accountStatus }: { readonly accountStatus?: "ready" | "not_configured" | "unverified" } = {}) {
  const [opening, setOpening] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const openCredits = React.useCallback(async () => {
    if(opening) return;
    setOpening(true);
    setError(null);
    try {
      await openAiCreditCenter();
    } catch(cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "暂时无法打开 AI 额度，请稍后重试",
      );
    } finally {
      setOpening(false);
    }
  }, [opening]);

  return (
    <SectionCard
      title="AI 额度与消耗"
      description="前往额度中心查看总额度、已消耗和剩余额度，并进行购买或充值。"
    >
      <div
        data-slot="ai-credit-center-card"
        className="flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between"
      >
        <p className="text-xs leading-5 text-muted-foreground">
          首次使用时按页面提示完成账号连接；之后可从这里直接进入额度中心。
        </p>
        {accountStatus !== "not_configured" ? <Button
          type="button"
          data-slot="open-ai-credit-center"
          disabled={opening}
          onClick={() => void openCredits()}
        >
          {opening ? (
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          ) : null}
          {opening ? "正在打开…" : "查看 AI 额度与消耗"}
        </Button> : null}
      </div>
      {error ? (
        <p data-slot="ai-credit-center-error" className="mt-2 text-xs text-destructive">
          {error}
        </p>
      ) : null}
      <AiCreditBootstrapForm />
    </SectionCard>
  );
}

export function ManagedCapabilityPendingCard({
  capability,
  title,
  highlight,
}: {
  readonly capability:
  | "default"
  | "transcribe.audio"
  | "image.generate"
  | "video.generate";
  readonly title: string;
  readonly highlight:
  | "text-model"
  | "asr-model"
  | "image-model"
  | "video-model";
}) {
  return (
    <SectionCard
      title={title}
      description="当前权益尚未同步这项能力。无需填写服务商、接口地址或密钥。"
    >
      <div
        data-slot={highlight}
        data-capability={capability}
        className="flex flex-col items-start gap-2 rounded-lg border border-warning/25 bg-warning/5 px-3 py-2.5"
      >
        <p className="text-xs leading-5 text-muted-foreground">
          {capability === "transcribe.audio"
            ? "请重新校验并同步当前权益；同步完成前仍可使用本地语音转文字，只是处理时间较长。"
            : "请重新校验并同步当前权益后再试。"}
        </p>
      </div>
    </SectionCard>
  );
}

export function ChannelServiceCredentialCard({
  service,
}: {
  service: ChannelModelServiceState;
}) {
  const [secret, setSecret] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const { pending, run } = useSettingsMutation();
  const save = React.useCallback(async () => {
    if(!secret.trim() || pending) return;
    setError(null);
    try {
      await run(() =>
        client.putChannelModelCredential({
          params: { serviceId: service.serviceId },
          query: undefined,
          body: { secret: secret.trim() },
        }),
      );
      setSecret("");
    } catch(cause) {
      setError(cause instanceof Error ? cause.message : "保存失败，请重试");
    }
  }, [pending, run, secret, service.serviceId]);
  return (
    <SectionCard
      title="模型访问密钥"
      description="密钥只加密保存在本机，不会上传到产品配置。"
    >
      <div
        data-slot="channel-model-service-credential"
        data-service-id={service.serviceId}
        className="flex flex-col gap-3"
      >
        <div className="flex flex-wrap items-center gap-2">
          <Badge
            variant="outline"
            className={service.hasSecret ? "text-success" : "text-warning"}
          >
            {service.hasSecret ? "已填写" : "待填写"}
          </Badge>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            data-slot="channel-model-service-secret"
            type="password"
            value={secret}
            disabled={pending}
            onChange={(event) => setSecret(event.target.value)}
            placeholder={
              service.hasSecret
                ? "留空保持不变，填写后覆盖"
                : "粘贴这个服务的 API Key"
            }
            aria-label="模型访问密钥"
          />
          <Button
            type="button"
            disabled={!secret.trim() || pending}
            onClick={() => void save()}
          >
            {pending ? "保存中…" : service.hasSecret ? "更新密钥" : "保存密钥"}
          </Button>
        </div>
        {error ? <p className="text-xs text-destructive">{error}</p> : null}
      </div>
    </SectionCard>
  );
}

export function ChannelManagedModelCard({
  state,
  title,
  highlight,
}: {
  state: ModelCapabilityAuthorityState;
  title: string;
  highlight: string;
}) {
  const router = useRouter();
  const [switching, setSwitching] = React.useState(false);
  const [selectionError, setSelectionError] = React.useState<string | null>(null);
  const selectModel = React.useCallback(async (optionId: string) => {
    setSwitching(true);
    setSelectionError(null);
    try {
      const response = await fetch("/api/v1/local/channel-model-selection", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...handshakeHeaders(),
        },
        body: JSON.stringify({ capability: state.capability, optionId }),
      });
      if(!response.ok) throw new Error("模型切换失败，请重新同步渠道配置后重试");
      router.refresh();
    } catch(error) {
      setSelectionError(error instanceof Error ? error.message : "模型切换失败");
    } finally {
      setSwitching(false);
    }
  }, [router, state.capability]);
  return (
    <SectionCard
      title={title}
      description="当前权益已提供这项能力，无需填写密钥；有多个模型时可以直接选择。"
    >
      <div
        data-slot="channel-managed-model-card"
        data-capability={state.capability}
        data-highlight={highlight}
        className="flex flex-col gap-3"
      >
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">已配置</Badge>
          <span className="text-sm font-medium text-foreground">
            {state.modelName ?? "模型已就绪"}
          </span>
        </div>
        {state.selectionNotice ? (
          <p className="text-xs text-warning">{state.selectionNotice}</p>
        ) : null}
        {(state.modelOptions?.length ?? 0) > 1 ? (
          <label className="flex items-center gap-3 text-sm">
            <span className="text-muted-foreground">使用模型</span>
            <select
              aria-label={`${title}使用模型`}
              value={state.optionId ?? ""}
              disabled={switching}
              onChange={(event) => void selectModel(event.target.value)}
              className="rounded-md border border-border bg-background px-3 py-2"
            >
              {state.modelOptions?.map((option) => (
                <option key={option.id} value={option.id}>{option.name}</option>
              ))}
            </select>
          </label>
        ) : null}
        {selectionError ? <p className="text-xs text-destructive">{selectionError}</p> : null}
        <div className="flex items-center justify-between gap-3 border-t border-border/70 pt-3">
          <p
            className={cn(
              "text-xs",
              state.hasSecret ? "text-success" : "text-warning",
            )}
          >
            {state.hasSecret
              ? "当前权益已就绪"
              : "模型正在准备，请重新同步配置"}
          </p>
          {state.capability === "transcribe.audio" ? null : (
            <TestConnectionButton
              capability={state.capability}
              slotPrefix={`channel-${state.capability.replaceAll(".", "-")}`}
              disabled={!state.hasSecret}
            />
          )}
        </div>
      </div>
    </SectionCard>
  );
}

// cc-switch-style configurable provider binding. provider / model / baseUrl /
// apiFormat are free-form; the API key is stored in the LOCAL db (masked to
// `hasSecret` on read — the raw key is never echoed back). A single 保存 upserts
// the "default" capability via `settings.models.put`; resolve.ts then reads it
// (stored key preferred over env-ref) with a global-default fallback.
// [T-325] 顶部加「供应商预设」下拉:选一家 → 填 baseUrl/接口格式 + 切模型候选 datalist。

type BootstrapView = {
  contractVersion: "growth-ai-credit-bootstrap-v1"; operationRef: string;
  status: "pending" | "provider_unknown" | "applied" | "expired";
  creditUnits: number; expiresAt: string;
};
function readBootstrapView(value: unknown): BootstrapView {
  const row = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
  if (!row || Object.keys(row).sort().join() !== ["contractVersion", "operationRef", "status", "creditUnits", "expiresAt"].sort().join() ||
    row.contractVersion !== "growth-ai-credit-bootstrap-v1" || typeof row.operationRef !== "string" ||
    !/^AICLE-[A-Za-z0-9_-]{6,96}$/.test(row.operationRef) ||
    typeof row.status !== "string" || !["pending", "provider_unknown", "applied", "expired"].includes(row.status) ||
    typeof row.creditUnits !== "number" || !Number.isSafeInteger(row.creditUnits) || row.creditUnits <= 0 ||
    typeof row.expiresAt !== "string" || !Number.isFinite(Date.parse(row.expiresAt))) throw new Error("开通结果无法验证，请保留原操作并查询");
  return row as unknown as BootstrapView;
}
function AiCreditBootstrapForm() {
  const router = useRouter();
  const [code, setCode] = React.useState("");
  const [operationRef, setOperationRef] = React.useState("");
  const [operation, setOperation] = React.useState<BootstrapView | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [uncertain, setUncertain] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const attempt = React.useRef<{ digest: string; key: string } | null>(null);
  const inFlight = React.useRef(false);
  const generation = React.useRef(0);
  const abort = React.useRef<AbortController | null>(null);
  React.useEffect(() => {
    let scope = `${readCurrentGroupId() ?? ""}:${readCurrentAccountId() ?? ""}`;
    const change = () => {
      const next = `${readCurrentGroupId() ?? ""}:${readCurrentAccountId() ?? ""}`;
      if (next === scope) return;
      scope = next; generation.current++; abort.current?.abort(); attempt.current = null;
      inFlight.current = false; setBusy(false); setCode(""); setOperationRef(""); setOperation(null); setError(null); setUncertain(false);
    };
    window.addEventListener("creatoros:accounts-changed", change);
    window.addEventListener("storage", change);
    return () => { generation.current++; abort.current?.abort(); window.removeEventListener("creatoros:accounts-changed", change); window.removeEventListener("storage", change); };
  }, []);
  async function perform(action: "reserve" | "read" | "resume" | "connect") {
    if (inFlight.current) return;
    const submittedCode = code.trim();
    const ref = operation?.operationRef ?? operationRef.trim();
    if (action === "reserve" && !/^AICR-[A-Za-z0-9_-]{35,59}$/.test(submittedCode)) { setError("请输入自己的有效充值码"); return; }
    if (action !== "reserve" && !/^AICLE-[A-Za-z0-9_-]{6,96}$/.test(ref)) { setError("请填写原操作编号"); return; }
    inFlight.current = true; setBusy(true); setError(null);
    if (action === "reserve") setCode("");
    const current = generation.current;
    const scope = { groupId: readCurrentGroupId(), accountId: readCurrentAccountId() };
    const controller = new AbortController(); abort.current = controller;
    const timer = setTimeout(() => controller.abort(), executionTimeoutMs(900_000));
    const live = () => current === generation.current && !controller.signal.aborted;
    let sent = false;
    try {
      if (action === "reserve") {
        // 只在当前提交中持有充值码；未确认时只保摘要和原幂等键，显式恢复不得换码。
        const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(submittedCode));
        const digest = Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, "0")).join("");
        if (!live()) return;
        if (attempt.current && attempt.current.digest !== digest) { setError("本次结果尚未确认，请输入原充值码恢复同一次提交"); return; }
        attempt.current ??= { digest, key: `bootstrap-${crypto.randomUUID()}` };
      }
      if (action === "connect") {
        if (operation?.status !== "applied") return;
        const sync = await fetchCreatorApi("/api/v1/local/client-config", { method: "POST", cache: "no-store", signal: controller.signal, headers: { "x-creatoros-config-trigger": "bootstrap" } }, scope);
        const body = await sync.json() as { outcome?: string; authority?: string; action?: string };
        if (!live()) return;
        if (!sync.ok || body.outcome !== "configured" || body.authority !== "channel") throw new Error("兑换已到账，但配置同步暂未完成，请保留原操作后重试同步");
        window.dispatchEvent(new CustomEvent("creatoros:client-config-synced", { detail: { outcome: "configured" } }));
        router.refresh();
        const { loadModelRouting } = await import("@/features/copilot/assistant-engine");
        await loadModelRouting(true);
        if (!live()) return;
        await openAiCreditCenter();
        return;
      }
      const path = action === "reserve" ? "/api/v1/local/ai-credits/bootstrap" :
        `/api/v1/local/ai-credits/bootstrap/${encodeURIComponent(ref)}${action === "resume" ? "/resume" : ""}`;
      sent = true;
      const response = await fetchCreatorApi(path, {
        method: action === "read" ? "GET" : "POST", cache: "no-store", signal: controller.signal,
        headers: action === "read" ? {} : { "Content-Type": "application/json", ...(action === "reserve" ? { "Idempotency-Key": attempt.current!.key } : {}) },
        ...(action === "reserve" ? { body: JSON.stringify({ serviceId: "omnihi-main", code: submittedCode }) } : action === "resume" ? { body: "{}" } : {}),
      }, scope);
      const value: unknown = await response.json();
      if (!live()) return;
      if (!response.ok) {
        const failed = value && typeof value === "object" ? value as { error?: unknown; uncertain?: unknown } : {};
        if (action === "reserve") {
          const unknown = failed.uncertain === true; setUncertain(unknown);
          if (!unknown) attempt.current = null;
        }
        throw new Error(typeof failed.error === "string" ? failed.error : "开通结果尚未确认，请保留原操作并查询");
      }
      const result = readBootstrapView(value);
      if (action !== "reserve" && result.operationRef !== ref) throw new Error("操作身份无法验证，请保留原操作并查询");
      setOperation(result); setOperationRef(result.operationRef); setUncertain(false); attempt.current = null;
    } catch (cause) {
      if (current !== generation.current) return;
      if (action === "reserve" && sent && attempt.current) setUncertain(true);
      setError(cause instanceof Error ? cause.message : "到账结果尚未确认，请保留原操作并查询");
    } finally {
      clearTimeout(timer);
      if (current === generation.current) { inFlight.current = false; setBusy(false); }
    }
  }
  const status = operation ? ({ pending: "开通处理中", provider_unknown: "到账确认中，请查询原操作，不要更换充值码", applied: "本次兑换已到账", expired: "原操作期限已到，请保留编号核对到账状态，不要更换充值码" } as const)[operation.status] : null;
  return <details data-slot="ai-credit-bootstrap" className="mt-3 border-t border-border/70 pt-3">
    <summary className="cursor-pointer text-sm font-medium">使用充值码开通官方额度</summary>
    <div className="mt-3 flex flex-col gap-3">
      <p className="text-xs leading-5 text-muted-foreground">没有官方额度账户时，可使用自己的充值码开通。已有账户请在额度中心充值。</p>
      {!operation ? <div className="flex flex-col gap-2 sm:flex-row">
        <Input aria-label="官方额度充值码" type="password" autoComplete="off" value={code} disabled={busy} onChange={event => setCode(event.target.value)} placeholder={uncertain ? "重新输入原充值码，恢复同一次提交" : "粘贴自己的 AICR 充值码"}/>
        <Button type="button" disabled={busy || !code.trim()} onClick={() => void perform("reserve")}>{uncertain ? "恢复原提交" : "兑换并开通"}</Button>
      </div> : null}
      {uncertain ? <p className="text-xs text-warning">本次请求结果尚未确认。只恢复同一次提交；已有操作编号时，请查询原操作。</p> : null}
      <label className="flex flex-col gap-2 text-sm"><span>原操作编号</span><Input aria-label="原操作编号" autoComplete="off" value={operationRef} disabled={busy || !!operation} onChange={event => setOperationRef(event.target.value)}/></label>
      {operation ? <p role="status" className="text-xs text-muted-foreground">{status}</p> : null}
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" disabled={busy || !operationRef.trim()} onClick={() => void perform("read")}>查询原操作</Button>
        {operation && (operation.status === "pending" || operation.status === "provider_unknown") ? <Button type="button" variant="outline" disabled={busy} onClick={() => void perform("resume")}>恢复原操作</Button> : null}
        {operation?.status === "applied" ? <Button type="button" disabled={busy} onClick={() => void perform("connect")}>同步并打开额度中心</Button> : null}
      </div>
      {error ? <p role="alert" className="text-xs text-destructive">{error}</p> : null}
    </div>
  </details>;
}
