import {MATERIAL_EXTRACT_TEMPLATE,ASSET_CLASSIFY_TEMPLATE} from './templates/asset-processing';
import {COPILOT_ASSIST_TEMPLATE} from "./templates/copilot-assist";
/**
 * 提示词模板注册表(脊柱-1 → 三位一体一等入口,SPEC §4)—— 集中持有所有 AI 能力的 skill
 * (提示词模板 ⊕ 工具集 ⊕ 输出 Zod schema),可查、可版本化、可被外部源覆盖。
 *
 * 本任务把 registry 从「只存模板文本」升格为**三位一体的一等入口**:
 *   - 一个 skill 的 `tools`(工具白名单)/ `outputSchema`(每轮输出契约)随模板对象一起入表;
 *   - 结构化节点(runStructuredNode)**从 registry 取 outputSchema**(统一防发散入口),不再散落
 *     在各 template 文件由调用方手传;
 *   - override 通道扩为两条:`overrideTemplates`(Zod 形式,代码内覆盖)+
 *     `overrideTemplatesFromConfig`(**JSON Schema 形式下发**,运行时转回校验器套用 —— SPEC §4.3
 *     配置口子,后台改 system/template/tools/outputSchema 不改代码)。
 *
 * 默认由 `registerAllTemplates()` 把内置 templates/ 全量注册;调用方启动时调一次即可。
 */
import { jsonSchema as sdkJsonSchema, type FlexibleSchema } from "ai";
import type { PromptTemplate } from "./template";
import { recoverCreativeZodOutput } from "./creative-output-recovery";
import {
  applySchemaOverride,
  exportZodToJsonSchema,
  type JsonSchema,
  type SchemaValidator,
} from "./schema-bridge";
import type {
  EditableSkillField,
  OfficialSkillBase,
} from "./effective-skill-types";

