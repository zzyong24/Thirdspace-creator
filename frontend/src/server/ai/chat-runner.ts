import "server-only";
import {
  streamText,
  convertToModelMessages,
  stepCountIs,
  type UIMessage,
  type ToolSet,
} from "ai";
import type { RequestContext } from "@creatoros/contract";
import type { ModelSpec } from "@creatoros/ai-worker";
import {
  assembleCreativeContext,
  formatWorksBrief,
  type ContextDeps,
} from "./creative-context";
import {
  resolveSkillForSurface,
  applyFunctionKey,
  assembleChatSystem,
  assembleSelectionContext,
  type ChatContext,
} from "./chat-context";
import {
  buildChatTools,
  ALL_CHAT_TOOL_NAMES,
  type ChatToolDeps,
  type ProjectDetailRaw,
  type PositioningDetailRaw,
  type KnowledgeDetailRaw,
  type ArtifactListRaw,
  type ArtifactTextRaw,
  type KnowledgeTextRaw,
} from "./chat-tools";
import { buildSkillsBrief } from "@/lib/chat-tool-labels";
import { buildEnrichPrompt, parseCard } from "./topic-enrich-runner";
import { buildPositioningPrompt, parseSuggestion } from "./positioning-runner";
import { parseLearnings, reviewFacets } from "./review-runner";
import { parseDiagnosis } from "./calibration-diagnose-runner";

// 上下文感知 ChatBox 的服务端装配(SPEC §3.3)—— /api/chat 路由的「大脑」,从这里调
// streamText。把路由薄壳化:路由只管鉴权 + 解析 body + 持久化;真正的「resolve skill →
// 注入 CreativeContext facets → 挂工具 → streamText」装配逻辑在此,故可单测(SPEC §7
// 「/api/chat 装配:resolve skill + 注入 context + tools 挂载」)。
//
// 铁律:全程 Vercel AI SDK(streamText + 工具);提示词 / 工具白名单 / 输出契约走 registry
// (别内联);工具结果 = 候选(execute 复用现有 runner 核心,不直接写实体)。

export interface AssembleChatDeps extends ContextDeps {
  /** 按 capability 解析用户配的 model(复用 persistence-client 的 resolveModelSpec)。 */
  resolveModelSpec: (
    ctx: RequestContext,
    capability: string,
  ) => Promise<ModelSpec>;
  /**
   * [T-084a] 联网检索端口(可选)—— gatherMaterials 的「先真联网检索」用。由 composition root
   * (persistence-client)绑:内部 resolveSearchSpec(web.search)+ 按 provider 分派 REST adapter。
   *   - probeSearchConfigured: 探测用户是否配了 web.search(honestyBlock 第 6 条 + 工具动态描述用),
   *     不打网络、只查配置;未装配 → 视为未配(诚实降级)。
   *   - searchWeb: 真执行一次联网检索,返 SearchResult[];未配抛 SearchConfigError、检索失败抛
   *     SearchExecutionError,由 gatherMaterials catch 成 model_memory 降级(不 crash)。
   * 两者都可选:未装配时 gatherMaterials 走纯记忆(与今天现状一致),honestyBlock 注未配措辞。
   */
  probeSearchConfigured?: (ctx: RequestContext) => Promise<boolean>;
  searchWeb?: (
    ctx: RequestContext,
    query: string,
    opts?: { count?: number },
  ) => Promise<
    Array<{
      title: string;
      url: string;
      snippet: string;
      publishedAt?: string;
      siteName?: string;
    }>
  >;
  /**
   * 只读 context 读端口(供 context.projects / context.knowledge / context.materials 工具)。
   * **只读、按 ctx.userId 过滤**,由 composition root(persistence-client)绑到 user-scoped 读源
   * (projects repo / knowledge service / assets service)。可选:未装配时对应工具读到空(诚实降级,
   * 不塞假数据)。与 CreativeContext 的 facet reader 不同 —— 这些是「用户问才实时拉」的按需读。
   */
  contextReaders?: ContextReaders;
  /**
   * [T-084b] material.screenshot 端口 —— 真开无头浏览器给公开 URL 截图 → createGeneratedAsset
   * 落库(带 sourceUrl 存证)→ 返回落库 asset 摘要 + 签名预览 URL。由 composition root 绑
   * (captureUrl + assetsService.createGeneratedAsset + downloadUrl)。截图/落库失败**抛错**,
   * 由工具 execute 接住转人话。可选:未装配 → 工具报「截图能力未接入」(诚实降级)。
   */
  captureScreenshotPort?: (
    ctx: RequestContext,
    input: { url: string; fullPage?: boolean },
  ) => Promise<{
    assetId: string;
    name: string;
    previewUrl: string | null;
    sourceUrl: string;
  }>;
  /**
   * [T-084c] material.generate 端口 —— dispatch 既有 asset.generate task(persistence-client
   * dispatch → void runAssetGenerate 范式),立即返回 taskId(不阻塞对话回合)。由 composition
   * root 绑(ai transport 的 ai.tasks.create,复用既有 asset.generate 分派链)。可选:未装配 →
   * 工具报「生成能力未接入」(诚实降级)。
   */
  dispatchGenerateAssetPort?: (
    ctx: RequestContext,
    input: { kind: "image" | "video"; prompt: string; projectId?: string | null },
  ) => Promise<{ taskId: string }>;
}

/**
 * 只读 context 读端口集 —— 三个工具各自的真数据源。composition root 绑真实 user-scoped 读方法;
 * 单测注入 fake。全部按当前用户过滤(由绑定处的 service/repo 用 ctx.userId 收窄)。
 */
