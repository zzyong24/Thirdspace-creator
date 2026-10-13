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
  Cpu,
  Palette
} from "lucide-react";
import {
  CUSTOM_PRESET_ID,
  matchPresetByConfig,
  presetModels,
  type ModelProviderPreset
} from "./model-provider-presets";

import type {
  MultimodalModelState
} from "./settings-page";

import { API_FORMAT_OPTIONS, ProviderPresetRow, type ApiFormat } from "./model-configuration-fields";
import { TestConnectionButton } from "./model-connection-test";
import { SettingsFormRow } from "./settings-form-row";
import { useModelConfigurationMutation } from "./use-model-configuration-mutation";
const MODEL_CAPABILITY = "default";
const MULTIMODAL_META = {
  image: {
    capability: "image.generate" as const,
    title: "文生图模型",
    icon: Palette,
    description:
      "录制阶段 AI 生成图片素材用;不配则录制页「AI 生成图」禁用。",
    // [T-379] openai = OpenAI 兼容 images API。
    providerSuggestions: ["openai", "minimax"] as ReadonlyArray<string>,
    providerPlaceholder: "openai",
    providerHelp:
      "内置适配：MiniMax / OpenAI 兼容图片接口。其他接口需要对应适配能力。",
    // [T-377] 模型 id 自由填,不预置候选 —— 供应商上新频繁,示例仅供参考。
    modelHelp:
      "文生图模型 id 自由填(示例:gpt-image-2 / image-01;仅示例,以你的服务商最新型号为准)。",
    modelPlaceholder: "示例:gpt-image-2(以服务商最新为准)",
    baseUrlPlaceholder:
      "示例：https://api.example.com/v1（留空使用默认地址）",
    disabledHint: "未配 → 录制页 AI 生成禁用。",
  },
  video: {
    capability: "video.generate" as const,
    title: "文生视频模型",
    icon: Cpu,
    description:
      "录制阶段 AI 生成视频素材用;不配则录制页「AI 生成视频」禁用。",
    providerSuggestions: ["seedance", "minimax"] as ReadonlyArray<string>,
    providerPlaceholder: "seedance",
    providerHelp:
      "支持已接入的视频生成接口；旧配置中的 seedance / seeddance 会自动兼容。",
    // [T-377] 模型 id 自由填,不预置候选 —— 供应商上新频繁,示例仅供参考。
    modelHelp: "文生视频模型 id 自由填(示例:seedance/seedance-2.0-fast / MiniMax-H3;以服务商控制台为准)。",
    modelPlaceholder: "示例:seedance/seedance-2.0-fast 或 MiniMax-H3",
    baseUrlPlaceholder: "示例：https://api.example.com/media/v1（MiniMax 留空使用官方地址）",
    disabledHint: "未配 → 录制页 AI 生成禁用。",
  },
  // 逐字稿 ASR(T-641)—— 建议配置但不阻断。普通用户只需要选供应商、填模型名和 Key；provider/baseUrl
  // 由预设自动填入，兼容旧配置与自定义供应商的技术字段收进「高级设置」。
  audio: {
    capability: "transcribe.audio" as const,
    title: "语音转文字（建议配置）",
    icon: Cpu,
    description:
      "建议配置 ASR 转录模型，避免本地转录时间过长。未配置时仍可使用本地 Whisper，但处理较慢；后台会按小批次慢慢补齐历史逐字稿。",
    providerSuggestions: ["qwen-asr", "xiaomi-mimo", "siliconflow", "openai", "groq"] as ReadonlyArray<string>,
    providerPlaceholder: "xiaomi-mimo",
    providerHelp:
      "预设会自动填写；只有自建中转或其他厂商才需要修改。",
    modelHelp:
      "填写供应商控制台中的准确模型名。Qwen 方言识别使用 qwen3-asr-flash；小米 MiMo 使用 mimo-v2.5-asr。",
    modelPlaceholder: "mimo-v2.5-asr",
    baseUrlPlaceholder:
      "https://api.xiaomimimo.com/v1",
    disabledHint:
      "建议配置 ASR 转录模型，避免本地转录时间过长。未配置时仍可使用本地 Whisper，但处理较慢。",
  },
  // [T-093] 知识库语义搜索 embedding —— OpenAI 兼容 embedding 端点(SiliconFlow/OpenAI
  // 同形状);未配 → 知识库 AI 搜索诚实降级纯关键词。apiFormat 显式存 openai_chat
  // (embedding 无 anthropic 协议;resolveEmbedSpec 只认专配行)。
  embed: {
    capability: "knowledge.search.embed" as const,
    title: "语义搜索模型",
    icon: Cpu,
    description:
      "知识库 AI 搜索用(embedding 语义召回);不配则搜索为纯关键词匹配。",
    providerSuggestions: ["siliconflow", "openai"] as ReadonlyArray<string>,
    providerPlaceholder: "siliconflow",
    providerHelp:
      "OpenAI 兼容 embedding 厂商,可自定义(SiliconFlow / OpenAI 同形状)。",
    modelHelp: "embedding 模型 id,如 BAAI/bge-m3(SiliconFlow)。",
    modelPlaceholder: "BAAI/bge-m3",
    baseUrlPlaceholder: "https://api.siliconflow.cn/v1(留空=provider 默认)",
    disabledHint: "未配 → 知识库搜索为纯关键词。",
  },
  // [T-055h SPEC §6.2 第二层] 素材 AI 归类 —— VLM 看图打用途标签+一句话描述(倾倒场
  // 上传后异步跑;未配置只跑确定性第一层,诚实不假装)。OpenAI 兼容 chat vision。
  vision: {
    capability: "asset.classify" as const,
    title: "素材归类模型",
    icon: Cpu,
    description:
      "倾倒场素材 AI 归类用(视觉模型看图打标签+描述);不配则只按文件名/类型归类。",
    providerSuggestions: ["siliconflow", "openai", "minimax"] as ReadonlyArray<string>,
    providerPlaceholder: "siliconflow",
    providerHelp: "OpenAI 兼容视觉模型厂商,可自定义。",
    modelHelp: "视觉模型 id,如 Qwen/Qwen2.5-VL-72B-Instruct(SiliconFlow)。",
    modelPlaceholder: "",
    baseUrlPlaceholder: "https://api.siliconflow.cn/v1(留空=provider 默认)",
    disabledHint: "未配 → 素材归类只跑确定性第一层。",
  },
  // [T-084a SPEC §1.1] 联网搜索 —— 素材搜集(material.gather)前置真检索用。provider 用户可配
  // (博查/Tavily/SerpApi 首发);未配 → 素材来自模型记忆(卡片黄条 + 需核实徽标 + honestyBlock
  // 声明非实时检索)。model 对搜索多选填(serpapi 用它当 engine,默认 google)。
  search: {
    capability: "web.search" as const,
    title: "联网搜索",
    icon: Cpu,
    description:
      "素材搜集(找素材/搜资料)前置真联网检索用;不配则素材来自模型训练记忆、来源需核实。rss / browser 免 key。",
    providerSuggestions: ["rss", "browser", "bocha", "tavily", "serpapi"] as ReadonlyArray<string>,
    providerPlaceholder: "rss",
    providerHelp:
      "免 key:rss(baseUrl 填 RSS/Atom feed 网址,逗号分隔多个)/ browser(真开无头浏览器搜 Bing,自截图存证,较慢较脆弱)。付费需 key:bocha(博查,中文优)/ tavily / serpapi。任意模型都能真联网。",
    modelHelp:
      "多数搜索无「模型」概念可留空;serpapi 用它当 engine(默认 google,可填 bing 等);rss/browser 留空。",
    modelPlaceholder: "",
    baseUrlPlaceholder:
      "rss=feed URL(逗号分隔);browser=搜索 URL 模板(留空=Bing,{q} 占位查询词);留空=provider 默认(bocha=api.bochaai.com 等)",
    disabledHint: "未配 → 素材来自模型记忆,标注需核实。",
  },
  // [T-239b S1] 备用对话模型 —— 主对话模型「流开始前」可重试错误(限流/5xx/网络断/过载)
  // 自动重试耗尽后由它接管一次(错误恢复层)。只认本专配行(不回退默认模型 —— 那会「备用」
  // 成主模型自己);未配 → 现状报错(诚实降级)。文本 LLM 走 apiFormat 分派,故此卡多一个
  // 「接口格式」选择(与文本模型卡同款,是唯一带 apiFormat 的多模态卡)。
  fallback: {
    capability: "chat.fallback" as const,
    title: "备用对话模型",
    icon: Cpu,
    description:
      "主对话模型故障(限流/服务端错误/网络断)自动重试仍失败时,由它接管本轮;建议配与主模型不同厂商的模型(故障不同时发生)。不配则重试耗尽后直接报错。",
    providerSuggestions: ["anthropic", "minimax", "deepseek", "openai"] as ReadonlyArray<string>,
    providerPlaceholder: "anthropic",
    providerHelp: "任意厂商名,可自定义(建议与主模型不同厂商,故障不同时发生)。",
    modelHelp: "模型 id 自由填(示例:claude-opus-4-8 / deepseek-chat;仅示例,以你的服务商最新型号为准)。",
    modelPlaceholder: "",
    baseUrlPlaceholder: "https://api.anthropic.com(留空=provider 默认)",
    disabledHint: "未配 → 主模型重试耗尽后直接报错。",
  },
} as const;