// 内置 skill(三位一体的模板本体)。registerAllTemplates 全量注册它们。
import { TOPIC_GENERATE_TEMPLATE } from "./templates/topic-generate";
import { SCRIPT_DRAFT_TEMPLATE } from "./templates/script-draft";
import {
  SCRIPT_STORYBOARD_SEGMENT_TEMPLATE,
  SCRIPT_VOICEOVER_COMPOSE_TEMPLATE,
} from "./templates/script-voiceover-storyboard";
import { PLANNING_THESIS_TEMPLATE } from "./templates/planning-thesis";
// T-086 文案审核门:L2 语义审 skill(generateObject 绑结构化报告 schema)。
import { SCRIPT_REVIEW_TEMPLATE } from "./templates/script-review";
// [T-271] 封面方案 skill(cover.brief)—— 制作封面链的「结构化产方案」位(brief/script 硬锚 + 文案诚实门)。
import { COVER_BRIEF_TEMPLATE } from "./templates/cover-brief";
import { PLANNING_CONTRACT_TEMPLATE } from "./templates/planning-contract";
import { PLANNING_OUTLINE_TEMPLATE } from "./templates/planning-outline";
import { PLATFORM_ADAPT_TEMPLATE } from "./templates/platform-adapt";
import { REVIEW_INSIGHTS_TEMPLATE } from "./templates/review-insights";
import { CALIBRATION_DIAGNOSE_TEMPLATE } from "./templates/calibration-diagnose";
import { CALIBRATION_SCORE_TEMPLATE } from "./templates/calibration-score";
import { RESEARCH_GATHER_TEMPLATE } from "./templates/research-gather";
import { RECONSTRUCT_PROJECT_TEMPLATE } from "./templates/reconstruct-project";
import { POSITIONING_GENERATE_TEMPLATE } from "./templates/positioning-generate";
import { TOPIC_ENRICH_TEMPLATE } from "./templates/topic-enrich";
import { MATERIAL_MATCH_TEMPLATE } from "./templates/material-match";
import { CHATBOX_TOPIC_TEMPLATE } from "./templates/chatbox-turn";
import { KNOWLEDGE_CLASSIFY_TEMPLATE } from "./templates/knowledge-classify";
import { KNOWLEDGE_DISTILL_TEMPLATE } from "./templates/knowledge-distill";
import { KNOWLEDGE_RELATE_TEMPLATE } from "./templates/knowledge-relate";
import { COMMENT_QA_SIFT_TEMPLATE } from "./templates/comment-qa-sift";
// [T-212c] 对标爆款拆解 skill（benchmark.teardown）—— 爆款拆解 → 换角度转化选题（generateObject 绑结构化 schema）。
import { BENCHMARK_TEARDOWN_TEMPLATE } from "./templates/benchmark-teardown";
import { INTELLIGENCE_TOPIC_DECOMPOSE_TEMPLATE } from "./templates/intelligence-topic-decompose";
import { INTELLIGENCE_TOPIC_FROM_DECOMPOSITION_TEMPLATE } from "./templates/intelligence-topic-from-decomposition";
import { INTELLIGENCE_TOPIC_ADAPTED_DRAFT_TEMPLATE } from "./templates/intelligence-topic-adapted-draft";
// [T-212d] 防茧房校准 skill（topic.preference）—— 淘汰原因批 → 结构化偏好信号（≥3 硬门在 backend 护栏强制）。
import { TOPIC_PREFERENCE_DISTILL_TEMPLATE } from "./templates/topic-preference-distill";
// [T-235b] 热点信源信号抽取 skill(trend.extract)—— 信源页正文 → 结构化信号(无热度不编,诚实门)。
import { TREND_EXTRACT_TEMPLATE } from "./templates/trend-extract";
// [T-235d] 正向归因回流 skill(topic.attribution)—— 已发布作品实绩 → 选题维度枚举化归因 + 实验选题。
import { TOPIC_ATTRIBUTION_TEMPLATE } from "./templates/topic-attribution";
// [T-235d-distill] 收藏夹作品判库 skill(favorites.triage)—— 他人收藏逐字稿 → 是否值得进知识库裁决(knowledge/topic/skip,先判库再落)。
import { FAVORITES_TRIAGE_TEMPLATE } from "./templates/favorites-triage";
// [T-254b] 制作视频四决策 skill(video.scenes/cards/broll/subtitles)—— SRT+口播稿(+素材清单)→
// 结构化决策 JSON(零代码生成;动态约束由 backend runner 以 outputSchema 逃生口 refine)。
import {
  VIDEO_SCENES_TEMPLATE,
  VIDEO_CARDS_TEMPLATE,
  VIDEO_BROLL_TEMPLATE,
  VIDEO_SUBTITLES_TEMPLATE,
  VIDEO_DIRECTOR_TEMPLATE,
} from "./templates/video-decisions";
import {
  CHATBOX_CALIBRATION_TEMPLATE,
  CHATBOX_POSITIONING_TEMPLATE,
  CHATBOX_REVIEW_TEMPLATE,
  CHATBOX_DISTILL_TEMPLATE,
} from "./templates/chatbox-surfaces";
import { CREATOROS_GUIDE_TEMPLATE } from "./templates/creatoros-guide";

const REGISTRY = new Map<string, PromptTemplate>();
// T-513 official management truth: account/runtime overrides never mutate this map.
const OFFICIAL_REGISTRY = new Map<string, PromptTemplate>();
const DEFAULT_EDITABLE_FIELDS: readonly EditableSkillField[] = [
  "system",
  "template",
  "tools",
  "requiredFacets",
  "outputSchema",
  "completionPolicy",
];
const FACET_NAME = /^[a-z][A-Za-z0-9_]{0,63}$/;
const PLACEHOLDER = /\{\{\s*([\w.]+)\s*\}\}/g;

/**
 * JSON Schema 形式下发的输出契约覆盖(配置口子的运行时态)。key=skill id。
 * 一旦某 id 有此覆盖,resolveOutputSchema 优先用它(SDK jsonSchema 包给 generateObject 发模型 +
 * ajv 校验器卡形状),压过模板内置的 Zod outputSchema —— 即「后台改契约,运行时套用,不改代码」。
 */
