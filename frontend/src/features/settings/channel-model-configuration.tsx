"use client";

import { useRouter } from "next/navigation";
import * as React from "react";

import { SectionCard } from "@/components/project/section-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { client } from "@/lib/contract-client";
import { handshakeHeaders } from "@/lib/handshake-client";
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
export function AiCreditCenterCard() {
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
        <Button
          type="button"
          data-slot="open-ai-credit-center"
          disabled={opening}
          onClick={() => void openCredits()}
        >
          {opening ? (
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          ) : null}
          {opening ? "正在打开…" : "查看 AI 额度与消耗"}
        </Button>
      </div>
      {error ? (
        <p data-slot="ai-credit-center-error" className="mt-2 text-xs text-destructive">
          {error}
        </p>
      ) : null}
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
