/**
 * skills-data.ts — 设置「技能」页签的纯数据层(T-077a,SPEC 2026-07-03 §1.1)。
 *
 * 客户端安全(不 import ai-worker / backend):只含
 *   - SkillItem:route(server)投影给客户端组件的可序列化技能条目;
 *   - SKILL_LABELS:全部内置 skill 的中文名 + 一句话用途词表(18+ 全覆盖);
 *   - FACET_LABELS:facets 占位符 → 中文含义词表([gate-F2] facets 说明卡数据源);
 *   - 分组(按 id 前缀:对话技能 / 创作节点 / 采集分类)、占位符提取、
 *     「已定制」判定(T-040 空串归一 undefined 语义:空串字段 = 未定制)等纯函数。
 *
 * 单测:skills-data.test.ts / skills-section.test.tsx。
 */

import type { SkillConfigOverrideResource } from "@creatoros/contract";

// ---------------------------------------------------------------------------
// 类型
// ---------------------------------------------------------------------------

/** 一条技能列表条目(route server 侧投影,全部可序列化,客户端只读渲染 + 编辑草稿)。 */
export interface SkillItem {
  /** skill id(REGISTRY 注册 id,如 "script.draft")。 */
  readonly id: string;
  /** 当前版本标记(内置 version 或覆盖行 version)。 */
  readonly version: string;
  /** 当前生效 system(override ?? 内置;空串归一后回退内置 —— T-040 语义)。 */
  readonly system: string;
  /** 当前生效 user template(同上)。 */
  readonly template: string;
  /** 必需 facets(覆盖 ?? 内置)。 */
  readonly requiredFacets: readonly string[];
  /** 工具白名单(覆盖 ?? 内置;本期只读展示)。 */
  readonly tools: readonly string[];
  /** 输出契约 JSON Schema 的 pretty JSON(无 outputSchema → null;本期只读展示)。 */
  readonly outputSchemaJson: string | null;
  /** 「已定制」徽章:settings.prompts.list 有该 id 的**有效**(归一后非空)override 字段。 */
  readonly customized: boolean;
}

/** 技能分组(SPEC §1.1:按用途分组)。 */
export interface SkillGroup {
  readonly key: SkillGroupKey;
  readonly label: string;
  readonly description: string;
  readonly items: readonly SkillItem[];
}

export type SkillGroupKey = "chat" | "creation" | "ingestion";

// ---------------------------------------------------------------------------
// 中文词表:技能名 + 一句话用途(SPEC §1.1;TOOL_TRACE_LABELS 覆盖不全故建全量词表)
// ---------------------------------------------------------------------------

export interface SkillLabel {
  /** 中文名(行标题)。 */
  readonly name: string;
  /** 一句话用途(行副标题)。 */
  readonly purpose: string;
}

