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

import type {
  AccountSkillOverlayResource,
  CompletionPolicyV1Resource,
} from "@creatoros/contract";

// ---------------------------------------------------------------------------
// 类型
// ---------------------------------------------------------------------------

/** 一条技能列表条目(route server 侧投影,全部可序列化,客户端只读渲染 + 编辑草稿)。 */
export interface SkillItem {
  /** 当前联合目录归属账号；null 表示未选号、只展示 official 目录。 */
  readonly accountId: string | null;
  /** skill id(REGISTRY 注册 id,如 "script.draft")。 */
  readonly id: string;
  /** 当前版本标记(内置 version 或覆盖行 version)。 */
  readonly version: string;
  /** 当前账号增量行的 CAS revision；null 表示尚未定制。 */
  readonly rowRevision: number | null;
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
  /** 当前节点是否有 official completion-policy adapter，可安全编辑完整性策略。 */
  readonly completionPolicySupported: boolean;
  /** 服务端按当前账号增量合并后的完整性策略；前端只展示/编辑，不解释业务角色。 */
  readonly completionPolicy: CompletionPolicyV1Resource | null;
  /** 官方基座策略，用于向用户说明恢复后的真值。 */
  readonly officialCompletionPolicy: CompletionPolicyV1Resource | null;
  /** 当前账号是否单独覆盖了完整性策略。 */
  readonly completionPolicyCustomized: boolean;
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
  "cover.brief": {
    name: "封面方案",
    purpose:
      "硬锚立项核心信息与口播稿主张,产结构化封面文案(主标题/副标题/信息点)+ 主视觉 + 构图;封面文案过诚实门,不编造数字。",
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
  "benchmark.teardown": {
    name: "对标拆解",
    purpose: "拆解对标爆款作品的钩子与结构,提炼可借鉴要素并转成选题。",
  },
  "favorites.triage": {
    name: "收藏整理",
    purpose: "把你收藏的内容自动判别去向(知识库 / 选题 / 忽略)。",
  },
  "topic.attribution": {
    name: "爆款归因复盘",
    purpose: "从已发布作品回流,提炼可复用的爆款公式与结构。",
  },
  "topic.preference": {
    name: "选题偏好学习",
    purpose: "从你对选题的取舍中学习偏好方向,让出题更懂你。",
  },
  "trend.extract": {
    name: "热点提取",
    purpose: "从你添加的信源里抽取最新热点信号,供出选题蹭热点。",
  },
  "video.scenes": {
    name: "视频分场",
    purpose: "把口播稿按语义切成一个个画面场次,作为分镜依据。",
  },
  "video.cards": {
    name: "信息卡设计",
    purpose: "为需要强调的信息点生成画面信息卡建议。",
  },
  "video.broll": {
    name: "空镜匹配",
    purpose: "为每个场次匹配合适的空镜 / B-roll 画面。",
  },
  "video.subtitles": {
    name: "字幕生成",
    purpose: "为视频生成字幕文本。",
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
// 「已定制」判定 + 服务端联合目录投影
// ---------------------------------------------------------------------------

/**
 * 当前账号是否保存了至少一个增量字段。服务端已负责 null=删除字段的 merge 语义，
 * 客户端不再猜测空串或数组是否代表默认值。
 */
export function isOverlayCustomized(
  row: Pick<AccountSkillOverlayResource, "overlay">,
): boolean {
  return row.overlay !== null && Object.keys(row.overlay).length > 0;
}

/**
 * 服务端 official/effective 联合目录 → SkillItem。目录已经按请求账号合并并完成兼容校验，
 * 客户端只投影，不再导入本地 registry 或自行合并旧 global override。
 */
export function buildSkillItems(
  catalog: readonly AccountSkillOverlayResource[],
): SkillItem[] {
  return catalog.map((row) => ({
    accountId: row.accountId,
    id: row.skillId,
    version: row.overlayVersion ?? row.baseVersion,
    rowRevision: row.rowRevision,
    system: row.effective.system,
    template: row.effective.template,
    requiredFacets: row.effective.requiredFacets,
    tools: row.effective.tools,
    outputSchemaJson: row.effective.outputSchema
      ? JSON.stringify(row.effective.outputSchema, null, 2)
      : null,
    completionPolicySupported: row.completionPolicySupported,
    completionPolicy: row.effective.completionPolicy,
    officialCompletionPolicy: row.official.completionPolicy,
    completionPolicyCustomized:
      row.overlay?.completionPolicy !== undefined &&
      row.overlay.completionPolicy !== null,
    customized: isOverlayCustomized(row),
  }));
}
