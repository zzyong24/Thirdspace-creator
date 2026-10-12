"use client";

import * as React from "react";

import { ChannelConfigRetryButton } from "@/components/shell/channel-config-bootstrap";
import { cn } from "@/lib/utils";
import { AssistantEngineCard } from "./assistant-engine-card";
import { ModelConfigTransferCard } from "./model-config-transfer-card";
import { ModelConfigurationManual } from "./model-configuration-manual";

import type {
  ModelAuthorityState,
  SettingsViewModel
} from "./settings-page";

import { AiCreditCenterCard, ChannelManagedModelCard, ChannelServiceCredentialCard, ManagedCapabilityPendingCard } from "./channel-model-configuration";
import { CollapsibleModelGroup } from "./collapsible-model-group";
import { MultimodalModelCard } from "./multimodal-model-configuration";
import { ModelConfigurationCard } from "./text-model-configuration";
import { modelConfigurationIdentity, useModelConnectionTest } from "./model-connection-test";
import { useAssistantEngine } from "@/features/copilot/use-assistant-engine";
export function SettingsModelRegion({ viewModel, modelAuthority, highlight }: { viewModel: SettingsViewModel; modelAuthority?: ModelAuthorityState; highlight: string | null }) {
  const {engine, preference}=useAssistantEngine();
  const usesCodex=preference.ready&&engine==="codex";
  const showIndependentModels=preference.ready&&!usesCodex;
  const retainedServiceIds=new Set(Object.entries(modelAuthority?.capabilities??{})
    .filter(([capability])=>['transcribe.audio','video.generate','knowledge.search.embed'].includes(capability))
    .flatMap(([,state])=>state?.serviceId?[state.serviceId]:[]));

  const usesManagedCredits = modelAuthority?.services?.some(
    (service) =>
      service.credentialSource === "activation_managed",
  );
  const defaultProbe = useModelConnectionTest("default", modelConfigurationIdentity(viewModel.model),
    preference.ready && !usesCodex && modelAuthority?.capabilities?.default?.authority !== "channel" && !usesManagedCredits);
  const capabilityCard = (
    capability:
      | "default"
      | "transcribe.audio"
      | "image.generate"
      | "video.generate",
    title: string,
    highlightKey:
      | "text-model"
      | "asr-model"
      | "image-model"
      | "video-model",
    fallback: React.ReactNode,
  ) =>
    modelAuthority?.capabilities?.[capability]?.authority ===
      "channel" ? (
      <ChannelManagedModelCard
        state={modelAuthority.capabilities[capability]!}
        title={title}
        highlight={highlightKey}
      />
    ) : usesManagedCredits ? (
      <ManagedCapabilityPendingCard
        capability={capability}
        title={title}
        highlight={highlightKey}
      />
    ) : (
      fallback
    );

  return (
    <div
      data-slot="settings-rail"
      className="flex flex-col gap-card-gap"
    >
      <AssistantEngineCard />
      {usesCodex ? <div data-slot="codex-model-capabilities" className="rounded-xl border border-brand/25 bg-brand/5 px-4 py-3">
        <p className="text-sm font-semibold text-foreground">文本创作、图片理解和生图由本地 Codex 执行</p>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">使用 Codex 登录，无需填写文本或生图模型密钥。语音转文字和视频生成仍使用各自的配置。</p>
      </div> : showIndependentModels && (modelAuthority?.authority === "channel" ||
        !viewModel.model.hasSecret) ? (
        <div
          data-slot="model-authority-status"
          data-authority={modelAuthority?.authority ?? "local"}
          className={cn(
            "rounded-xl border px-4 py-3",
            modelAuthority?.authority === "channel"
              ? "border-brand/25 bg-brand/5"
              : modelAuthority?.outcome === "security_error"
                ? "border-destructive/25 bg-destructive/5"
                : "border-border bg-muted/35",
          )}
        >
          <p className="text-sm font-semibold text-foreground">
            {modelAuthority?.action ??
              "本地模型正在使用 · 暂时无法取得渠道配置"}
          </p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            {usesManagedCredits
              ? "当前权益提供的模型无需填写密钥；尚未出现的能力请重新同步配置。"
              : modelAuthority?.authority === "channel"
                ? "当前渠道已提供的模型可以直接使用；未提供的模型仍可由你自行配置。"
                : modelAuthority?.outcome === "activation_scope_missing"
                  ? "当前权益尚未同步模型配置，请重新校验激活状态后重试。"
                  : "你可以继续编辑本地配置，保存后会作为当前或备用配置使用。"}
          </p>
          {modelAuthority?.outcome === "activation_scope_missing" ||
            (usesManagedCredits &&
              Object.keys(modelAuthority?.capabilities ?? {}).length < 4) ? (
            <ChannelConfigRetryButton />
          ) : null}
        </div>
      ) : null}
      {modelAuthority?.services?.some(
        (service) => service.credentialSource === "activation_managed",
      ) ? (
        <AiCreditCenterCard />
      ) : null}
      {modelAuthority?.services
        ?.filter(
          (service) => service.credentialSource !== "activation_managed" &&
            (showIndependentModels || retainedServiceIds.has(service.serviceId)),
        )
        .map((service) => (
          <ChannelServiceCredentialCard
            key={service.serviceId}
            service={service}
          />
        ))}
      {/* ① 重点配置：受管能力不允许回退成用户填写供应商/Key 的旧界面。 */}
      <div data-slot="models-required-group" className="flex flex-col gap-2">
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-0.5">
            <span className="text-sm font-semibold text-foreground">
              {!showIndependentModels ? "语音转文字（按需）" : usesManagedCredits ? "当前模型能力" : "重点配置"}
            </span>
            <span className="text-xs text-muted-foreground">
              {!showIndependentModels ? "可配置 ASR 加快转录；未配置时仍可使用本地 Whisper。" : usesManagedCredits
                ? "文本创作与语音转文字由当前权益提供，无需配置服务商或密钥。语音能力暂未同步时仍可使用本地转写。"
                : "文本模型负责创作。建议配置 ASR 转录模型，避免本地转录时间过长；未配置时仍可使用本地 Whisper。"}
            </span>
          </div>
          {!showIndependentModels || usesManagedCredits ? null : <ModelConfigurationManual />}
        </div>
        {showIndependentModels && capabilityCard(
          "default",
          "文本创作模型",
          "text-model",
          <ModelConfigurationCard
            key={[
              viewModel.model.provider,
              viewModel.model.modelName,
              viewModel.model.baseUrl,
              viewModel.model.apiFormat,
              viewModel.model.hasSecret,
              viewModel.model.temperature,
            ].join(":")}
            model={viewModel.model}
            testSession={defaultProbe}
          />,
        )}
        {capabilityCard(
          "transcribe.audio",
          "语音转文字",
          "asr-model",
          <MultimodalModelCard
            key={`audio:${JSON.stringify(viewModel.multimodalModels.audio)}`}
            kind="audio"
            state={viewModel.multimodalModels.audio}
          />,
        )}
      </div>

      {/* [T-645] 普通用户只需理解创作媒体模型。搜索、embedding、素材归类、
                    文案审核和备用模型仍保留底层 capability 与历史配置兼容，但不再暴露配置卡。 */}
      <CollapsibleModelGroup
        title={!showIndependentModels ? "视频生成（按需）" : "创作媒体(按需)"}
        highlight={highlight}
        highlightKeys={["image-model", "video-model"]}
      >
        {showIndependentModels && capabilityCard(
          "image.generate",
          "文生图模型",
          "image-model",
          <MultimodalModelCard
            key={`image:${JSON.stringify(viewModel.multimodalModels.image)}`}
            kind="image"
            state={viewModel.multimodalModels.image}
          />,
        )}
        {capabilityCard(
          "video.generate",
          "文生视频模型",
          "video-model",
          <MultimodalModelCard
            key={`video:${JSON.stringify(viewModel.multimodalModels.video)}`}
            kind="video"
            state={viewModel.multimodalModels.video}
          />,
        )}
      </CollapsibleModelGroup>

      {/* [T-363] 配置备份:导出/导入全部模型配置(重置/换机兜底;文件含密钥,卡内警示)。 */}
      <ModelConfigTransferCard />
    </div>
  );

}
