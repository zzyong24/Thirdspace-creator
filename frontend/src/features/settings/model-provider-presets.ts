/**
 * model-provider-presets.ts — CC Switch 风格「供应商预设目录」(T-325)
 *
 * 给「模型配置」表单一个开箱即用的供应商起点:在表单顶部选中某预设 → 一次性
 * 自动填入「接口地址」(baseUrl)/「接口格式」(apiFormat),并把「模型」输入的
 * 候选下拉切成该家常用 model id。选「自定义」则不填充,回到全自由填。
 *
 * 重要(与 cc-switch 同理念):baseUrl 与 models 都是**参考起始值**,不是永久真值
 * —— 供应商随时可能改端点 / 上下线模型。UI 明示所有字段仍可自由编辑,预设只做
 * 「一次性填充」的起点;真正生效仍以用户粘的 key + 可改字段为准。
 *
 * apiFormat 是 wire protocol,与后端 model-config 契约一致:anthropic /
 * openai_chat / openai_responses。Responses 不再被视为 Codex 私有协议;OpenAI
 * 官方和 New API 等中转站可直接使用 `/responses`。
 */

export type PresetApiFormat =
  | "anthropic"
  | "openai_chat"
  | "openai_responses";

export interface ModelProviderPreset {
  /** 稳定的机器 id;选中时也用作「提供商」输入框的默认填充值。 */
  readonly id: string;
  /** 面向用户的显示名(下拉里显示这个)。 */
  readonly label: string;
  /** 接口格式:决定鉴权与请求体形状(后端按它分派适配器)。 */
  readonly apiFormat: PresetApiFormat;
  /**
   * 参考 baseUrl(可能随供应商变动,UI 明示可改)。空串 = 走该家官方默认端点
   * (如 Anthropic 官方留空即可)。
   */
  readonly baseUrl: string;
  /** [T-377] 恒为空:模型候选**不再硬编码**(供应商上新频繁,旧候选如 MiniMax-M2 会误导
   *  用户以为没有 M3 —— 2026-07-17 真机反馈)。model 名一律自由填,以服务商最新为准;
   *  字段保留是为 UI datalist 结构零改动(空数组 = 纯自由输入)。 */
  readonly models: readonly string[];
  /** 推理档能力(信息性,暂不驱动 UI):levels=分级 / toggle=开关 / none=无。 */
  readonly reasoning?: "levels" | "toggle" | "none";
  /** 备注(信息性,可选)。 */
  readonly note?: string;
}

/** 「自定义」哨兵 id —— 选中它不填充任何字段,回到全自由填。 */
export const CUSTOM_PRESET_ID = "custom";

/**
 * 起始目录(照 research 2026-07-15 §③.A 的表)。baseUrl / models 为参考起始值,
 * 全字段在 UI 里可改。新增一家供应商只需往这里追加一条,UI 与匹配逻辑零改动。
 */