export interface ContextReaders {
  /** 列该用户最近的项目/作品(用于 context.projects)。 */
  listProjects: (
    ctx: RequestContext,
    opts: { limit: number; offset: number },
  ) => Promise<{
    rows: Array<{
      id: string;
      title: string;
      stage: string;
      status: string;
      publishedAt?: string | null;
    }>;
    total: number;
  }>;
  /** [T-058③] 观众评论只读(audience_signals source='comment',最新在前)。 */
  listComments: (
    ctx: RequestContext,
    opts: { limit: number; offset: number },
  ) => Promise<{
    rows: Array<{
      text: string;
      likeCount: number | null;
      source: string;
      createdAt: string;
    }>;
    total: number;
  }>;
  /**
   * [T-077b] 读某项目的选题卡现状 briefDetail(用于 brief.fill 工具结果的 `current`)。
   * 复用 projects 读 op(user-scoped);读不到(项目不存在/越权)→ null,不抛(诚实降级)。
   */
  getProjectBrief: (
    ctx: RequestContext,
    opts: { projectId: string },
  ) => Promise<{
    targetAudience?: string;
    contentGoal?: string;
    contentFormat?: string;
    orientation?: "landscape" | "portrait";
    targetPlatforms?: string[];
    durationEstimate?: string;
    coreMessage?: string;
    successCriteria?: string;
  } | null>;
  /** 搜该用户知识库(用于 context.knowledge)。query 空 → 回最近若干条。 */
  searchKnowledge: (
    ctx: RequestContext,
    opts: { query: string; limit: number },
  ) => Promise<Array<{ id: string; title: string; snippet: string }>>;
  /** 搜该用户素材库 assets(用于 context.materials)。query 空 → 回最近若干条。 */
  searchMaterials: (
    ctx: RequestContext,
    opts: { query: string; limit: number },
  ) => Promise<Array<{ id: string; title: string; kind: string }>>;
  /**
   * [T-099b] context.project.detail —— 某项目全档(brief/阶段/发布/产物索引/最新指标)。
   * composition root 复用既有公开读源(projects getProject/briefDetail + artifacts
   * listProjectArtifacts/listVersions + publishing + ReviewSubjectReader 口径的最新 snapshot)。
   * 读不到(不存在/越权)→ null(诚实降级)。可选:未装配 → 工具报「查不到」(诚实空态)。
   */
  getProjectDetail?: (
    ctx: RequestContext,
    opts: { projectId: string },
  ) => Promise<ProjectDetailRaw | null>;
  /**
   * [T-099b] context.positioning.detail —— 定位母版全档(facets/downstreamRules/陈述/陈述版本数)
   * + 账号画像并入。composition root 复用 PositioningReader + AccountsReader。母版未建 → profile
   * 全空(诚实空态,不抛)。可选:未装配 → 工具报空档(诚实降级)。
   */
  getPositioningDetail?: (ctx: RequestContext) => Promise<PositioningDetailRaw>;
  /**
   * [T-099b] context.knowledge.detail —— 单条知识全字段(type/title/note/sourceNote/tags/战绩/关联)。
   * composition root 复用 knowledge getKnowledge(带 T-079c 战绩投影)+ listRevisions(正文)+
   * listRelations。读不到(不存在/越权)→ null(诚实降级)。可选:未装配 → 工具报「查不到」。
   */
  getKnowledgeDetail?: (
    ctx: RequestContext,
    opts: { id: string },
  ) => Promise<KnowledgeDetailRaw | null>;
  /**
   * [T-099c] context.artifacts —— 某项目产物清单(每类产物 artifactType/当前版本号/updatedAt/字数)。
   * composition root 复用 artifactsService.listProjectArtifacts + listVersions + 当前版本文本长度
   * (与 getScript 同口径)。读不到(不存在/越权)→ null(诚实降级)。可选:未装配 → 工具报「查不到」。
   */
  listProjectArtifacts?: (
    ctx: RequestContext,
    opts: { projectId: string },
  ) => Promise<ArtifactListRaw | null>;
  /**
   * [T-099c] context.artifact.text —— 某项目某类产物正文全文(事故二根治)。output_script 走
   * ReviewSubjectReader.getScript 同读法(transcript 优先);其它 artifactType 走当前版本 contentData
   * 正文字段。**返回原始全文**;窗口截断(§3)在工具 execute 侧强制。读不到 → null(诚实降级)。
   */
  getArtifactText?: (
    ctx: RequestContext,
    opts: { projectId: string; artifactType: string },
  ) => Promise<ArtifactTextRaw | null>;
  /**
   * [T-099c] context.knowledge.text —— 某知识条目长文正文全文(transcript/reference/note 当前修订正文,
   * 与 knowledge.detail 的 note 同读法)。**返回原始全文**;窗口截断(§3)在工具 execute 侧强制。
   * 读不到(不存在/越权)→ null(诚实降级)。可选:未装配 → 工具报「查不到」。
   */
  getKnowledgeText?: (
    ctx: RequestContext,
    opts: { id: string },
  ) => Promise<KnowledgeTextRaw | null>;
}