const SCHEMA_OVERRIDES = new Map<string, SchemaValidator>();

/** 全部内置 skill(三位一体)。 */
const BUILTIN_TEMPLATES: readonly PromptTemplate[] = [
  COPILOT_ASSIST_TEMPLATE,
  CREATOROS_GUIDE_TEMPLATE,
  TOPIC_GENERATE_TEMPLATE,
  SCRIPT_DRAFT_TEMPLATE,
  SCRIPT_STORYBOARD_SEGMENT_TEMPLATE,
  SCRIPT_VOICEOVER_COMPOSE_TEMPLATE,
  PLANNING_THESIS_TEMPLATE,
  // T-086 文案审核门 L2 语义审(script.review)。
  SCRIPT_REVIEW_TEMPLATE,
  // [T-271] 封面方案:立项 brief(核心信息/内容形式)+ 口播稿主张硬锚 → 结构化封面文案 + 主视觉 + 构图。
  COVER_BRIEF_TEMPLATE,
  PLANNING_CONTRACT_TEMPLATE,
  PLANNING_OUTLINE_TEMPLATE,
  PLATFORM_ADAPT_TEMPLATE,
  REVIEW_INSIGHTS_TEMPLATE,
  CALIBRATION_DIAGNOSE_TEMPLATE,
  CALIBRATION_SCORE_TEMPLATE,
  RESEARCH_GATHER_TEMPLATE,
  RECONSTRUCT_PROJECT_TEMPLATE,
  MATERIAL_EXTRACT_TEMPLATE,ASSET_CLASSIFY_TEMPLATE,
  POSITIONING_GENERATE_TEMPLATE,
  TOPIC_ENRICH_TEMPLATE,
  MATERIAL_MATCH_TEMPLATE,
  CHATBOX_TOPIC_TEMPLATE,
  // T-062c 知识倾倒场:倒入原文 → 判 {knowledgeType,title,tags,summary} 候选(确认门采纳才落库)。
  KNOWLEDGE_CLASSIFY_TEMPLATE,
  // T-079b 知识蒸馏:倒入原文 → 一批四原子知识候选 {atoms,suggestedTags}(批量确认门采纳才落库)。
  KNOWLEDGE_DISTILL_TEMPLATE,
  // T-091 图谱 AI 建边:原子清单 → 候选语义边 {candidates}(确认门采纳才 relations.create,createdByType='ai')。
  KNOWLEDGE_RELATE_TEMPLATE,
  // T-092 评论回流蒸馏筛:评论批 → qa 原子候选 {candidates}(只留真疑问+同义合并;确认门采纳才落库)。
  COMMENT_QA_SIFT_TEMPLATE,
  // [T-212c] 对标爆款拆解:一条爆款对标作品 + 本账号定位 → 六段拆解 + 换角度转化选题(high 才进池)。
  BENCHMARK_TEARDOWN_TEMPLATE,
  // [T-482] 内容雷达：只有用户手动转写完成后，才按完整逐字稿拆结构并生成本账号选题候选。
  INTELLIGENCE_TOPIC_DECOMPOSE_TEMPLATE,
  // [T-589] 同一逐字稿已有拆解证据时，只重新生成选题字段，避免重复发送整篇逐字稿。
  INTELLIGENCE_TOPIC_FROM_DECOMPOSITION_TEMPLATE,
  INTELLIGENCE_TOPIC_ADAPTED_DRAFT_TEMPLATE,
  // [T-212d] 防茧房校准:淘汰原因批 → 结构化偏好信号(avoid/prefer + keyword + supportingCount)。
  TOPIC_PREFERENCE_DISTILL_TEMPLATE,
  // [T-235b] 热点信源信号抽取:信源页正文 → 结构化信号列表(无热度/链接/时间一律 null 不编)。
  TREND_EXTRACT_TEMPLATE,
  // [T-235d] 正向归因回流:已发布作品(表现分层+真逐字稿)→ 枚举化归因 + 下一轮实验选题(≤3 进池)。
  TOPIC_ATTRIBUTION_TEMPLATE,
  // [T-235d-distill] 收藏夹判库:他人收藏逐字稿 → knowledge/topic/skip 裁决(先判库,knowledge 才走蒸馏确认门)。
  FAVORITES_TRIAGE_TEMPLATE,
  // [T-254b] 制作视频四决策:①语义分场(边界落 SRT 行)②信息卡(六 kind,原文提取禁编造)
  // ③B-roll(清单真实 id,精确匹配禁近似)④双语字幕(行数/时间轴不变)。
  VIDEO_SCENES_TEMPLATE,
  VIDEO_CARDS_TEMPLATE,
  VIDEO_BROLL_TEMPLATE,
  VIDEO_SUBTITLES_TEMPLATE,
  VIDEO_DIRECTOR_TEMPLATE,
  CHATBOX_CALIBRATION_TEMPLATE,
  CHATBOX_POSITIONING_TEMPLATE,
  CHATBOX_REVIEW_TEMPLATE,
  // T-094 蒸馏对话面:粘原文 → knowledge.distill 工具 → 确认门卡采纳(倾倒场入口 Copilot 化)。
  CHATBOX_DISTILL_TEMPLATE,
];