type AsrProviderPreset = {
  id: string;
  label: string;
  provider: string;
  baseUrl: string;
  defaultModel: string;
};

const CUSTOM_ASR_PRESET_ID = "custom";
const ASR_PROVIDER_PRESETS: ReadonlyArray<AsrProviderPreset> = [
  {
    id: "qwen-asr",
    label: "通义千问 Qwen（方言推荐）",
    provider: "qwen-asr",
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    defaultModel: "qwen3-asr-flash",
  },
  {
    id: "xiaomi-mimo",
    label: "小米 MiMo（推荐）",
    provider: "xiaomi-mimo",
    baseUrl: "https://api.xiaomimimo.com/v1",
    defaultModel: "mimo-v2.5-asr",
  },
  {
    id: "siliconflow",
    label: "硅基流动",
    provider: "siliconflow",
    baseUrl: "https://api.siliconflow.cn/v1",
    defaultModel: "FunAudioLLM/SenseVoiceSmall",
  },
  {
    id: "openai",
    label: "OpenAI",
    provider: "openai",
    baseUrl: "https://api.openai.com/v1",
    defaultModel: "gpt-4o-mini-transcribe",
  },
  {
    id: "groq",
    label: "Groq",
    provider: "groq",
    baseUrl: "https://api.groq.com/openai/v1",
    defaultModel: "whisper-large-v3-turbo",
  },
  {
    id: CUSTOM_ASR_PRESET_ID,
    label: "其他 / 自定义",
    provider: "",
    baseUrl: "",
    defaultModel: "",
  },
];