// 各 ChatBox skill 的「主能力档」—— 基础模型按它解析(各 surface 复用对应节点的模型配置,
// 与一键岛同一引擎)。各工具 exec 内再按自己的 capability 解析(允许不同工具配不同模型)。
const SKILL_PRIMARY_CAPABILITY: Record<string, string> = {
  "chatbox.topic": "topic.generate",
  "chatbox.calibration": "calibration.diagnose",
  "chatbox.positioning": "positioning.generate",
  "chatbox.review": "review.insights",
  // [T-094] 蒸馏对话面:基础档 + 工具都走 knowledge.distill capability(与倾倒场旧管线同档)。
  "chatbox.distill": "knowledge.distill",
};

// 通用维度评分标准(对话里没有绑定 rubric reader 时的诚实降级)—— 让 calibration.diagnose 工具
// 在 free-chat 也能逐维度盲评。一键岛带 subject 时仍走这套通用维度(对话不接库内 rubric reader,
// 避免跨模块直连 repo;真·按用户 rubric 的诊断在工作台 StartPredictionButton 那条任务链上)。
const GENERIC_RUBRIC_DIMENSIONS: ReadonlyArray<{
  key: string;
  label: string;
  description: string;
}> = [
  { key: "hook", label: "开头钩子", description: "前 3 秒能否抓住注意力" },
  { key: "value", label: "价值密度", description: "信息/情绪价值是否扎实" },
  { key: "structure", label: "结构节奏", description: "推进是否清晰不拖沓" },
  { key: "audience_fit", label: "人群契合", description: "是否打中目标受众的痛点" },
  { key: "conversion", label: "转化引导", description: "是否自然引导到信任/转化" },
];

// [T-081①] 产内容工具的 extraBrief 统一注入段头 —— 对话中获得的补充指令/洞察进生成 prompt 的
// 段标题(各工具/facet 同一措辞,单一真值)。导出供各 runner facet 拼装与单测锚定。
export const EXTRA_BRIEF_HEADING = "【本次生成指令(来自对话,优先遵循)】";

// [T-081②] positioning.generate 的真实作品画像 —— formatWorksBrief 已移到 creative-context
// (对话工具 + 后台 task 两条定位生成路径共用,单一真值);此处再导出保持既有 import 面不变。
export { formatWorksBrief, WORKS_BRIEF_MAX_ROWS } from "./creative-context";

// [T-081①] script.hooks 的 prompt 拼装 —— 从 generateHooks 内联提出为纯函数(可单测):
// 原文案不变,新增 extraBrief 段(空则整段省略,不注空噪声)。
export function buildHooksPrompt(input: {
  topic: string;
  direction?: string;
  extraBrief?: string;
  positioningBrief: string;
}): string {
  return [
    "为这条短视频内容生成 4 条口播开场 hook 候选(前 3 秒抓注意力的第一句话)。",
    input.topic
      ? `内容主题:《${input.topic}》`
      : "内容主题:见下方创作者定位,选最有张力的切入。",
    input.positioningBrief
      ? `创作者定位:
${input.positioningBrief}`
      : "",
    input.direction ? `方向要求:${input.direction}` : "",
    input.extraBrief ? `${EXTRA_BRIEF_HEADING}\n${input.extraBrief}` : "",
    '4 条彼此切角不同(如:反常识断言 / 数据冲击 / 场景代入 / 利益承诺)。每条 ≤40 字,口语化,不要书面腔。',
    '只输出 JSON 数组,形如 [{"text":"hook 文案","angle":"切角名"}],不要多余文字。',
  ]
    .filter(Boolean)
    .join("\n");
}

// 解析结果:路由把它交给 streamText 的 stream 喂回前端 + 落库。导出供单测断言「选对 skill /
// 注入了 facets / 挂对了 tools」而不真跑模型(单测注入 fake streamText 不便,故拆出
// buildChatAssembly 只做装配、不调网络,由它单测;runChatStream 串起 streamText)。
export interface ChatAssembly {
  skillId: string;
  system: string;
  tools: ToolSet;
  modelSpec: ModelSpec;
}

/**
 * 纯装配(不调模型)—— resolve skill(surface 层)→ 装配 CreativeContext facets(数据层)→
 * 拼 system → 按 skill 白名单挂工具(工具白名单层)。单测直接断言它的产物。
 *
 * 工具 execute 复用现有 runner 核心(runTopicNode / 选题卡补全),都在请求期用解析好的 model
 * 跑;故这里先解析 model(没配 key 抛 LlmCredentialError,由路由接住返 4xx,不假成功)。
 */