/** 注册(或覆盖)一个 skill(含 tools/outputSchema 随对象入表)。后注册的同 id 覆盖先前的。 */
export function registerTemplate(tpl: PromptTemplate): void {
  REGISTRY.set(tpl.id, tpl);
  OFFICIAL_REGISTRY.set(tpl.id, tpl);
}

/** 全量注册内置 skill(启动调一次)。 */
export function registerAllTemplates(): void {
  for (const tpl of BUILTIN_TEMPLATES) {
    REGISTRY.set(tpl.id, tpl);
    OFFICIAL_REGISTRY.set(tpl.id, tpl);
  }
}

function ensureOfficialRegistry(): void {
  if (OFFICIAL_REGISTRY.size === 0) registerAllTemplates();
}

function freezeOfficialTemplate(tpl: PromptTemplate): PromptTemplate {
  return Object.freeze({
    ...tpl,
    requiredFacets: Object.freeze([...tpl.requiredFacets]),
    contextRequirements: tpl.contextRequirements
      ? Object.freeze([...tpl.contextRequirements])
      : undefined,
    tools: tpl.tools ? Object.freeze([...tpl.tools]) : undefined,
    availableFacets: tpl.availableFacets
      ? Object.freeze([...tpl.availableFacets])
      : undefined,
    editableFields: tpl.editableFields
      ? Object.freeze([...tpl.editableFields])
      : undefined,
  });
}

/** T-513 管理面 official-only API：不读 active snapshot，也不含账号覆盖。 */
export function getOfficialTemplate(id: string): PromptTemplate {
  ensureOfficialRegistry();
  const tpl = OFFICIAL_REGISTRY.get(id);
  if (!tpl) throw new Error(`official prompt template 未注册: ${id}`);
  return freezeOfficialTemplate(tpl);
}

export function listOfficialTemplates(): PromptTemplate[] {
  ensureOfficialRegistry();
  return [...OFFICIAL_REGISTRY.values()]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map(freezeOfficialTemplate);
}

export function exportOfficialSkillSchema(id: string): JsonSchema | null {
  const tpl = getOfficialTemplate(id);
  return tpl.outputSchema ? exportZodToJsonSchema(tpl.outputSchema) : null;
}

function officialAvailableFacets(tpl: PromptTemplate): string[] {
  if (tpl.availableFacets) return [...new Set(tpl.availableFacets)].sort();
  const facets = new Set(tpl.requiredFacets);
  for (const match of tpl.template.matchAll(PLACEHOLDER)) {
    const facet = match[1];
    if (facet && FACET_NAME.test(facet)) facets.add(facet);
  }
  return [...facets].sort();
}