/** 全部内置 skill 的中文词表(REGISTRY 18+ 个 id 全覆盖;新增 skill 缺词表时回退显 id)。 */
export const SKILL_LABELS: Readonly<Record<string, SkillLabel>> = {
  // —— 对话技能(chatbox.*)——
  "chatbox.topic": {
    name: "选题编导",
    purpose: "对话式聊选题:围绕你的想法深挖角度、产出选题候选。",
  },
  "chatbox.calibration": {
    name: "校准编导",
    purpose: "对话诊断脚本:按 rubric 给分、指出问题并给修改建议。",
  },
  "chatbox.positioning": {
    name: "定位教练",
    purpose: "对话打磨账号定位:受众 / 价值 / 表达风格的提案与迭代。",
  },
  "chatbox.review": {
    name: "复盘编导",
    purpose: "围绕单条已发布作品的真数据与评论做复盘对话。",
  },
  "chatbox.distill": {
    name: "知识蒸馏师",
    purpose: "对话里粘入原文(笔记 / 逐字稿 / 网页 / 评论),蒸馏成知识原子,采纳后进知识库。",
  },
  // —— 创作节点 ——
  "topic.generate": {
    name: "AI 出题",
    purpose: "依据账号定位与出题依据批量生成选题候选。",
  },
  "topic.enrich": {
    name: "补全选题卡",
    purpose: "把选题标题 + 角度补全成结构化选题卡(观众/目标/核心信息)。",
  },
  "script.draft": {
    name: "写文案",
    purpose: "按策划契约与大纲起草整稿口播脚本(个人风格与文案结构在此定制)。",
  },
  "script.review": {
    name: "合规审核编导",
    purpose: "发布前审核文案的抖音合规风险(L1 违禁词 + L2 语义审),给可撤销的逐条改写建议。",
  },
  "planning.thesis": {
    name: "论点树",
    purpose: "围绕选题生成中心论点与支撑论点结构。",
  },
  "planning.contract": {
    name: "策划契约",
    purpose: "生成目标观众、内容目标、核心信息等策划契约候选。",
  },
  "planning.outline": {
    name: "内容大纲",
    purpose: "依论点树与策划契约产出分段内容大纲。",
  },
  "platform.adapt": {
    name: "平台适配",
    purpose: "把成稿改写成各目标平台的发布版本(标题/文案/标签)。",
  },
  "review.insights": {
    name: "复盘提炼",
    purpose: "从作品文案、表现数据与评论提炼可沉淀的经验教训。",
  },
  "calibration.diagnose": {
    name: "编导诊断",
    purpose: "按 rubric 逐维诊断脚本并给出修改建议。",
  },
  "calibration.score": {
    name: "编导评分",
    purpose: "按 rubric 结合表现数据给作品自动打分。",
  },
  "research.gather": {
    name: "素材搜集",
    purpose: "围绕选题联网搜集论据与事实素材。",
  },
  "reconstruct.project": {
    name: "作品反推",
    purpose: "从已发布作品的逐字稿反推出项目策划与脚本结构。",
  },
  "positioning.generate": {
    name: "定位提案",
    purpose: "从账号现状生成定位(受众/价值/风格)提案。",
  },
  "material.match": {
    name: "素材匹配",
    purpose: "从素材库为脚本段落匹配可用素材。",
  },
  // —— 采集分类 ——
  "knowledge.classify": {
    name: "知识归类",
    purpose: "把倒入的原文判成知识卡候选(类型/标题/标签/摘要)。",
  },
  // T-079b 蒸馏管线:知识流入口由它替代 classify(classify 保留供他用)。
  "knowledge.distill": {
    name: "蒸馏知识",
    purpose: "把倒入的原文蒸馏成一批可独立引用的知识原子(观点/证据/金句/问题)候选。",
  },
  // T-091 知识图谱 AI 建边(候选边确认门,采纳才落库)。
  "knowledge.relate": {
    name: "知识找关联",
    purpose: "在知识原子间提议语义关联边(支撑/矛盾/引用/延伸)候选,人采纳才建边。",
  },
  // T-092 评论回流蒸馏筛(三级去噪门的 AI 层)。
  "comment.qa-sift": {
    name: "评论蒸馏",
    purpose: "从采集的观众评论里只捞真实疑问并同义合并,产出「观众问题」原子候选。",
  },
};

/** 取某 skill 的中文词条;缺词表回退用 id 本身(诚实显示,不编)。 */
export function skillLabelOf(id: string): SkillLabel {
  return SKILL_LABELS[id] ?? { name: id, purpose: "" };
}

// ---------------------------------------------------------------------------
// facets 占位符中文词表([gate-F2]:template 框下只读卡逐行「{{占位符}}:中文含义」)
// ---------------------------------------------------------------------------