export async function buildChatAssembly(
  ctx: RequestContext,
  chatContext: ChatContext,
  deps: AssembleChatDeps,
): Promise<ChatAssembly> {
  // 1) 页面层:surface → 基础 skill。
  const skillId = resolveSkillForSurface(chatContext.surface);

  // 2) registry 取 skill(模板 system + 工具白名单)。懒加载 ai-worker(AI SDK 不进顶层 bundle)。
  const {
    getTemplate,
    getTools,
    modelFor,
    runTopicNode,
    runTemplatedNode,
  } = await import("@creatoros/ai-worker");
  const skill = getTemplate(skillId);
  // 工具排序层(SPEC §3.2 第 1+2 层 + [T-104]):surface 白名单 + functionKey 决定「置顶/预调」
  // 顺序(命中的专用工具排前,skillsBrief 也按此列),但 [T-104] 每个 Copilot 入口**暴露全部工具**
  // ——一个 Copilot 常需跨场景调其他工具,隔离没意义;之前选不准工具的锅在 skill 提示词不在工具集。
  // 隔离机制(getTools/applyFunctionKey)保留只作排序、可逆;会话/上下文隔离仍归 T-096 scope
  // (蒸馏对话不串味选题);数据转述幻觉由 T-098 context.* 渲染卡根治,放开 context 工具无凑数风险。
  const preferredTools = applyFunctionKey(
    getTools(skillId),
    chatContext.functionKey,
  );
  const toolWhitelist = [
    ...preferredTools,
    ...ALL_CHAT_TOOL_NAMES.filter((n) => !preferredTools.includes(n)),
  ];

  // 3) 解析 model。基础档按 skill 主能力解析(chatbox.topic/review/positioning 复用各自
  //    主工具的配置档);各工具 exec 内按自己的 capability 再解析(不同工具可配不同模型)。
  const skillCapability = SKILL_PRIMARY_CAPABILITY[skillId] ?? "topic.generate";
  const modelSpec = await deps.resolveModelSpec(ctx, skillCapability);
  const model = modelFor(modelSpec);

  // 4) 数据层:装配 CreativeContext facets(定位 / 飞轮 / 受众信号 / 知识库 / 复盘作品真材料),
  //    注进 system。T-039a:把 chatContext.projectId 真正传下去(原写死 null → 复盘/项目相关
  //    facet 永远读不到本项目),让复盘路径能拿到这条作品的真文案/标题/数据/评论;topic 从选中态
  //    标题(工作台一键岛带进来的作品标题)派生(不再恒 ""),让账号级兜底也有真主题可用。
  const context = await assembleCreativeContext(
    ctx,
    {
      projectId: chatContext.projectId ?? null,
      topic: chatContext.selection?.label?.trim() ?? "",
    },
    deps,
  );
  // 数据层 + 选中态层(T-027):先拼 CreativeContext facets,再接上"本次对话针对的选中内容"块 ——
  // 让模型一进来就知道用户"这条"指哪条,不再瞎答/反复索要标题。
  // T-039b per-action 注入矩阵:定位对话(chatbox.positioning)额外注入账号画像 accountsBrief
  // ——定位提案要立足「这个人在平台上已经是谁」;其它 surface 不注(避免账号噪声)。
  const baseSystem = assembleChatSystem(skill.system, context, {
    includeAccounts: skillId === "chatbox.positioning",
  });
  // [T-084a] 联网检索配置探测(honestyBlock 第 6.5 条 + material.gather 工具动态描述用)。
  // 只查配置、不打网络;端口未装配(probeSearchConfigured 缺省)或探测抛错 → 视为未配(诚实降级)。
  let searchConfigured = false;
  if (deps.probeSearchConfigured) {
    try {
      searchConfigured = await deps.probeSearchConfigured(ctx);
    } catch {
      searchConfigured = false;
    }
  }
  // [T-058①B] 能力边界诚实(实录复盘:模型口头宣称「已采纳写入定位母版」但 DB 未动):
  // 写库只经工具产卡+用户点采纳;禁止假承诺;工具带分页限制时如实说明。
  const honestyBlock = [
    "【能力边界 —— 必须遵守】",
    "1. 你对任何数据的写入都只有一条路径:调用对应工具产出候选卡,由用户点卡上的「采纳/写入」按钮完成。你自己没有直接写库能力。",
    "2. 绝不口头宣称「已写入/已采纳/已保存」—— 除非你看到用户明确说 TA 已点过采纳按钮。用户想落库时,引导 TA:先让你调工具产卡,再点卡上的按钮。",
    "3. 用户要新定位 → 必须调 positioning.generate 工具(产带采纳按钮的卡),不要只在文本里写定位 —— 文本无法被采纳。",
    "4. 工具有分页/条数上限时,如实告知拿到了多少、还有没有更多,不要谎称已看全部。",
    // [T-081⑤] 边界诚实:不许把「工具做不到的操作」包装成可选项摆给用户(实录:模型给用户
    // 列了不存在的操作选项 → 用户点了 = 死路)。
    "5. 绝不向用户提供你的工具不具备的操作选项;做不到就直说做不到,并说明当前工具边界。",
    // [T-098] 数据转录幻觉根治(SPEC context-layer-redesign §2.3):context.* 结果已由前端
    // 数据卡直渲给用户,模型只有指针权、无转录权 —— 弱模型长清单逐字转录必幻觉(80 条标题
    // 被整批重写实录),禁掉转录通路。
    "6. context.* 工具返回的清单/详情/全文,用户已在对话中的数据卡上看到原文。你对这些数据只有指针权——可以引用条目(说第几条/哪个标题/id)、归纳统计、对比分析;禁止逐字复述清单内容(标题列表、评论原文批量照抄都算)。用户要看数据时,告诉 TA「已展示在卡片中」。",
    // [T-084a SPEC §1.3] 素材搜集诚实降级第 6 条(动态,按 resolveSearchSpec 探测结果注入):
    // 未配联网检索时,素材来自训练记忆,模型必须主动告知非实时检索,绝不假装搜过网。
    searchConfigured
      ? "7. 素材搜集(material.gather)已配置联网检索:调用后素材会先经真实联网搜索再综合,带真实来源 URL。你可以说「联网搜到」,但仍要提醒用户带 URL 的条目才是查证过的真信源、标『需核实』的是模型记忆。"
      : "7. 素材搜集(material.gather)当前**未配置联网检索**:你给出的素材来自训练记忆、不是实时检索结果。调用素材工具后,必须主动告知用户「这些素材来自我的训练记忆、非实时联网搜索,来源需你自行核实」,绝不使用「我搜到/我查到/联网搜到」等话术、绝不假装搜过网。想要真实联网素材,引导用户去设置配『联网搜索』。",
  ].join("\n");
  // [T-077c] 技能自感知(SPEC §1.3 [gate-F1]):把当前 surface 白名单的技能清单注进 system
  // (每工具一行「中文名(工具名):一句话用途」,行数=白名单工具数、上限 20 超出截断)——
  // 让模型能如实回答「你能干什么」,并在对话中主动建议(「这个我可以用『记录经验』帮你存下来」)。
  // 词表与前端工具 trace 行同源(lib/chat-tool-labels 单一真值),不编造白名单外的能力。
  const skillsBriefBlock = [
    "【你的技能清单 —— 本对话你能调用的全部工具,回答「你能干什么」时以此为准,不要编造清单外的能力】",
    buildSkillsBrief(toolWhitelist),
  ].join("\n");
  const selectionBlock = assembleSelectionContext(chatContext.selection);
  // T-039a 补:复盘对话「瞎问复盘对象」根因 —— 本项目真材料虽已装进 context(reviewSubject reader)
  // 且进了 review.analyze 工具的 facets,但**没进对话系统提示**,故 LLM 在决定调用工具前不知道复盘哪条,
  // 于是反复问「复盘对象是什么」并退回账号级泛论。这里把「本次复盘对象(真标题+文案+数据+评论)」直接
  // 注进对话 system + 强指令「别再问、直接基于它复盘」,让模型一进来就扣住这条作品。有 projectId 才注入
  // (reviewTitle/reviewScript 非空);读不到(无脚本/数据)则该行省略,不喂空噪声。
  const reviewSubjectBlock =
    context.reviewTitle || context.reviewScript || context.reviewMetrics
      ? [
          "【本次复盘对象 —— 创作者已在工作台选定这一条作品,请直接基于它提炼可复用要素,不要再问用户「复盘对象是什么」、也不要退回账号整体泛论】",
          context.reviewTitle ? `标题:《${context.reviewTitle}》` : "",
          context.reviewScript ? `文案/逐字稿:\n${context.reviewScript}` : "",
          context.reviewMetrics ? `真实数据:${context.reviewMetrics}` : "",
          context.reviewComments ? `观众评论(真实):\n${context.reviewComments}` : "",
        ]
          .filter(Boolean)
          .join("\n")
      : "";
  const system = [
    baseSystem,
    honestyBlock,
    skillsBriefBlock,
    reviewSubjectBlock,
    selectionBlock,
  ]
    .filter(Boolean)
    .join("\n\n");
  // 选中态标题 —— 工具入参兜底(模型没显式传 title/subject 时用它,避免拿空标题去诊断)。
  const selectionTitle = chatContext.selection?.label?.trim() || "";

  // 5) 工具白名单层:按 skill 白名单挂工具,execute 复用现有 runner 核心产**候选**(非实体)。
  const toolDeps: ChatToolDeps = {
    // [T-084a] 联网检索是否已配 —— 驱动 material.gather 工具的动态诚实描述(上方已探测)。
    searchConfigured,
    generateTopics: async ({ basis, extraBrief }) => {
      // 复用 ai-worker.runTopicNode —— 产 TopicItem[] 候选(与一键岛同一引擎)。
      // [T-081] extraBrief 对任意 basis 都生效:comments/knowledge 依据块后追加「本次生成指令」段
      // (原实现只在 positioning/trend 分支吃 extraBrief,评论/知识出题时对话洞察被静默丢弃)。
      const basisSource =
        basis === "comments"
          ? context.signalsBrief
          : basis === "knowledge"
            ? context.knowledgeBrief
            : "";
      const basisBrief = [
        basisSource,
        extraBrief
          ? `${EXTRA_BRIEF_HEADING}\n${extraBrief}`
          : "",
      ]
        .filter(Boolean)
        .join("\n");
      const { topics } = await runTopicNode({
        model,
        positioningBrief: context.positioningBrief,
        basisBrief,
        // [T-062b gate-F3] KNOW-X 修真:对话出题同样吃知识库参考 + 已验证经验约束
        // (basis=knowledge 时知识已进 basisBrief,置空防重复)。
        knowledgeBrief:
          basis === "knowledge" ? undefined : context.knowledgeBrief || undefined,
        learningsBrief: context.learningsBrief || undefined,
        basis,
      });
      return topics.map((t) => ({
        title: t.title,
        angle: t.angle,
        contentRole: t.contentRole,
        predictedScore: t.predictedScore,
        reason: t.reason,
        // [T-066] 原始评论引用透传到工具结果 → 候选卡渲「依据评论」。
        sourceComments: t.sourceComments,
      }));
    },
    enrichTopic: async ({ title, angle }) => {
      // 复用 topic-enrich-runner 的 enrich prompt + parseCard —— 产选题卡候选(非实体)。
      const { runAgentNode } = await import("@creatoros/ai-worker");
      const prompt = buildEnrichPrompt(context, { title, angle });
      const res = await runAgentNode({
        model,
        system:
          "你是这位创作者的选题策划 agent,把一条选题补全成完整选题卡。只输出 JSON,不要多余文字。",
        prompt,
        maxSteps: 2,
      });
      return parseCard(res.text);
    },
    generateHooks: async ({ topic, direction, extraBrief }) => {
      // [T-055c] 复用 runAgentNode 一次调用产 hook 候选组(非实体)。主题兜底:模型没传
      // topic 时用选中项目标题(稿面右栏常驻 = 当前项目)。产出走 ChatHookCard 逐条写入稿面。
      const effTopic = topic?.trim() || selectionTitle || "";
      const { runAgentNode } = await import("@creatoros/ai-worker");
      const prompt = buildHooksPrompt({
        topic: effTopic,
        direction,
        extraBrief,
        positioningBrief: context.positioningBrief,
      });
      const res = await runAgentNode({
        model,
        system:
          "你是这位创作者的口播编导,专门打磨前 3 秒开场 hook。只输出 JSON,不要多余文字。",
        prompt,
        maxSteps: 2,
      });
      return parseHookItems(res.text);
    },
    draftScript: async ({ topic, angle, extraBrief }) => {
      // [T-057⑤] 复用 runScriptNode(与旧 ScriptDraftIsland/任务链同引擎,script.draft
      // capability 的用户配模型);shots → 编辑器 sections(与 script-runner renderSections 同形)。
      const effTopic = topic?.trim() || selectionTitle || "";
      const spec = await deps.resolveModelSpec(ctx, "script.draft");
      const { runScriptNode } = await import("@creatoros/ai-worker");
      const { shots } = await runScriptNode({
        model: modelFor(spec),
        positioningBrief: context.positioningBrief,
        learningsBrief: context.learningsBrief,
        topicTitle: effTopic,
        topicAngle: angle ?? "",
        // [T-081①] 对话洞察/补充指令进整稿 prompt(script-node 空则整段省略)。
        extraBrief,
      });
      return shots.map((shot, i) => {
        const label = shot.口播 ? shot.口播.slice(0, 16) : `分镜 ${i + 1}`;
        const heading = shot.时长
          ? `${i + 1}. ${label}（${shot.时长}）`
          : `${i + 1}. ${label}`;
        const body = [
          shot.口播 && `口播：${shot.口播}`,
          shot.画面 && `画面：${shot.画面}`,
          shot.字幕 && `字幕：${shot.字幕}`,
        ]
          .filter((l): l is string => Boolean(l))
          .join("\n");
        return { heading, body };
      });
    },
    gatherMaterials: async ({ query }) => {
      // [T-057④/T-084a] 两步:①先真联网检索(searchWeb,失败/未配降级)②runResearchNode 结构化
      // 综合(检索结果前置注入,非模型工具 —— 保住任何模型都产可解析输出,ffb7951 教训)。
      const effQuery = query?.trim() || selectionTitle || "";
      // ① 联网检索(端口未装配 → 空;SearchConfigError/SearchExecutionError → catch 成空降级)。
      let searchResults: Array<{
        title: string;
        url: string;
        snippet: string;
        publishedAt?: string;
        siteName?: string;
      }> = [];
      if (deps.searchWeb && effQuery) {
        try {
          searchResults = await deps.searchWeb(ctx, effQuery, { count: 10 });
        } catch (err) {
          // 未配/检索失败 → 诚实降级纯记忆(不 crash);记日志供 dev 排查。
          console.warn(
            `[chat-runner] gatherMaterials searchWeb 降级(model_memory): ${
              err instanceof Error ? err.message : String(err)
            }`,
          );
          searchResults = [];
        }
      }
      // ② 结构化综合(research.gather capability,四类结构化素材;检索结果注入 → 模型据其填真实 URL)。
      const spec = await deps.resolveModelSpec(ctx, "research.gather");
      const { runResearchNode } = await import("@creatoros/ai-worker");
      const { items, grounding } = await runResearchNode({
        model: modelFor(spec),
        positioningBrief: context.positioningBrief,
        topicTitle: effQuery,
        searchResults,
      });
      return {
        grounding,
        items: items.map((it) => ({
          title: it.title,
          url: it.url,
          source: it.source,
          whyRelevant: it.why_relevant,
          category: it.source || "素材",
          ...(it.sourceUrl ? { sourceUrl: it.sourceUrl } : {}),
        })),
      };
    },
    // [T-084b] material.screenshot:端口未装配 → 诚实抛错(工具 execute 接住转人话渲错误态,
    // 「截图能力未接入」);装配了则真截图 → createGeneratedAsset → 返回 asset + 预览 URL。
    captureScreenshot: async ({ url, fullPage }) => {
      if (!deps.captureScreenshotPort) {
        throw new Error(
          "截图能力当前未接入(服务端未装配无头浏览器) —— 暂时无法截图。",
        );
      }
      return deps.captureScreenshotPort(ctx, { url, fullPage });
    },
    // [T-084c] material.generate:端口未装配 → 诚实抛错;装配了则 dispatch 既有 asset.generate
    // task(不直接生成,视频异步分钟级不阻塞对话回合),立即返回 taskId 供前端卡轮询。
    dispatchGenerateAsset: async ({ kind, prompt, style }) => {
      if (!deps.dispatchGenerateAssetPort) {
        throw new Error(
          "AI 生成能力当前未接入(服务端未装配生成分派) —— 暂时无法生成素材。",
        );
      }
      // style 折进 prompt(asset.generate task 的 inputData 只吃 prompt;不改既有 task 契约)。
      const effPrompt = style ? `${prompt}\n风格:${style}` : prompt;
      return deps.dispatchGenerateAssetPort(ctx, {
        kind,
        prompt: effPrompt,
        // 项目对话(chatContext.projectId)时把生成 task 挂到当前项目(采纳可绑用料链)。
        projectId: chatContext.projectId ?? null,
      });
    },
    diagnoseContent: async ({ title, script, extraBrief }) => {
      // 复用 calibration.diagnose 模板 + parseDiagnosis(与 calibration-diagnose-runner 同源)。
      // 对话里没有库内 rubric reader → 用通用维度评(诚实降级)。产诊断候选(非实体)。
      // T-027:模型没显式传 title 时用工作台选中内容的标题兜底(不拿空标题去诊断)。
      const effTitle = title?.trim() ? title : selectionTitle;
      const spec = await deps.resolveModelSpec(ctx, "calibration.diagnose");
      const rubricBlock = GENERIC_RUBRIC_DIMENSIONS.map(
        (d, i) => `${i + 1}. ${d.label}（key=${d.key}） —— ${d.description}`,
      ).join("\n");
      const { text } = await runTemplatedNode({
        model: modelFor(spec),
        // T-040b:运行时 getTemplate 取被覆盖后的 REGISTRY 对象(非 import 快照),吃服务端覆盖。
        template: getTemplate("calibration.diagnose"),
        facets: {
          positioning: context.positioningBrief
            ? context.positioningBrief
            : "（创作者尚未设置定位——按通用爆款逻辑判断）",
          learnings: context.learningsBrief
            ? `\n【过往复盘爆款要素】\n${context.learningsBrief}`
            : "",
          // [T-081①] 对话洞察/补充指令(模板 {{extraBrief}} 占位,空则整段省略)。
          extraBrief: extraBrief
            ? `\n${EXTRA_BRIEF_HEADING}\n${extraBrief}`
            : "",
          rubricBlock,
          title: effTitle || "（未提供标题）",
          script:
            script && script.trim()
              ? script
              : "（暂无文稿——请基于标题与定位做尽力诊断,拿不准的指标给 null）",
        },
      });
      const parsed = parseDiagnosis(
        text,
        new Set(GENERIC_RUBRIC_DIMENSIONS.map((d) => d.key)),
      );
      if (!parsed) return null;
      // 对话卡只用维度评分 + 综合判断三段(performance 留给工作台诊断卡;对话里不渲分数 chips)。
      return {
        dimensions: parsed.dimensions,
        verdict: parsed.verdict,
        mainIssues: parsed.mainIssues,
        priorityFixes: parsed.priorityFixes,
      };
    },
    analyzeReview: async ({ subject, extraBrief }) => {
      // 复用 review.insights 模板 + reviewFacets + parseLearnings(与 review-runner 同源、同一份
      // 真数据注入,不造影子)。T-039a:facets 走共用 reviewFacets —— 它把本项目的真文案/数据/评论
      // 拼成整块注入(前提是上面 assembleCreativeContext 拿到了 projectId → reviewSubject reader 读齐)。
      // subject 优先级:模型显式传 > 工作台选中标题 > 作品真标题(reviewFacets 内兜底)。
      const effSubject = subject?.trim() ? subject : selectionTitle;
      const spec = await deps.resolveModelSpec(ctx, "review.insights");
      const { text } = await runTemplatedNode({
        model: modelFor(spec),
        // T-040b:运行时 getTemplate 取被覆盖后的 REGISTRY 对象(非 import 快照),吃服务端覆盖。
        template: getTemplate("review.insights"),
        // [T-081①] extraBrief 第三参 → 模板 {{extraBrief}} 占位(空则整段省略)。
        facets: reviewFacets(context, effSubject, extraBrief),
      });
      return parseLearnings(text);
    },
    generatePositioning: async ({ extraBrief }) => {
      // 复用 positioning-runner 的 prompt + parseSuggestion —— 产定位提案候选(非实体)。
      // [T-081②] 真实作品画像:读全部作品标题(压缩列表,截 40 字/上限 100 条/带发布状态)注入
      // prompt,让「结合我的内容生成定位」不依赖模型翻页;读端口未装配/读失败 → 空(诚实降级,
      // 不阻断生成)。[T-081①] extraBrief:对话洞察经新 facet 段进 prompt(优先级高于既有档案)。
      let worksBrief = "";
      if (deps.contextReaders) {
        try {
          const { rows, total } = await deps.contextReaders.listProjects(ctx, {
            limit: 100,
            offset: 0,
          });
          worksBrief = formatWorksBrief(rows, total);
        } catch {
          worksBrief = ""; // 作品画像 best-effort,读失败不阻断定位生成
        }
      }
      const { runAgentNode } = await import("@creatoros/ai-worker");
      const spec = await deps.resolveModelSpec(ctx, "positioning.generate");
      const res = await runAgentNode({
        model: modelFor(spec),
        system: "你是这位创作者的定位策略 agent。只输出 JSON,不要多余文字。",
        prompt: buildPositioningPrompt(context, { extraBrief, worksBrief }),
        maxSteps: 2,
      });
      return parseSuggestion(res.text);
    },
    // [T-094] 对话蒸馏:复用倾倒场同一引擎 runKnowledgeDistill(knowledge.distill 模板 +
    // capability 走 model-config,多模态可配铁律)。失败抛错由工具 execute 接住转人话渲卡。
    distillKnowledge: async ({ content }) => {
      const { runKnowledgeDistill } = await import("./knowledge-distill-runner");
      return runKnowledgeDistill(
        ctx,
        { content },
        { resolveModelSpec: deps.resolveModelSpec },
      );
    },
    // [T-077b] brief.fill 的现状读:当前项目对话(chatContext.projectId,project surface 的
    // selection kind=project 已装进来)才读得到;无项目上下文 / 端口未装配 → null(卡上现值显「未填」)。
    getProjectBrief: async () => {
      if (!deps.contextReaders || !chatContext.projectId) return null;
      return deps.contextReaders.getProjectBrief(ctx, {
        projectId: chatContext.projectId,
      });
    },
    // 只读 context 工具 —— execute 直接调注入的 user-scoped 读端口(不跑模型、不产候选、不写实体)。
    // 端口未装配(contextReaders 缺省)→ 回空数组(诚实降级,绝不塞假数据),模型据此如实作答。
    listProjects: async ({ limit, offset }) => {
      if (!deps.contextReaders) return { rows: [], total: 0 };
      return deps.contextReaders.listProjects(ctx, { limit, offset });
    },
    listComments: async ({ limit, offset }) => {
      if (!deps.contextReaders) return { rows: [], total: 0 };
      return deps.contextReaders.listComments(ctx, { limit, offset });
    },
    searchKnowledge: async ({ query, limit }) => {
      if (!deps.contextReaders) return [];
      return deps.contextReaders.searchKnowledge(ctx, { query, limit });
    },
    searchMaterials: async ({ query, limit }) => {
      if (!deps.contextReaders) return [];
      return deps.contextReaders.searchMaterials(ctx, { query, limit });
    },
    // [T-099b] 详情类 context 工具(切片二)—— execute 直接调注入的 user-scoped 详情读端口。
    // 端口未装配(contextReaders 缺省 / 具体方法缺省)→ 工具侧诚实空态(found:false / null),
    // 绝不塞假数据。全部按 ctx.userId 收窄(读端口内部据 ctx 收窄,读不到 → null/空)。
    getProjectDetail: async ({ projectId }) => {
      if (!deps.contextReaders?.getProjectDetail) return null;
      return deps.contextReaders.getProjectDetail(ctx, { projectId });
    },
    getPositioningDetail: async () => {
      if (!deps.contextReaders?.getPositioningDetail) {
        return {
          profile: null,
          currentStatement: null,
          statementCount: null,
          accounts: [],
        };
      }
      return deps.contextReaders.getPositioningDetail(ctx);
    },
    getKnowledgeDetail: async ({ id }) => {
      if (!deps.contextReaders?.getKnowledgeDetail) return null;
      return deps.contextReaders.getKnowledgeDetail(ctx, { id });
    },
    // [T-099c] 全文类 context 工具(切片三)—— execute 调注入的 user-scoped 全文读端口。
    // 端口未装配(contextReaders 缺省 / 具体方法缺省)→ 工具侧诚实空态(found:false),
    // 绝不塞假数据。窗口截断(§3 全文档预算)由工具 execute 侧强制,读端口只回原始全文。
    listProjectArtifacts: async ({ projectId }) => {
      if (!deps.contextReaders?.listProjectArtifacts) return null;
      return deps.contextReaders.listProjectArtifacts(ctx, { projectId });
    },
    getArtifactText: async ({ projectId, artifactType }) => {
      if (!deps.contextReaders?.getArtifactText) return null;
      return deps.contextReaders.getArtifactText(ctx, { projectId, artifactType });
    },
    getKnowledgeText: async ({ id }) => {
      if (!deps.contextReaders?.getKnowledgeText) return null;
      return deps.contextReaders.getKnowledgeText(ctx, { id });
    },
  };
  const tools = buildChatTools(toolWhitelist, toolDeps);

  return { skillId, system, tools, modelSpec };
}