function deepFreezeOfficial<T>(value: T, seen = new Set<object>()): T {
  if (typeof value !== "object" || value === null || seen.has(value)) {
    return value;
  }
  seen.add(value);
  for (const child of Object.values(value)) {
    deepFreezeOfficial(child, seen);
  }
  return Object.freeze(value);
}

export function getOfficialSkillBase(id: string): OfficialSkillBase | null {
  ensureOfficialRegistry();
  const tpl = OFFICIAL_REGISTRY.get(id);
  if (!tpl) return null;
  const base: OfficialSkillBase = {
    skillId: tpl.id,
    baseVersion: tpl.version,
    methodSystem: tpl.system,
    template: tpl.template,
    tools: [...(tpl.tools ?? [])],
    requiredFacets: [...tpl.requiredFacets],
    contextRequirements: [...(tpl.contextRequirements ?? [])],
    availableFacets: officialAvailableFacets(tpl),
    editableFields: [...(tpl.editableFields ?? DEFAULT_EDITABLE_FIELDS)],
    outputSchema: tpl.outputSchema
      ? exportZodToJsonSchema(tpl.outputSchema)
      : null,
    completionPolicy: tpl.completionPolicy
      ? structuredClone(tpl.completionPolicy)
      : null,
    completionPolicyAdapter: tpl.completionPolicyAdapter
      ? { ...tpl.completionPolicyAdapter }
      : null,
  };
  return deepFreezeOfficial(base);
}

export function listOfficialSkillBases(): OfficialSkillBase[] {
  return listOfficialTemplates()
    .map((tpl) => getOfficialSkillBase(tpl.id))
    .filter((base): base is OfficialSkillBase => base !== null);
}

/** 按 id 取 skill;未注册即抛错(调用方应保证能力已注册)。 */
export function getTemplate(id: string): PromptTemplate {
  // 惰性 bootstrap:registry 空 → 先注册内置 skill。任何 resolve 前自愈,
  // 让无显式 registerAllTemplates 的调用方(如 /api/chat 的 chat-runner)也能取到内置 skill
  // (修真机 bug:对话面发诊断 → 「prompt template 未注册: chatbox.calibration」400)。
  // 幂等(仅 size===0 时跑),不改"先注册自定义再取"的测试语义。
  if (REGISTRY.size === 0) registerAllTemplates();
  const tpl = REGISTRY.get(id);
  if (!tpl) {
    throw new Error(`prompt template 未注册: ${id}`);
  }
  return tpl;
}

/**
 * 输出恢复是官方代码策略，不随 prompt/schema 的账号覆盖下发。判断/控制型默认 strict；
 * 只有官方模板显式声明 creative-partial 才允许局部丢弃坏字段/坏候选。
 */
export function normalizeOfficialOutput(id: string, value: unknown): unknown {
  ensureOfficialRegistry();
  const official = OFFICIAL_REGISTRY.get(id);
  if (
    official?.outputRecovery !== "creative-partial" ||
    !official.outputSchema
  ) {
    return value;
  }
  return recoverCreativeZodOutput(official.outputSchema, value);
}

export function isCreativePartialOutput(id: string): boolean {
  ensureOfficialRegistry();
  return OFFICIAL_REGISTRY.get(id)?.outputRecovery === "creative-partial";
}

/** 是否已注册某能力。 */
export function hasTemplate(id: string): boolean {
  return REGISTRY.has(id);
}

/**
 * 列出当前 registry 内**全部**已注册 skill(T-077a 技能管理面只读入口)。
 * - 惰性 bootstrap 与 getTemplate 同款:registry 空 → 先注册内置,保证「设置 → 技能」页
 *   在任何装配顺序下都能列出 18+ 个内置 skill。
 * - 返回值反映当前生效态(含 overrideTemplates / overrideTemplatesFromConfig 套用后的文本),
 *   按注册插入序稳定输出;返回浅拷贝数组,调用方改数组不影响 registry 本体。
 */