/** facets 占位符 → 中文含义(requiredFacets + 模板内全部 {{x}} 占位符全覆盖)。 */
export const FACET_LABELS: Readonly<Record<string, string>> = {
  positioning: "账号定位简报(受众 / 价值主张 / 表达风格)",
  turnContext: "本轮对话上下文(页面选中对象与最新状态)",
  basisHint: "出题依据提示(蹭热点 / 知识库 / 评论洞察)",
  basisContext: "出题依据的上下文材料(热点条目 / 知识摘录 / 评论)",
  knowledgeRef: "引用的知识库条目",
  knowledge: "知识库摘录(与选题相关的沉淀)",
  learnings: "已沉淀的经验教训",
  learningsConstraint: "经验教训的使用约束(避免照抄凑数)",
  priorLearnings: "历史沉淀的经验(复盘去重用)",
  topic: "选题信息(标题 / 角度 / 选题卡)",
  title: "选题或作品标题",
  angle: "选题切入角度",
  contract: "策划契约(目标观众 / 内容目标 / 核心信息)",
  thesis: "中心论点与支撑论点(论点树)",
  outline: "内容大纲(分段结构)",
  orientation: "画幅方向(横屏 / 竖屏)",
  script: "脚本正文",
  targets: "目标发布平台列表",
  accounts: "已绑定的平台账号信息",
  current: "当前账号定位现状",
  signals: "观众信号(评论 / 数据洞察)",
  library: "素材库清单(可匹配的素材)",
  metrics: "作品表现数据",
  metricsBlock: "表现数据块(格式化后的指标)",
  rubricBlock: "评分 rubric 说明块(维度与标准)",
  subject: "复盘对象(这条作品)的信息",
  subjectTitle: "评分对象的标题",
  reviewScriptBlock: "复盘作品的文案块",
  reviewMetricsBlock: "复盘作品的表现数据块",
  reviewCommentsBlock: "复盘作品的观众评论块",
  transcript: "作品逐字稿",
  content: "待分类的原文内容",
  // T-091/T-092 知识库二期。
  atoms: "知识原子清单(id/类型/标题/出处,供提议关联边)",
  comments: "预筛后的观众评论批(signalId/点赞数/原文)",
};

/** 取某占位符的中文含义;缺词表诚实回退「(暂无说明)」。 */
export function facetLabelOf(name: string): string {
  return FACET_LABELS[name] ?? "(暂无说明)";
}

const PLACEHOLDER_RE = /\{\{\s*([\w.]+)\s*\}\}/g;

/**
 * 提取模板文本内全部 `{{x}}` 占位符名(去重、保持出现序)。
 * facets 说明卡 = requiredFacets ∪ 模板占位符(SPEC [gate-F2]:来源 requiredFacets + 词表)。
 */
export function extractPlaceholders(template: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of template.matchAll(PLACEHOLDER_RE)) {
    const name = m[1]!;
    if (!seen.has(name)) {
      seen.add(name);
      out.push(name);
    }
  }
  return out;
}

/** facets 说明卡行:占位符名 + 中文含义 + 是否必需(requiredFacets 内)。 */
export interface FacetCardRow {
  readonly name: string;
  readonly label: string;
  readonly required: boolean;
}

/** 装配 facets 说明卡行:requiredFacets 在前(标必需),模板内其余占位符跟后。 */
export function buildFacetCardRows(
  template: string,
  requiredFacets: readonly string[],
): FacetCardRow[] {
  const required = new Set(requiredFacets);
  const rows: FacetCardRow[] = requiredFacets.map((name) => ({
    name,
    label: facetLabelOf(name),
    required: true,
  }));
  for (const name of extractPlaceholders(template)) {
    if (!required.has(name)) {
      rows.push({ name, label: facetLabelOf(name), required: false });
    }
  }
  return rows;
}

// ---------------------------------------------------------------------------
// 分组(按 id 前缀)
// ---------------------------------------------------------------------------

const GROUP_META: Readonly<
  Record<SkillGroupKey, { label: string; description: string }>
