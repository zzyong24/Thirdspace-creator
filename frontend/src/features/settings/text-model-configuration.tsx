"use client";

import * as React from "react";

import { SectionCard } from "@/components/project/section-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { client } from "@/lib/contract-client";
import {
  CUSTOM_PRESET_ID,
  matchPresetByConfig,
  presetModels,
  type ModelProviderPreset
} from "./model-provider-presets";

import type {
  SettingsViewModel
} from "./settings-page";

import { API_FORMAT_OPTIONS, PROVIDER_SUGGESTIONS, ProviderPresetRow, type ApiFormat } from "./model-configuration-fields";
import { TestConnectionButton } from "./model-connection-test";
import { SettingsFormRow } from "./settings-form-row";
import { useModelConfigurationMutation } from "./use-model-configuration-mutation";
const MODEL_CAPABILITY = "default";
export function ModelConfigurationCard({
  model,
}: {
  model: SettingsViewModel["model"];
}) {
  const [provider, setProvider] = React.useState<string>(model.provider);
  const [modelName, setModelName] = React.useState<string>(model.modelName);
  const [baseUrl, setBaseUrl] = React.useState<string>(model.baseUrl);
  const [apiFormat, setApiFormat] = React.useState<ApiFormat>(model.apiFormat);
  // [T-325] 当前高亮的供应商预设 id:按 (baseUrl, apiFormat) 反推(回显匹配);匹配
  // 不到 = custom。手改字段时重算,选预设时直接置位。仅驱动下拉高亮 + 模型候选,
  // 不进 PUT(后端不认 presetId)。
  const [presetId, setPresetId] = React.useState<string>(
    () => matchPresetByConfig(model.baseUrl, model.apiFormat)?.id ?? CUSTOM_PRESET_ID,
  );
  // Blank = keep the existing stored key (the read never returns the raw value).
  const [secret, setSecret] = React.useState<string>("");
  // 常用主路径只留「预设 / 模型 / 密钥」。只有自定义中转或排错时才展开协议等字段。
  const [showAdvanced, setShowAdvanced] = React.useState(
    () => matchPresetByConfig(model.baseUrl, model.apiFormat) === undefined,
  );
  const [temperature, setTemperature] = React.useState<number>(
    model.temperature,
  );
  const { pending, run, error } = useModelConfigurationMutation();

  // [T-325] 选中预设:一次性填 provider/baseUrl/接口格式(custom 不填,回全自由填)。
  // 模型不强制覆盖(预设是起点不锁死),只把候选切成该家 —— 见下方 datalist。
  const handleSelectPreset = React.useCallback((preset: ModelProviderPreset) => {
    setPresetId(preset.id);
    if(preset.id === CUSTOM_PRESET_ID) {
      setShowAdvanced(true);
      return;
    }
    setProvider(preset.id);
    setBaseUrl(preset.baseUrl);
    setApiFormat(preset.apiFormat);
  }, []);

  const canSave =
    provider.trim().length > 0 && modelName.trim().length > 0 && !pending;

  // One PUT upserts the whole "default" config; an empty secret is omitted so a
  // re-save without re-typing the key preserves the stored one.
  const persistDraft = React.useCallback(
    () =>
      client
        .putModel({
          params: { capability: MODEL_CAPABILITY },
          query: undefined,
          body: {
            provider: provider.trim(),
            modelName: modelName.trim(),
            baseUrl: baseUrl.trim() || undefined,
            apiFormat,
            secret: secret.length > 0 ? secret : undefined,
            settings: { temperature },
          },
        })
        .then(() => setSecret("")),
    [provider, modelName, baseUrl, apiFormat, secret, temperature],
  );

  const save = React.useCallback(() => {
    if(!canSave) return;
    void run(persistDraft);
  }, [canSave, persistDraft, run]);

  const saveBeforeTest = React.useCallback(
    () => (canSave ? run(persistDraft) : Promise.resolve(false)),
    [canSave, persistDraft, run],
  );

  return (
    <SectionCard
      title="模型配置"
      description="选择模型服务并填写模型和密钥；特殊接口设置可在高级设置中修改。"
    >
      <div
        data-slot="model-configuration-card"
        data-highlight="text-model"
        className="flex flex-col gap-3"
      >
        <ProviderPresetRow
          idPrefix="model"
          presetId={presetId}
          disabled={pending}
          onSelectPreset={handleSelectPreset}
        />
        <SettingsFormRow
          label="模型"
          controlId="model-name"
          help="模型 id 自由填(示例:claude-opus-4-8;仅示例,以你的服务商最新型号为准)。"
        >
          <Input
            id="model-name"
            data-slot="model-name-input"
            list="model-name-suggestions"
            value={modelName}
            disabled={pending}
            onChange={(event) => setModelName(event.target.value)}
            aria-label="模型名称"
          />
          {/* [T-325] 候选随选中预设切换;custom / 无候选时为空(纯自由输入)。 */}
          <datalist id="model-name-suggestions">
            {presetModels(presetId).map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>
        </SettingsFormRow>
        <SettingsFormRow
          label="密钥"
          controlId="model-secret"
          help={
            model.hasSecret
              ? "已配置;留空保持不变,填入则覆盖。"
              : "粘贴 API Key(存于本地库)。"
          }
        >
          <div className="flex w-full items-center gap-2">
            <Input
              id="model-secret"
              type="password"
              data-slot="model-secret-input"
              value={secret}
              disabled={pending}
              placeholder={model.hasSecret ? "已配置(留空不变)" : "粘贴 API Key"}
              onChange={(event) => setSecret(event.target.value)}
              aria-label="模型密钥"
            />
            {model.hasSecret ? (
              <Badge
                data-slot="model-secret-status"
                variant="outline"
                className="border-success/40 bg-success-soft text-success"
              >
                已配置
              </Badge>
            ) : null}
          </div>
        </SettingsFormRow>
        <div className="flex justify-end">
          <Button
            type="button"
            data-slot="model-advanced-toggle"
            variant="ghost"
            size="sm"
            onClick={() => setShowAdvanced((value) => !value)}
          >
            {showAdvanced ? "收起高级设置" : "高级设置"}
          </Button>
        </div>
        <div
          data-slot="model-advanced-settings"
          hidden={!showAdvanced}
          className="flex flex-col gap-3 rounded-lg border border-border bg-surface-subtle p-3"
        >
          <SettingsFormRow
            label="提供商标识"
            controlId="model-provider"
            help="仅用于识别配置；选择预设时已自动填写。"
          >
            <Input
              id="model-provider"
              data-slot="model-provider-input"
              list="model-provider-suggestions"
              value={provider}
              disabled={pending}
              onChange={(event) => setProvider(event.target.value)}
              aria-label="模型提供商"
            />
            <datalist id="model-provider-suggestions">
              {PROVIDER_SUGGESTIONS.map((p) => (
                <option key={p} value={p} />
              ))}
            </datalist>
          </SettingsFormRow>
          <SettingsFormRow
            label="接口地址"
            controlId="model-base-url"
            help="填写兼容 API 地址；通常应包含 /v1，具体以接口文档为准。"
          >
            <Input
              id="model-base-url"
              data-slot="model-base-url-input"
              value={baseUrl}
              disabled={pending}
              placeholder="https://example.com/v1"
              onChange={(event) => {
                const next = event.target.value;
                setBaseUrl(next);
                setPresetId(
                  matchPresetByConfig(next, apiFormat)?.id ?? CUSTOM_PRESET_ID,
                );
              }}
              aria-label="接口地址"
            />
          </SettingsFormRow>
          <SettingsFormRow
            label="接口格式"
            controlId="model-api-format"
            help="必须与服务商实际支持的协议一致；New API 可按渠道选择 Chat 或 Responses。"
          >
            <Select
              value={apiFormat}
              onValueChange={(value) => {
                const next = value as ApiFormat;
                setApiFormat(next);
                setPresetId(
                  matchPresetByConfig(baseUrl, next)?.id ?? CUSTOM_PRESET_ID,
                );
              }}
            >
              <SelectTrigger
                id="model-api-format"
                data-slot="model-api-format-trigger"
                size="sm"
                className="w-52"
                disabled={pending}
              >
                <SelectValue placeholder="选择格式" />
              </SelectTrigger>
              <SelectContent data-slot="model-api-format-content">
                {API_FORMAT_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </SettingsFormRow>
          <SettingsFormRow
            label="温度"
            controlId="model-temperature"
            help="一般保持默认即可；较高会让回答更发散。"
          >
            <Input
              id="model-temperature"
              type="number"
              min={0}
              max={1}
              step={0.1}
              data-slot="model-temperature-input"
              className="w-24"
              value={temperature}
              disabled={pending}
              onChange={(event) => {
                const next = Number(event.target.value);
                if(!Number.isNaN(next)) setTemperature(next);
              }}
              aria-label="模型温度"
            />
          </SettingsFormRow>
        </div>
        <div className="flex items-start justify-between gap-3">
          <Button
            type="button"
            data-slot="model-save"
            variant="outline"
            size="sm"
            disabled={!canSave}
            onClick={save}
          >
            仅保存
          </Button>
          <TestConnectionButton
            capability={MODEL_CAPABILITY}
            slotPrefix="model"
            beforeTest={saveBeforeTest}
            label="保存并测试"
            disabled={!canSave}
          />
        </div>
      </div>
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
    </SectionCard>
  );
}