export function listTemplates(): PromptTemplate[] {
  if (REGISTRY.size === 0) registerAllTemplates();
  return [...REGISTRY.values()];
}

/**
 * 取某 skill 的工具白名单(三位一体「工具集」位)。未声明 → 空数组(该 skill 不挂工具)。
 * ChatBox 按 ChatContext 解析 skill 后,据此过滤可暴露给模型的 tools(SPEC §3.2/§4.1)。
 */
export function getTools(id: string): readonly string[] {
  return getTemplate(id).tools ?? [];
}

/**
 * 取某 skill 的「每轮输出契约」并解析成 generateObject/streamObject 可直接绑的 schema
 * (三位一体「输出 Zod schema」位的**统一收口点**,SPEC §4.2 防发散入口)。
 *
 * 解析优先级:
 *   1. 该 id 有 JSON Schema 配置覆盖(overrideTemplatesFromConfig 下发)→ 用 SDK `jsonSchema()` 包
 *      原始 JSON Schema(发模型) + 注入 ajv 校验器(卡形状)。即「后台改契约,运行时套用」。
 *   2. 否则用模板内置的 Zod outputSchema(代码内 Zod,本期默认路径)。
 *   3. 模板既无覆盖也无 outputSchema(纯生成节点)→ 抛错(该能力不该走结构化节点)。
 */
export function resolveOutputSchema(id: string): FlexibleSchema<unknown> {
  const override = SCHEMA_OVERRIDES.get(id);
  if (override) {
    // SDK jsonSchema 包:原始 JSON Schema 发给模型(让它知道该吐什么);validate 用回灌的 ajv
    // 校验器卡形状(校验失败由 Vercel SDK 自动重试,与 Zod 路径同义)。
    return sdkJsonSchema(override.jsonSchema as never, {
      validate: (value) => {
        const r = override.validate(value);
        return r.valid
          ? { success: true, value }
          : {
              success: false,
              error: new Error(
                `outputSchema(JSON Schema 覆盖)校验失败: ${
                  r.errors[0]?.message ?? "shape mismatch"
                }`,
              ),
            };
      },
    });
  }
  const tpl = getTemplate(id);
  if (!tpl.outputSchema) {
    throw new Error(
      `skill "${id}" 未声明 outputSchema(也无 JSON Schema 覆盖),不能走结构化节点`,
    );
  }
  return tpl.outputSchema;
}

/** 该 skill 是否带「每轮输出契约」(内置 Zod 或 JSON Schema 覆盖任一)。 */
export function hasOutputSchema(id: string): boolean {
  return SCHEMA_OVERRIDES.has(id) || Boolean(REGISTRY.get(id)?.outputSchema);
}

/**
 * 把某 skill 的「每轮输出契约」导出成 JSON Schema(配置口子「导出」方向,SPEC §4.3)。
 * 供后台/服务端把当前契约取出来编辑;无 outputSchema → 返回 null。
 * 注:已有 JSON Schema 覆盖时,直接回该覆盖的原始 JSON Schema(所见即所配)。
 */
export function exportSkillSchema(id: string): JsonSchema | null {
  const override = SCHEMA_OVERRIDES.get(id);
  if (override) return override.jsonSchema;
  const tpl = getTemplate(id);
  return tpl.outputSchema ? exportZodToJsonSchema(tpl.outputSchema) : null;
}

/**
 * 用外部源的一批 skill **覆盖内置(Zod 形式,代码内覆盖)**。按 id 覆盖,tools/outputSchema 随对象
 * 一起替换;不在列表里的保持内置。代码内 A/B、灰度走这条。
 */
export function overrideTemplates(templates: readonly PromptTemplate[]): void {
  for (const tpl of templates) REGISTRY.set(tpl.id, tpl);
}