function matchAsrPreset(provider: string, baseUrl: string): string {
  const normalizedProvider = provider.trim().toLowerCase();
  const normalizedBaseUrl = baseUrl.trim().replace(/\/+$/, "").toLowerCase();
  if(!normalizedProvider && !normalizedBaseUrl) return "";
  return (
    ASR_PROVIDER_PRESETS.find(
      (preset) =>
        preset.id !== CUSTOM_ASR_PRESET_ID &&
        (preset.provider === normalizedProvider ||
          preset.baseUrl.toLowerCase() === normalizedBaseUrl),
    )?.id ?? CUSTOM_ASR_PRESET_ID
  );
}

// [T-132] 多模态卡 kind → onboarding stepKey(?highlight=<stepKey> 深链落地定位)。
// 只映射 onboarding 清单里有对应步的 kind;embed/vision 无 onboarding 步 → undefined
// (不加 data-highlight,不影响定位)。
const MULTIMODAL_HIGHLIGHT_KEY: Record<
  | "image"
  | "video"
  | "audio"
  | "embed"
  | "vision"
  | "search"
  | "fallback",
  string | undefined
> = {
  image: "image-model",
  video: "video-model",
  audio: "asr-model",
  search: "web-search",
  embed: undefined,
  vision: undefined,
  // [T-239b] 备用对话模型无 onboarding 步 → 无深链锚点。
  fallback: undefined,
};