> = {
  chat: {
    label: "对话技能",
    description: "各个对话面(选题 / 校准 / 定位 / 复盘)背后的编导人格。",
  },
  creation: {
    label: "创作节点",
    description: "策划、写稿、评分、复盘等创作流水线上的 AI 节点。",
  },
  ingestion: {
    label: "采集分类",
    description: "倾倒 / 采集内容时的自动归类能力。",
  },
};

/** 按 id 前缀判组:chatbox.* → 对话技能;knowledge./asset.* → 采集分类;其余 → 创作节点。 */
export function groupKeyOf(id: string): SkillGroupKey {
  if (id.startsWith("chatbox.")) return "chat";
  if (id.startsWith("knowledge.") || id.startsWith("asset.")) {
    return "ingestion";
  }
  return "creation";
}

/** 把技能条目按组归拢(稳定序:对话技能 → 创作节点 → 采集分类;空组不输出)。 */
export function groupSkills(items: readonly SkillItem[]): SkillGroup[] {
  const order: SkillGroupKey[] = ["chat", "creation", "ingestion"];
  return order
    .map((key) => ({
      key,
      label: GROUP_META[key].label,
      description: GROUP_META[key].description,
      items: items.filter((s) => groupKeyOf(s.id) === key),
    }))
    .filter((g) => g.items.length > 0);
}

// ---------------------------------------------------------------------------
// 「已定制」判定 + 生效值投影(T-040 空串归一 undefined 语义)
// ---------------------------------------------------------------------------

/** 文本字段归一:空串/纯空白 → undefined(与 server 侧 skill-config-overrides 同语义)。 */
function normText(value: string | null | undefined): string | undefined {
  return value?.trim() ? value : undefined;
}

/** string[] 字段归一:null/空数组 → undefined。 */
function normArray(
  value: readonly string[] | null | undefined,
): readonly string[] | undefined {
  return value && value.length > 0 ? value : undefined;
}

/**
 * 某条 override 行是否「有效定制」:归一后任一字段非空。
 * 恢复默认(put 空串)后行仍在但全字段归一为空 → 徽章诚实熄灭。
 */
export function isOverrideCustomized(
  row: Pick<
    SkillConfigOverrideResource,
    "system" | "template" | "tools" | "requiredFacets" | "outputSchema"
  >,
): boolean {
  return Boolean(
    normText(row.system) ??
      normText(row.template) ??
      normArray(row.tools) ??
      (row.outputSchema && Object.keys(row.outputSchema).length > 0
        ? row.outputSchema
        : undefined) ??
      normArray(row.requiredFacets),
  );
}

/** 内置模板的可序列化形状(route 从 ai-worker listTemplates 投影而来,不带 Zod)。 */
export interface BuiltinSkillShape {
  readonly id: string;
  readonly version: string;
  readonly system: string;
  readonly template: string;
  readonly requiredFacets: readonly string[];
  readonly tools: readonly string[];
  readonly outputSchemaJson: string | null;
}

/**
 * 内置模板 × override 行 → SkillItem 列表(当前生效值 = override(归一后)?? 内置)。
 * 纯函数,route(server)与单测共用;override 行找不到对应内置 id 时忽略(坏行不显)。
 */
export function buildSkillItems(
  builtins: readonly BuiltinSkillShape[],
  overrides: readonly SkillConfigOverrideResource[],
): SkillItem[] {
  const byId = new Map(overrides.map((o) => [o.id, o]));
  return builtins.map((tpl) => {
    const ov = byId.get(tpl.id);
    return {
      id: tpl.id,
      version: normText(ov?.version) ?? tpl.version,
      system: normText(ov?.system) ?? tpl.system,
      template: normText(ov?.template) ?? tpl.template,
      requiredFacets: normArray(ov?.requiredFacets) ?? tpl.requiredFacets,
      tools: normArray(ov?.tools) ?? tpl.tools,
      outputSchemaJson: tpl.outputSchemaJson,
      customized: ov ? isOverrideCustomized(ov) : false,
    };
  });
}