/** 一条「配置面/服务端下发」的 skill 覆盖(JSON Schema 形式,SPEC §4.3 配置载体)。 */
export interface SkillConfigOverride {
  /** 目标 skill id(必填)。 */
  id: string;
  /** 覆盖版本(可选,纯标记)。 */
  version?: string;
  /** 覆盖 system(可选)。 */
  system?: string;
  /** 覆盖 user template(可选)。 */
  template?: string;
  /** 覆盖必需 facet(可选)。 */
  requiredFacets?: readonly string[];
  /** 覆盖工具白名单(可选)。 */
  tools?: readonly string[];
  /**
   * 覆盖每轮输出契约 —— **以 JSON Schema 形式下发**(Zod 不可序列化)。运行时转回 ajv 校验器
   * (applySchemaOverride)套用。非法 JSON Schema 会在此抛错(显式失败,不静默)。
   */
  outputSchema?: JsonSchema;
}

/**
 * 用「配置面/服务端下发」的一批覆盖套用到 registry(SPEC §4.3 核心口子)。
 * 后台改的是 `system/template/tools/outputSchema(JSON Schema)` —— 运行时调本函数套用,**不改代码**:
 *   - 文本/白名单字段就地覆盖到 registry 的 PromptTemplate;
 *   - outputSchema(JSON Schema)经 applySchemaOverride 转回校验器,存进 SCHEMA_OVERRIDES,
 *     resolveOutputSchema 即优先用它绑 generateObject。
 * 目标 id 必须已注册(覆盖既有 skill;凭空建新 skill 不走这条)。
 */
export function overrideTemplatesFromConfig(
  overrides: readonly SkillConfigOverride[],
): void {
  for (const ov of overrides) {
    const base = REGISTRY.get(ov.id);
    if (!base) {
      throw new Error(
        `overrideTemplatesFromConfig: 目标 skill 未注册,不能覆盖: ${ov.id}`,
      );
    }
    // 文本/白名单字段:就地覆盖(未给的保持原值)。outputSchema 不放进 PromptTemplate(它是
    // JSON Schema,不是 Zod),改走 SCHEMA_OVERRIDES。
    const next: PromptTemplate = {
      ...base,
      version: ov.version ?? base.version,
      system: ov.system ?? base.system,
      template: ov.template ?? base.template,
      requiredFacets: ov.requiredFacets ?? base.requiredFacets,
      tools: ov.tools ?? base.tools,
    };
    REGISTRY.set(ov.id, next);
    if (ov.outputSchema !== undefined) {
      // 转回运行时校验器(非法 JSON Schema 在此抛错)。
      SCHEMA_OVERRIDES.set(ov.id, applySchemaOverride(ov.outputSchema));
    }
  }
}

/** 撤掉某 id 的 JSON Schema 输出契约覆盖(回落到模板内置 Zod outputSchema)。 */
export function clearSchemaOverride(id: string): void {
  SCHEMA_OVERRIDES.delete(id);
}

/**
 * 清空**所有** config 通路下发的 JSON Schema 输出契约覆盖(全部回落到内置 Zod)。
 *
 * T-040c 热更用:SCHEMA_OVERRIDES 只由 `overrideTemplatesFromConfig` 写入,故它整体 = 配置面
 * 下发的 schema 状态。`applySkillConfigOverridesFromDb` 读全表当单一真值,重套前先调本函数清空,
 * 再逐行按当前表内容重建 —— 于是「撤掉某行的 outputSchema」能真正热更生效(不清则旧 schema 粘住)。
 * 注意:`registerAllTemplates()` 只重置 REGISTRY 的文本/模板字段,**不碰** SCHEMA_OVERRIDES,故需本函数。
 */
export function clearAllSchemaOverrides(): void {
  SCHEMA_OVERRIDES.clear();
}

/** 测试/重置用:清空注册表 + schema 覆盖。 */
export function _resetRegistry(): void {
  REGISTRY.clear();
  OFFICIAL_REGISTRY.clear();
  SCHEMA_OVERRIDES.clear();
}