export function MultimodalModelCard({
  kind,
  state,
  onAudioPresetOpenChange,
}: {
  kind:
  | "image"
  | "video"
  | "audio"
  | "embed"
  | "vision"
  | "search"
  | "fallback";
  state: MultimodalModelState;
  onAudioPresetOpenChange?: (open: boolean) => void;
}) {
  const audioPresetOpenChangeRef = React.useRef(onAudioPresetOpenChange);
  React.useLayoutEffect(() => { audioPresetOpenChangeRef.current = onAudioPresetOpenChange; }, [onAudioPresetOpenChange]);
  React.useEffect(() => () => audioPresetOpenChangeRef.current?.(false), []);
  const meta = MULTIMODAL_META[kind];
  const [provider, setProvider] = React.useState<string>(state.provider);
  const [modelName, setModelName] = React.useState<string>(state.modelName);
  const [baseUrl, setBaseUrl] = React.useState<string>(state.baseUrl);
  const isAudio = kind === "audio";
  const [showAudioAdvanced, setShowAudioAdvanced] = React.useState(false);
  const [asrPresetId, setAsrPresetId] = React.useState<string>(() =>
    kind === "audio"
      ? matchAsrPreset(state.provider, state.baseUrl)
      : CUSTOM_ASR_PRESET_ID,
  );
  // [T-239b] 仅备用对话模型卡消费:文本 LLM 走 apiFormat 分派(anthropic / OpenAI 兼容),
  // 与文本模型卡同款下拉;其它多模态卡按 provider 分派,不渲此控件。
  const [apiFormat, setApiFormat] = React.useState<ApiFormat>(
    state.apiFormat ?? "anthropic",
  );
  // [T-325] 仅备用对话卡(fallback,apiFormat 分派的文本 LLM)复用供应商预设 —— 与文本
  // 模型卡同款目录。其它多模态卡按 provider 分派、字段语义不同,不挂预设(state 恒存
  // 但仅 fallback 渲染,遵守 Hooks 规则)。
  const isFallback = kind === "fallback";
  const [presetId, setPresetId] = React.useState<string>(() =>
    isFallback
      ? matchPresetByConfig(state.baseUrl, state.apiFormat ?? "anthropic")?.id ??
      CUSTOM_PRESET_ID
      : CUSTOM_PRESET_ID,
  );
  // Blank = keep the existing stored key (the read never returns the raw value).
  const [secret, setSecret] = React.useState<string>("");
  const { pending, run, error } = useModelConfigurationMutation();

  // [T-325] 备用对话卡选中预设:填 provider/baseUrl/接口格式(custom 不填)。
  const handleSelectPreset = React.useCallback((preset: ModelProviderPreset) => {
    setPresetId(preset.id);
    if(preset.id === CUSTOM_PRESET_ID) return;
    setProvider(preset.id);
    setBaseUrl(preset.baseUrl);
    setApiFormat(preset.apiFormat);
  }, []);

  const handleSelectAsrPreset = React.useCallback((id: string) => {
    setAsrPresetId(id);
    const preset = ASR_PROVIDER_PRESETS.find((item) => item.id === id);
    if(!preset || preset.id === CUSTOM_ASR_PRESET_ID) {
      setShowAudioAdvanced(true);
      return;
    }
    setProvider(preset.provider);
    setBaseUrl(preset.baseUrl);
    setModelName(preset.defaultModel);
  }, []);

  // 多数档要 provider + model 齐全;搜索档(web.search)model 选填,只需 provider(serpapi 用
  // model 当 engine、留空默认 google;bocha/tavily 无模型概念)。
  const configured =
    kind === "search"
      ? provider.trim().length > 0
      : provider.trim().length > 0 &&
      modelName.trim().length > 0 &&
      (!isAudio || state.hasSecret || secret.trim().length > 0);
  const canSave = configured && !pending;

  // One PUT upserts the whole capability row; an empty secret is omitted so a
  // re-save without re-typing the key preserves the stored one. NO apiFormat /
  // settings — the multimodal resolver ignores them.
  const save = React.useCallback(() => {
    if(!canSave) return;
    run(() =>
      client
        .putModel({
          params: { capability: meta.capability },
          query: undefined,
          body: {
            provider: provider.trim(),
            modelName: modelName.trim(),
            baseUrl: baseUrl.trim() || undefined,
            secret: secret.length > 0 ? secret : undefined,
            // [T-093] embedding 显式存 openai_chat(缺省会被落成 anthropic；
            // embedding 无 anthropic 协议)。
            // [T-239b] 备用对话模型卡存用户选的接口格式(resolveModelSpec 按它分派适配器)。
            // 其余多模态卡不带 apiFormat 不变。
            ...(kind === "embed"
              ? { apiFormat: "openai_chat" as const }
              : isFallback
                ? { apiFormat }
                : {}),
          },
        })
        .then(() => setSecret("")),
    );
  }, [
    canSave,
    run,
    kind,
    meta.capability,
    provider,
    modelName,
    baseUrl,
    apiFormat,
    isFallback,
    secret,
  ]);

  const Icon = meta.icon;
  const providerListId = `multimodal-${kind}-provider-suggestions`;

  return (
    <SectionCard
      title={meta.title}
      description={meta.description}
      action={
        state.hasSecret ? (
          <Badge
            data-slot={`multimodal-${kind}-status`}
            variant="outline"
            className="border-success/40 bg-success-soft text-success"
          >
            已配置
          </Badge>
        ) : (
          <Badge
            data-slot={`multimodal-${kind}-status`}
            variant="outline"
            className="border-border bg-surface-subtle text-muted-foreground"
          >
            未配置
          </Badge>
        )
      }
    >
      <div
        data-slot={`multimodal-${kind}-card`}
        data-capability={meta.capability}
        // [T-132] onboarding 深链高亮锚点(?highlight=<stepKey>)。stepKey 与卡 kind
        // 不完全同名(asr-model→audio、web-search→search),故显式映射。
        data-highlight={MULTIMODAL_HIGHLIGHT_KEY[kind]}
        className="flex flex-col gap-3"
      >
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Icon aria-hidden="true" className="size-4 shrink-0" />
          <span>
            {isAudio
              ? "选择供应商后只需确认模型名并填写 Key；技术参数在高级设置。"
              : "provider / model / 接口地址 / 密钥(与文本模型同款配置;密钥存本地库)"}
          </span>
        </div>
        {isAudio ? (
          <SettingsFormRow
            label="ASR 供应商"
            controlId="multimodal-audio-preset"
            help="Qwen 优先改善四川话、闽南语、吴语和粤语识别；小米 MiMo 与已有 OpenAI 兼容 ASR 仍可选。"
          >
            <Select
              value={asrPresetId}
              onValueChange={handleSelectAsrPreset}
              onOpenChange={onAudioPresetOpenChange}
            >
              <SelectTrigger
                id="multimodal-audio-preset"
                data-slot="multimodal-audio-preset-trigger"
                size="sm"
                className="w-full md:w-72"
                disabled={pending}
              >
                <SelectValue placeholder="选择 ASR 供应商" />
              </SelectTrigger>
              <SelectContent data-slot="multimodal-audio-preset-content">
                {ASR_PROVIDER_PRESETS.map((preset) => (
                  <SelectItem
                    key={preset.id}
                    value={preset.id}
                    data-slot={`multimodal-audio-preset-item-${preset.id}`}
                  >
                    {preset.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </SettingsFormRow>
        ) : null}
        {isFallback ? (
          // [T-325] 备用对话卡复用供应商预设(与文本模型卡同款)。
          <ProviderPresetRow
            idPrefix={`multimodal-${kind}`}
            presetId={presetId}
            disabled={pending}
            onSelectPreset={handleSelectPreset}
          />
        ) : null}
        <div
          hidden={isAudio && !showAudioAdvanced}
          data-slot={isAudio ? "multimodal-audio-advanced-settings" : undefined}
        >
          <SettingsFormRow
            label="提供商"
            controlId={`multimodal-${kind}-provider`}
            help={meta.providerHelp}
          >
            <Input
              id={`multimodal-${kind}-provider`}
              data-slot={`multimodal-${kind}-provider-input`}
              list={providerListId}
              value={provider}
              disabled={pending}
              placeholder={meta.providerPlaceholder}
              onChange={(event) => {
                const next = event.target.value;
                setProvider(next);
                if(isAudio) setAsrPresetId(matchAsrPreset(next, baseUrl));
              }}
              aria-label={`${meta.title}提供商`}
            />
            <datalist id={providerListId}>
              {meta.providerSuggestions.map((p) => (
                <option key={p} value={p} />
              ))}
            </datalist>
          </SettingsFormRow>
        </div>
        <SettingsFormRow
          label="模型"
          controlId={`multimodal-${kind}-model`}
          help={meta.modelHelp}
        >
          <Input
            id={`multimodal-${kind}-model`}
            data-slot={`multimodal-${kind}-model-input`}
            list={isFallback ? `multimodal-${kind}-model-suggestions` : undefined}
            value={modelName}
            disabled={pending}
            placeholder={meta.modelPlaceholder}
            onChange={(event) => setModelName(event.target.value)}
            aria-label={`${meta.title}名称`}
          />
          {/* [T-325] 备用对话卡:候选随选中预设切换;custom / 无候选时为空。 */}
          {isFallback ? (
            <datalist id={`multimodal-${kind}-model-suggestions`}>
              {presetModels(presetId).map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
          ) : null}
        </SettingsFormRow>
        <div hidden={isAudio && !showAudioAdvanced}>
          <SettingsFormRow
            label="接口地址"
            controlId={`multimodal-${kind}-base-url`}
            help="自定义 baseUrl;留空走 provider 默认。"
          >
            <Input
              id={`multimodal-${kind}-base-url`}
              data-slot={`multimodal-${kind}-base-url-input`}
              value={baseUrl}
              disabled={pending}
              placeholder={meta.baseUrlPlaceholder}
              onChange={(event) => {
                const next = event.target.value;
                setBaseUrl(next);
                if(isAudio) setAsrPresetId(matchAsrPreset(provider, next));
                // [T-325] 备用对话卡:手改地址 → 重算预设高亮(其它卡无预设,不需重算)。
                if(isFallback) {
                  setPresetId(
                    matchPresetByConfig(next, apiFormat)?.id ?? CUSTOM_PRESET_ID,
                  );
                }
              }}
              aria-label={`${meta.title}接口地址`}
            />
          </SettingsFormRow>
        </div>
        {isFallback ? (
          // [T-239b] 备用对话模型走文本 LLM 解析链 → 需要接口格式(与文本模型卡同款下拉)。
          <SettingsFormRow
            label="接口格式"
            controlId={`multimodal-${kind}-api-format`}
            help="鉴权与请求体格式(与主模型卡同义)。"
          >
            <Select
              value={apiFormat}
              onValueChange={(value) => {
                const next = value as ApiFormat;
                setApiFormat(next);
                // [T-325] 改格式 → 重算预设高亮(匹配不到 = 自定义)。
                setPresetId(
                  matchPresetByConfig(baseUrl, next)?.id ?? CUSTOM_PRESET_ID,
                );
              }}
            >
              <SelectTrigger
                id={`multimodal-${kind}-api-format`}
                data-slot={`multimodal-${kind}-api-format-trigger`}
                size="sm"
                className="w-44"
                disabled={pending}
              >
                <SelectValue placeholder="选择格式" />
              </SelectTrigger>
              <SelectContent data-slot={`multimodal-${kind}-api-format-content`}>
                {API_FORMAT_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </SettingsFormRow>
        ) : null}
        <SettingsFormRow
          label="密钥"
          controlId={`multimodal-${kind}-secret`}
          help={
            state.hasSecret
              ? "已配置;留空保持不变,填入则覆盖。"
              : `粘贴 API Key(存于本地库)。${meta.disabledHint}`
          }
        >
          <div className="flex w-full items-center gap-2">
            <Input
              id={`multimodal-${kind}-secret`}
              type="password"
              data-slot={`multimodal-${kind}-secret-input`}
              value={secret}
              disabled={pending}
              placeholder={state.hasSecret ? "已配置(留空不变)" : "粘贴 API Key"}
              onChange={(event) => setSecret(event.target.value)}
              aria-label={`${meta.title}密钥`}
            />
            {state.hasSecret ? (
              <Badge
                data-slot={`multimodal-${kind}-secret-status`}
                variant="outline"
                className="border-success/40 bg-success-soft text-success"
              >
                已配置
              </Badge>
            ) : null}
          </div>
        </SettingsFormRow>
        {isAudio ? (
          <button
            type="button"
            data-slot="multimodal-audio-advanced-toggle"
            className="w-fit text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            onClick={() => setShowAudioAdvanced((visible) => !visible)}
          >
            {showAudioAdvanced ? "收起高级设置" : "高级设置（自定义供应商）"}
          </button>
        ) : null}
        <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-start sm:justify-between">
          {/* [T-377] 测试连接:按能力走最小真实调用/最便宜鉴权探测(生图/付费搜索会真实
              调用 → 额度提示;生视频只验鉴权不真生成)。 */}
          <TestConnectionButton
            capability={meta.capability}
            slotPrefix={`multimodal-${kind}`}
            quotaHint={
              kind === "image"
                ? "生图无免费探测端点,测试会真实生成一张最小图,消耗少量额度"
                : kind === "search"
                  ? "付费搜索(bocha/tavily/serpapi)会发一次最小真实检索,消耗少量额度"
                  : null
            }
          />
          <Button
            type="button"
            data-slot={`multimodal-${kind}-save`}
            variant="outline"
            size="sm"
            disabled={!canSave}
            onClick={save}
          >
            保存{meta.title}配置
          </Button>
        </div>
      </div>
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
    </SectionCard>
  );
}