export const MODEL_PROVIDER_PRESETS: readonly ModelProviderPreset[] = [
  {
    id: "anthropic",
    label: "Anthropic 官方",
    apiFormat: "anthropic",
    baseUrl: "", // 留空 = 官方默认端点
    models: [],
    reasoning: "toggle",
  },
  {
    id: "minimax",
    label: "MiniMax",
    apiFormat: "anthropic",
    baseUrl: "https://api.minimaxi.com/anthropic",
    models: [],
    reasoning: "toggle",
  },
  {
    id: "deepseek",
    label: "DeepSeek",
    apiFormat: "openai_chat",
    baseUrl: "https://api.deepseek.com",
    models: [],
    reasoning: "levels",
  },
  {
    id: "zhipu-glm",
    label: "智谱 GLM",
    apiFormat: "anthropic",
    baseUrl: "https://open.bigmodel.cn/api/anthropic",
    models: [],
    reasoning: "toggle",
  },
  {
    id: "kimi",
    label: "Kimi 开放平台",
    apiFormat: "openai_chat",
    baseUrl: "https://api.moonshot.cn/v1",
    models: [],
    reasoning: "toggle",
    note: "使用 Kimi 开放平台的 API Key；不要与 Kimi Code 会员 Key 混用。",
  },
  {
    id: "kimi-code",
    label: "Kimi Code",
    apiFormat: "openai_chat",
    baseUrl: "https://api.kimi.com/coding/v1",
    models: [],
    reasoning: "toggle",
    note: "使用 Kimi Code 会员 Key；模型 ID 以 Kimi Code 文档为准。",
  },
  {
    id: "qwen",
    label: "通义千问(百炼)",
    apiFormat: "openai_chat",
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    models: [],
    reasoning: "toggle",
  },
  {
    id: "stepfun",
    label: "阶跃 StepFun",
    apiFormat: "openai_chat",
    baseUrl: "https://api.stepfun.com/v1",
    models: [],
  },
  {
    id: "siliconflow",
    label: "硅基流动",
    apiFormat: "openai_chat",
    baseUrl: "https://api.siliconflow.cn/v1",
    models: [],
    note: "聚合平台,模型众多,可自填其它 model id。",
  },
  {
    id: "modelscope",
    label: "魔搭 ModelScope",
    apiFormat: "openai_chat",
    baseUrl: "https://api-inference.modelscope.cn/v1",
    models: [],
    note: "聚合平台,model id 请到魔搭控制台查后自填。",
  },
  {
    id: "volcengine",
    label: "火山方舟(豆包)",
    apiFormat: "openai_chat",
    baseUrl: "https://ark.cn-beijing.volces.com/api/v3",
    models: [],
    note: "也可填 ep-* 推理接入点。",
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    apiFormat: "openai_chat",
    baseUrl: "https://openrouter.ai/api/v1",
    models: [],
    note: "聚合平台,model id 形如 vendor/model,自填。",
  },
  {
    id: "openai",
    label: "OpenAI 官方",
    apiFormat: "openai_responses",
    baseUrl: "https://api.openai.com/v1",
    models: [],
  },
  {
    id: CUSTOM_PRESET_ID,
    label: "自定义",
    // 占位值:选「自定义」时 UI 不做任何填充(见 settings-interactive-region),
    // 故此处 apiFormat / baseUrl 不会被写入表单。
    apiFormat: "openai_chat",
    baseUrl: "",
    models: [],
    note: "全字段自填 —— 不做任何一次性填充。",
  },
];

/** baseUrl 归一化:去首尾空白 + 去末尾斜杠 + 小写(供匹配比较用)。 */
function normalizeBaseUrl(url: string): string {
  return url.trim().replace(/\/+$/, "").toLowerCase();
}

/**
 * 回显匹配:按当前 (baseUrl, apiFormat) 反推命中的预设,用于已保存配置回显时高亮。
 *
 * - baseUrl 归一化后与预设 baseUrl 精确比较;apiFormat 需一致。
 * - 匹配不到 → undefined(UI 显示「自定义」)。不做模糊 / 前缀匹配(避免过度工程,
 *   也避免误判)。
 * - `custom` 永不参与匹配(它是兜底项,不是可命中项)。
 *
 * 边界:空 baseUrl + anthropic → 命中 Anthropic 官方;空 baseUrl + openai_chat →
 * 无命中(目录里唯一空 baseUrl 的是 anthropic 格式)→ 自定义。目录内 baseUrl 互不
 * 重复,故命中唯一。
 */
export function matchPresetByConfig(
  baseUrl: string,
  apiFormat: PresetApiFormat,
): ModelProviderPreset | undefined {
  const target = normalizeBaseUrl(baseUrl);
  return MODEL_PROVIDER_PRESETS.find(
    (preset) =>
      preset.id !== CUSTOM_PRESET_ID &&
      preset.apiFormat === apiFormat &&
      normalizeBaseUrl(preset.baseUrl) === target,
  );
}

/** 取某预设 id 的候选 model 列表(找不到或 custom → 空数组)。 */
export function presetModels(presetId: string): readonly string[] {
  return MODEL_PROVIDER_PRESETS.find((p) => p.id === presetId)?.models ?? [];
}