/**
 * 串起 streamText(SPEC §3.3)—— 装配 + 把 UIMessage[] 转成 ModelMessage[] 喂模型,流式产出。
 * `onFinish` 由路由传入(落 ai_messages 的 assistant 文本)。返回 StreamTextResult,路由用
 * `toUIMessageStreamResponse()` 流回前端(useChat 消费)。
 */
export async function runChatStream(
  ctx: RequestContext,
  input: { messages: UIMessage[]; chatContext: ChatContext },
  deps: AssembleChatDeps,
  onFinish?: (finalText: string) => void | Promise<void>,
) {
  const assembly = await buildChatAssembly(ctx, input.chatContext, deps);
  const { modelFor } = await import("@creatoros/ai-worker");
  const modelMessages = await convertToModelMessages(input.messages);
  const result = streamText({
    model: modelFor(assembly.modelSpec),
    system: assembly.system,
    messages: modelMessages,
    tools: assembly.tools,
    // 工具调用后让模型据工具结果继续把话说完(候选已在 tool-result part 里流回前端渲卡)。
    stopWhen: stepCountIs(5),
    onFinish: onFinish
      ? async ({ text }) => {
          await onFinish(text);
        }
      : undefined,
  });
  return result;
}

// [T-055c] script.hooks 的宽容 JSON 解析:剥围栏 → 找首个 [...] → 逐条收窄。
// 模型输出不合形 → 返回 []（诚实空,前端渲「没生成出来」而非崩)。
export function parseHookItems(
  raw: string,
): Array<{ text: string; angle: string }> {
  const text = raw.replace(/```(?:json)?/g, "").trim();
  const m = text.match(/\[[\s\S]*\]/);
  if (!m) return [];
  try {
    const arr = JSON.parse(m[0]) as unknown;
    if (!Array.isArray(arr)) return [];
    return arr
      .map((it) => {
        const o = it as { text?: unknown; angle?: unknown };
        const t = typeof o.text === "string" ? o.text.trim() : "";
        const a = typeof o.angle === "string" ? o.angle.trim() : "";
        return t ? { text: t, angle: a || "hook" } : null;
      })
      .filter((x): x is { text: string; angle: string } => x !== null)
      .slice(0, 6);
  } catch {
    return [];
  }
}
