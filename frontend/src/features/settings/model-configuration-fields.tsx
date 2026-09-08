"use client";
import { SettingsFormRow } from "./settings-form-row";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  MODEL_PROVIDER_PRESETS,
  type ModelProviderPreset
} from "./model-provider-presets";

export type ApiFormat = "anthropic" | "openai_chat" | "openai_responses";

export const API_FORMAT_OPTIONS: ReadonlyArray<{ value: ApiFormat; label: string }> = [
  { value: "anthropic", label: "Anthropic 兼容" },
  { value: "openai_chat", label: "OpenAI Chat 兼容" },
  { value: "openai_responses", label: "OpenAI Responses" },
];

// Free-form provider suggestions — the input is NOT restricted to these (bind any
// vendor: an Anthropic relay, MiniMax, an OpenAI-compatible gateway, etc.).
export const PROVIDER_SUGGESTIONS: ReadonlyArray<string> = [
  "anthropic",
  "minimax",
  "openai",
  "new-api",
  "google",
  "deepseek",
];

// [T-325] 供应商预设行 —— cc-switch 风格「选一家 → 一次性填 baseUrl/接口格式/模型候选」。
// 复用于文本模型卡(ModelConfigurationCard)与备用对话卡(MultimodalModelCard/fallback):
// 两者都是「apiFormat 分派的文本 LLM」,预设目录(MODEL_PROVIDER_PRESETS)对它们同义。
// presetId 由宿主卡按当前 (baseUrl, apiFormat) 反推(matchPresetByConfig)得出并高亮;
// 选中回调把整条预设交给宿主卡填充(custom → 宿主不填,回全自由填)。用现有 shadcn
// Select,与「接口格式」下拉同款。
export function ProviderPresetRow({
  idPrefix,
  presetId,
  disabled,
  onSelectPreset,
}: {
  /** data-slot / controlId 前缀,如 "model" | "multimodal-fallback"。 */
  idPrefix: string;
  /** 当前高亮的预设 id(宿主卡按 baseUrl/apiFormat 反推;匹配不到 = custom)。 */
  presetId: string;
  disabled: boolean;
  /** 选中某预设 → 交回宿主卡决定如何填充字段。 */
  onSelectPreset: (preset: ModelProviderPreset) => void;
}) {
  return (
    <SettingsFormRow
      label="供应商预设"
      controlId={`${idPrefix}-preset`}
      help="选一个供应商快速填入接口地址 / 格式;所有字段仍可自由改(参考起始值,可能随供应商变动)。模型名一律自由填(不预置候选,以服务商最新为准)。选「自定义」不填充。"
    >
      <Select
        value={presetId}
        onValueChange={(id) => {
          const preset = MODEL_PROVIDER_PRESETS.find((p) => p.id === id);
          if(preset) onSelectPreset(preset);
        }}
      >
        <SelectTrigger
          id={`${idPrefix}-preset`}
          data-slot={`${idPrefix}-preset-trigger`}
          size="sm"
          className="w-full md:w-72"
          disabled={disabled}
        >
          <SelectValue placeholder="选择供应商" />
        </SelectTrigger>
        <SelectContent data-slot={`${idPrefix}-preset-content`}>
          {MODEL_PROVIDER_PRESETS.map((preset) => (
            <SelectItem
              key={preset.id}
              value={preset.id}
              data-slot={`${idPrefix}-preset-item-${preset.id}`}
            >
              {preset.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </SettingsFormRow>
  );
}

// ---------------------------------------------------------------------------
// TestConnectionButton — [T-377] 每个 capability 配置卡的「测试连接」
// ---------------------------------------------------------------------------
//
// 点击 → settings.models.test(composition-only op,host 侧按该 capability **现有解析链**
// 解析「已保存」的配置 → 发一次最小真实调用 / 最便宜鉴权探测,策略见
// server/settings-model-test-wrap.ts 头注)→ 诚实渲三态「✓ 连通」/「⚠ 无法探测(非失败,
// T-384)」/「✗ 失败:<真实原因>」。
// 注意:测的是**已保存**的配置 —— 表单里没保存的草稿不参与(hint 里明示)。
