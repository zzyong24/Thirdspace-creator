import {
  tool,
  type Tool,
  type Schema,
  type ToolApprovalStatus,
  type ToolSet,
} from "ai";
import { formatErrorDiagnostic } from "./error-diagnostics";

// ─────────────────────────────────────────────────────────────────────────────
// [T-239a] 统一工具门 defineChatTool —— 治「30 工具遇错体验抽奖」(T-229 审计实锤)。
//
// gate-F1 不造轮子核实(SPEC §2-S4):Vercel AI SDK 的 tool() 本身没有 error-envelope/
// 审计/结果预算中间层,官方模式就是由调用方 wrap execute;LangChain 类框架的 wrapper 绑定
// 其运行时不适配本栈。故在 tool() 之上薄包一层是官方推荐形态、非重造轮子。
//
// 统一三件事:
//   ① 错误信封:execute 裸抛 → 统一转 { ...结构占位, kind, error: 人话 }。kind 必须与该
//      工具**正常结果的 kind 一致**(前端 ai-copilot-content 按 kind 分派渲染卡,kind 错 =
//      卡渲染失败);结构占位(items: [] 等)保证卡组件不因缺字段崩。已有 execute 内 catch
//      的工具(material.screenshot / web.read / material.generate / review.script /
//      knowledge.distill)保持其定制人话,本门只兜「漏网裸抛」。
//   ② 结果字符预算:结果 JSON 序列化超预算(默认 16k chars,per-tool 可覆盖)→ 只截断超长
//      **字符串值**(从最长的截起,截口加「…(已截断)」),绝不动结构 —— 候选卡数组等
//      结构化数据完整性优先。
//   ③ 审计打点:console 结构化日志 `[chat-tool] name=X ok|error durationMs=N`(轻量,
//      不建表)。【T-239e 挂点】usage/费用归因后续在此日志点扩展字段,别另起打点层。
// ─────────────────────────────────────────────────────────────────────────────

/** 结果 JSON 序列化默认字符预算(超出才截;per-tool 经 CHAT_TOOL_ERROR_ENVELOPES.budgetChars 覆盖)。 */
// [T-431] 工具结果注入预算(护栏:截最长字符串值 + 诚实标记,模型知情)。1M 上下文下放宽,
// 少让工具结果被裁;仍保留护栏防单个工具 dump 撑爆对话。
export const CHAT_TOOL_RESULT_BUDGET_CHARS = 60000;
/** 预算截断时单个字符串值至少保留的字符数(短字符串 = id/枚举/标题,绝不截)。 */
export const BUDGET_MIN_KEEP_CHARS = 200;
/** 截断标记(拼在截口,让模型/用户知道此处被截,不假装是全文)。 */
export const BUDGET_TRUNCATION_SUFFIX = "…(已截断)";

/** 错误→人话端口形状(与 ChatToolDeps.humanizeError 同;null = 无映射,回落原始 message)。 */
export type HumanizeErrorPort = (
  err: unknown,
) => { message: string; suggestSwitchModel: boolean } | null;

/** 每个工具的错误信封元数据:kind 对齐 + 结构占位 + 可选预算覆盖。 */
export interface ChatToolErrorEnvelope {
  /** 错误信封的 kind —— **必须**与该工具正常结果的 kind 一致(前端按 kind 分派渲染)。 */
  kind: string;
  /** 结构占位字段(空数组/null 等),保证前端卡在错误态不因缺字段渲染崩。 */
  extras?: Record<string, unknown>;
  /** per-tool 结果预算覆盖(默认 CHAT_TOOL_RESULT_BUDGET_CHARS)。 */
  budgetChars?: number;
}

/**
 * 工具名 → 错误信封元数据(单一真值表)。注意 6 个工具 kind ≠ 工具名(topic.generate →
 * topic.candidates 等),这是前端卡分派的既有契约,别「顺手对齐」。
 * drift 由 chat-tool-gate.test.ts 的 guard 用例锁(keys === ALL_CHAT_TOOL_NAMES)。
 */
export const CHAT_TOOL_ERROR_ENVELOPES: Readonly<
  Record<string, ChatToolErrorEnvelope>
> = {
  "creatoros.guide": {
    kind: "creatoros.guide",
    extras: {
      skillId: "creatoros.guide",
      version: null,
      verifiedAt: null,
      guide: null,
      limitations: [],
      next: null,
    },
  },
  "topic.generate": { kind: "topic.candidates", extras: { items: [] } },
  "topic.enrich": { kind: "topic.card", extras: { card: null } },
  "script.hooks": { kind: "script.hooks", extras: { items: [] } },
  "script.patch": {
    kind: "script.patch",
    extras: {
      artifactId: "",
      versionId: "",
      sectionId: "",
      originalText: "",
      replacementText: "",
      summary: "",
    },
  },
  // [T-268] script.draft —— 异步 dispatch(kind === 工具名)。dispatch 失败/无项目上下文 →
  // 门兜结构占位(taskId/projectId=null,卡渲诚实错误态)。
  "script.draft": { kind: "script.draft", extras: { taskId: null, projectId: null } },
  "video.edit.render": {
    kind: "video.edit",
    extras: {
      projectId: null,
      outputId: null,
      expectedRevision: null,
      sourceRenderTaskId: null,
      instruction: "",
      summary: [],
      decisions: null,
      renderProps: null,
    },
  },
  // [T-350a] publish.package —— 异步 dispatch(kind === 工具名)。dispatch 失败/无项目上下文/空稿门 →
  // 门兜结构占位(taskId/projectId=null,卡渲诚实错误态)。
  "publish.package": { kind: "publish.package", extras: { taskId: null, projectId: null } },
  // [T-385] project.transcribe —— 异步 dispatch(kind === 工具名)。dispatch 失败/无项目上下文/
  // 无抖音锚 → 门兜结构占位(taskId/projectId=null,前端渲诚实错误文本)。
  "project.transcribe": { kind: "project.transcribe", extras: { taskId: null, projectId: null } },
  "material.gather": {
    kind: "material.gather",
    // [T-684] 浏览器失败时明确 unavailable；禁止再伪装成模型记忆素材。
    extras: { items: [], grounding: "unavailable" },
  },
  // 以下 5 个工具 execute 内已有定制 catch(人话/降级),门只兜非 Error 抛出等极端漏网。
  "material.screenshot": { kind: "material.screenshot", extras: { asset: null } },
  "web.read": {
    kind: "web.read",
    // [T-251] 窗口真相字段占位(错误态无窗口,text/window=null、hasMore=false,卡不因缺字段崩)。
    extras: {
      asset: null,
      needLogin: null,
      text: null,
      window: null,
      hasMore: false,
    },
  },
  "intelligence.douyin.share": {
    kind: "intelligence.douyin.share",
    extras: {
      taskId: null,
      ownerId: null,
      action: "archive",
    },
  },
  // [T-253] local.read:execute 内已有定制 catch(四态诚实),门只兜非 Error 抛出等极端漏网。
  // [T-262] 结构占位加 foundByName/candidates(按名搜索兜底两态),错误态卡不因缺字段崩。
  "local.read": {
    kind: "local.read",
    extras: {
      needApproval: null,
      foundByName: null,
      file: null,
      listing: null,
      candidates: null,
    },
  },
  // [T-256a] local.tools:execute 内已有定制 catch(诚实降级),门兜极端漏网(空探测结果)。
  "local.tools": {
    kind: "local.tools",
    extras: { tools: [], rejected: [] },
  },
  // [T-256a] local.workspace:同上,门兜极端漏网(空目录清单)。
  "local.workspace": {
    kind: "local.workspace",
    extras: { dirs: [] },
  },
  "material.generate": {
    kind: "material.generate",
    extras: { taskId: null, kindOf: "image", status: "queued" },
  },
  "review.script": {
    kind: "review.report",
    extras: { taskId: null, projectId: null },
  },
  "planning.thesis": {
    kind: "planning.thesis",
    extras: { taskId: null, projectId: null },
  },
  // [T-271] cover.generate —— 异步 dispatch(kind === 工具名)。dispatch 失败/无项目上下文 →
  // 门兜结构占位(taskId/projectId=null,卡渲诚实错误态)。
  "cover.generate": {
    kind: "cover.generate",
    extras: { taskId: null, projectId: null },
  },
  "knowledge.distill": {
    kind: "knowledge.distill",
    extras: {
      atoms: [],
      suggestedTags: [],
      originalText: "",
      coverage: { inputChars: 0, submittedChars: 0, truncatedChars: 0 },
      suggestSwitchModel: false,
    },
  },
  "calibration.diagnose": {
    kind: "calibration.diagnosis",
    extras: { diagnosis: null },
  },
  "review.analyze": { kind: "review.learnings", extras: { items: [] } },
  "learning.capture": { kind: "learning.capture", extras: { suggestion: null } },
  "brief.fill": { kind: "brief.fill", extras: { suggestion: null, current: null } },
  "positioning.generate": {
    kind: "positioning.suggestion",
    extras: { suggestion: null },
  },
  "context.projects": {
    kind: "context.projects",
    extras: { items: [], total: 0, offset: 0, hasMore: false },
  },
  "context.projects.search": {
    kind: "context.projects.search",
    extras: { items: [], total: 0, hasMore: false, query: "" },
  },
  "context.comments": {
    kind: "context.comments",
    extras: { items: [], total: 0, offset: 0, hasMore: false },
  },
  "context.knowledge": { kind: "context.knowledge", extras: { items: [] } },
  "context.materials": { kind: "context.materials", extras: { items: [] } },
  "context.project.detail": {
    kind: "context.project.detail",
    extras: { found: false, project: null },
  },
  "context.project.lifecycle": {
    kind: "context.project.lifecycle",
    extras: { found: false, lifecycle: null },
  },
  "context.review.report": {
    kind: "context.review.report",
    extras: { found: false, report: null },
  },
  "context.positioning.detail": {
    kind: "context.positioning.detail",
    extras: {
      found: false,
      positioning: {
        profile: null,
        currentStatement: null,
        statementCount: null,
        accounts: [],
      },
    },
  },
  "context.knowledge.detail": {
    kind: "context.knowledge.detail",
    extras: { found: false, item: null },
  },
  "context.artifacts": {
    kind: "context.artifacts",
    extras: { found: false, projectId: "", projectTitle: "", items: [] },
  },
  "context.artifact.text": {
    kind: "context.artifact.text",
    extras: {
      found: false,
      artifactType: "",
      text: "",
      offset: 0,
      totalChars: 0,
      hasMore: false,
    },
  },
  "context.knowledge.text": {
    kind: "context.knowledge.text",
    extras: {
      found: false,
      id: "",
      title: "",
      knowledgeType: "",
      text: "",
      offset: 0,
      totalChars: 0,
      hasMore: false,
    },
  },
  "context.publications": {
    kind: "context.publications",
    extras: { items: [], total: 0, offset: 0, hasMore: false },
  },
  "context.metrics": {
    kind: "context.metrics",
    extras: { subject: null, rows: [], retention: [] },
  },
  "context.learnings": {
    kind: "context.learnings",
    extras: { items: [], total: 0 },
  },
  "context.candidates": {
    kind: "context.candidates",
    extras: { items: [], total: 0, offset: 0, hasMore: false },
  },
  "context.predictions": {
    kind: "context.predictions",
    extras: { rubric: null, items: [], total: 0 },
  },
};

/**
 * 结果字符预算强制(纯函数,可单测):结果 JSON 序列化 ≤ budgetChars → 原样返回(零拷贝);
 * 超预算 → 深拷贝后**只截字符串值**:收集全部长度 > BUDGET_MIN_KEEP_CHARS 的字符串
 * (跳过信封字段 kind/error),按长度降序从最长截起,直到砍掉超额部分。结构(数组条数/
 * 对象字段)零变 —— 候选卡等结构化数据完整性优先,超预算时牺牲的是最长的文本字段。
 */
export function enforceChatToolResultBudget<T>(result: T, budgetChars: number): T {
  let serialized: string;
  try {
    serialized = JSON.stringify(result) ?? "";
  } catch {
    // 不可序列化(理论不该发生:工具结果都是 plain JSON)→ 不动,交给上游。
    return result;
  }
  if (serialized.length <= budgetChars) return result;
  const clone = JSON.parse(serialized) as unknown;
  // 收集可截字符串槽位(带父引用,方便原位改写)。
  interface Slot {
    parent: Record<string, unknown> | unknown[];
    key: string | number;
    len: number;
  }
  const slots: Slot[] = [];
  const walk = (node: unknown): void => {
    if (Array.isArray(node)) {
      node.forEach((v, i) => {
        if (typeof v === "string") {
          if (v.length > BUDGET_MIN_KEEP_CHARS) slots.push({ parent: node, key: i, len: v.length });
        } else {
          walk(v);
        }
      });
      return;
    }
    if (node && typeof node === "object") {
      for (const [k, v] of Object.entries(node)) {
        // 信封字段不截:kind 是分派键;error 是人话(本就短),截了反而丢信息。
        if (k === "kind" || k === "error") continue;
        if (typeof v === "string") {
          if (v.length > BUDGET_MIN_KEEP_CHARS) {
            slots.push({ parent: node as Record<string, unknown>, key: k, len: v.length });
          }
        } else {
          walk(v);
        }
      }
    }
  };
  walk(clone);
  slots.sort((a, b) => b.len - a.len);
  let excess = serialized.length - budgetChars;
  for (const slot of slots) {
    if (excess <= 0) break;
    const current = (slot.parent as Record<string | number, unknown>)[slot.key] as string;
    const keep = Math.max(
      BUDGET_MIN_KEEP_CHARS,
      current.length - excess - BUDGET_TRUNCATION_SUFFIX.length,
    );
    if (keep >= current.length) continue;
    (slot.parent as Record<string | number, unknown>)[slot.key] =
      current.slice(0, keep) + BUDGET_TRUNCATION_SUFFIX;
    excess -= current.length - keep - BUDGET_TRUNCATION_SUFFIX.length;
  }
  return clone as T;
}

// ─────────────────────────────────────────────────────────────────────────────
// [T-263] 统一「人在环工具授权」门(HITL)—— 把 needApproval 从「工具完整输出」升级为「未决工具
// 调用」的通用能力,抽进本门(defineChatTool),后续任何 needApproval 类工具(将来 local.write /
// T-262 多命中选择等)复用同一阻塞范式,不各写一遍。当前仅 local.read 用。
//
// 走 **Vercel AI SDK 原生工具授权**(ai@7.0.4:streamText 的 `toolApproval` 配置,非已废弃的
// tool-level needsApproval)。判定器返回我们自己的三态,buildChatToolApproval 映射到 SDK
// ToolApprovalStatus:授权未命中 → 'user-approval'(SDK 挂起本工具调用、以 approval-requested 态
// surface 前端,execute 暂不跑)→ 前端确认卡「允许」写 grant + addToolApprovalResponse(approved)→
// useChat 挂 sendAutomaticallyWhen(lastAssistantMessageIsCompleteWithApprovalResponses)**同回合
// resume 续跑** execute(此时 grant 已写,readLocalFile 直接读到)→ 无新 user 消息、无第二回合叙述;
// 「拒绝」→ addToolApprovalResponse(denied)→ SDK 标 output-denied、execute 不跑。
// ─────────────────────────────────────────────────────────────────────────────

/** [T-263] 工具授权判定结果(我们自己的三态;buildChatToolApproval 映射到 SDK ToolApprovalStatus)。 */
export type ChatToolApprovalDecision =
  | { status: "user-approval" } // 需用户在确认卡上放行(SDK surface approval-requested)
  | { status: "not-applicable" } // 免确认直接执行(已授权/无需门)
  | { status: "denied"; reason: string }; // 硬拒(如敏感文件),不弹卡、直接拒 + 原因

/** [T-263] 工具的授权判定器(闭包已 ctx-bound 端口;入参 = 该工具入参)。 */
export type ChatToolApprovalDecider<INPUT> = (
  input: INPUT,
) => Promise<ChatToolApprovalDecision> | ChatToolApprovalDecision;

// tool → 授权判定器 的旁挂表(WeakMap,不污染 tool 对象可枚举字段;tool GC 时自动清)。
const CHAT_TOOL_APPROVAL_DECIDERS = new WeakMap<
  Tool,
  ChatToolApprovalDecider<unknown>
>();

/** 取某 tool 登记的授权判定器(无 = 该工具无需授权门)。buildChatToolApproval 内部用。 */
export function getChatToolApprovalDecider(
  t: Tool,
): ChatToolApprovalDecider<unknown> | undefined {
  return CHAT_TOOL_APPROVAL_DECIDERS.get(t);
}

/**
 * [T-263] 从一组已挂工具装配 streamText 的 `toolApproval` 配置(per-tool 判定函数映射)。
 * 只收录登记了判定器的工具(当前仅 local.read);全无 → 返回 undefined(streamText 不传该配置)。
 * 我们的三态映射:denied → { type:'denied', reason };user-approval → 'user-approval';其它 →
 * 'not-applicable'。判定器抛错 → 保守回 'not-applicable'(让 execute 自己按既有四态诚实处理,
 * 不因判定器抖动误挂授权门)。
 */
/**
 * [T-439] 工具名合规化 —— 主流模型 API(DeepSeek/OpenAI/Anthropic)对 `tools[].function.name`
 * 一律要求 `^[a-zA-Z0-9_-]+$`,而本项目工具名用点号分段(`context.projects`、
 * `context.positioning.detail`),原样发出会被 **HTTP 400 invalid_request_error 秒拒** →
 * copilot 整个不可用(2026-07-20 真机:DeepSeek 13 轮全拒 68~183ms;同一份工具名在宽松 provider
 * 下 5 个带点工具全跑通 → 纯命名合规问题,工具实现无辜)。故装配时把非法字符换成下划线。
 *
 * 为何**只换 key 就够**:Vercel AI SDK 用 `tools` 的 key 既作发出的 function.name、又作模型回传
 * tool_call 的匹配键 —— 全程闭环,故**工具 execute 实现零改动**;且 `buildChatToolApproval` 是从
 * sanitize 后的 tools 生成的,HITL 授权门的键**自动对齐**(不会出现「该拦的工具因改名而放行」)。
 */
export function sanitizeToolName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]/g, "_");
}

/**
 * [T-439] 批量合规化「按工具名索引的 Record」的 key —— 泛型是刻意的:`tools`(ToolSet)与
 * `toolApproval`(Record<string, 判定器>)**必须用同一套换名**,否则 SDK 回传 tool_call 时授权门
 * 的键对不上 = HITL 形同虚设。故两者都走本函数。
 *
 * 调用时机:**只在发给模型的那一刻**(streamText 入参)换,装配层一律保持原名 —— 原名是内部真值
 * (错误信封登记 CHAT_TOOL_ERROR_ENVELOPES、白名单 toolWhitelist、深链 functionKey、审计日志
 * `[chat-tool] name=` 全按原名),在装配层换会连带打穿这些(实测打红 36 个既有用例)。
 *
 * 撞名 **fail-fast 抛错**——静默覆盖会让某个工具凭空消失(模型再也调不到它,且毫无征兆),比直接
 * 报错危险得多。当前 50 个带点工具名 sanitize 后无冲突,有测锚钉住。
 */
export function sanitizeToolNames<T>(rec: Record<string, T>): Record<string, T> {
  const out: Record<string, T> = {};
  for (const [name, t] of Object.entries(rec)) {
    const safe = sanitizeToolName(name);
    if (safe in out) {
      throw new Error(
        `[chat-tool-gate][T-439] 工具名合规化撞名:「${name}」→「${safe}」已被占用 —— 请改工具命名避免冲突(禁止静默覆盖)`,
      );
    }
    out[safe] = t;
  }
  return out;
}

/**
 * [T-456] 把 system prompt 里出现的**每个原始工具名字面引用**替换成 sanitize 后的名。
 *
 * 背景(2026-07-21 用户 log(4) 真机):T-439 只 sanitize 了 tools 定义 key
 * (点号→下划线),Provider 400 拒绝已修;但 chat-runner 的 system prompt 里 8+ 处
 * 直接以字面量引用工具名(`context.projects` / `context.metrics` /
 * `context.artifact.text` / `context.positioning.detail` …)—— 模型看到 prompt 里
 * 的"要读文本调 context.artifact.text",**按字面吐 tool_call 带点号**,SDK 找的
 * 却是 sanitize 后的下划线名 → `AI_NoSuchToolError` → chat-turn 全 aborted。
 *
 * 修复策略:单点收口,不改 prompt 源码(T-439 已论证在装配层改会打红 36 个既有用例;
 * 装配层原名是错误信封/白名单/深链/审计日志的**内部真值**,改一次穿一片)。改法:
 * 在 chat-runner streamText 入参 `system` 那一行**套一层**;扫 tools 原始名 list,
 * 把 system 里每个原始名的完整词字面量替换成 sanitize 后的名。
 *
 * 只替换名字**恰好等于**原始名的完整 token(前后是非标识符字符),避免:
 *   · "context.projects.detail" 被误替 → "context_projects.detail"(应该整体重命
 *      名到 "context_projects_detail",但那是另一个已注册的工具,不是子串关系)
 *   · Markdown/code fence 里的裸文本被误伤
 * 用 `\b<original>\b` 词边界安全但不够(`.` 不是 \w,词边界包含点);故手写前后
 * lookaround:前面非 `[\w.]`(不接工具名字符/点)、后面非 `[\w.]`(同上)。
 *
 * 撞名 fail-fast(与 sanitizeToolNames 同):调用方必须保证 tools 的原始 keys 里
 * sanitize 后无重复,否则该抛错(通常上游 sanitizeToolNames 已抛过)。
 */
export function sanitizeSystemToolReferences(
  system: string,
  tools: Record<string, unknown>,
): string {
  // 提出所有"含非标识符字符(点/斜杠等)"的原始工具名——只有这些需要替换;纯合规名(全
  // 下划线/字母数字)不动,免得误伤业务文字。按长度倒序,长名先替(避免 "a.b.c" 里
  // "a.b" 被短名先替破坏结构)。
  const originals = Object.keys(tools)
    .filter((n) => sanitizeToolName(n) !== n)
    .sort((a, b) => b.length - a.length);
  if (originals.length === 0) return system;

  let result = system;
  for (const orig of originals) {
    const safe = sanitizeToolName(orig);
    // 转义正则元字符(尤其点号)。lookaround:前后不能是标识符字符或点,避免误替长名一部分。
    const escaped = orig.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`(?<![\\w.])${escaped}(?![\\w.])`, "g");
    result = result.replace(re, safe);
  }
  return result;
}

export function buildChatToolApproval(
  tools: ToolSet,
): Record<string, (input: unknown) => Promise<ToolApprovalStatus>> | undefined {
  const out: Record<string, (input: unknown) => Promise<ToolApprovalStatus>> = {};
  for (const [name, t] of Object.entries(tools)) {
    const decider = getChatToolApprovalDecider(t as Tool);
    if (!decider) continue;
    out[name] = async (input: unknown): Promise<ToolApprovalStatus> => {
      try {
        const d = await decider(input);
        if (d.status === "denied") return { type: "denied", reason: d.reason };
        if (d.status === "user-approval") return "user-approval";
        return "not-applicable";
      } catch {
        return "not-applicable";
      }
    };
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/**
 * [T-239a] 统一工具门:在 Vercel AI SDK tool() 之上薄包(错误信封 + 结果预算 + 审计打点)。
 * 迁移形态:`"xxx": tool({...})` → `"xxx": defineChatTool("xxx", {...}, deps.humanizeError)`,
 * execute 签名/schema/描述零变;错误信封元数据查 CHAT_TOOL_ERROR_ENVELOPES(单一真值表)。
 * [T-263] 可选 needsApproval:登记该工具的授权判定器(旁挂 WeakMap),streamText 装配期由
 * buildChatToolApproval 收成 toolApproval 配置 → 走 SDK 原生 HITL 挂起/续跑。
 */
export function defineChatTool<INPUT, OUTPUT extends { kind: string }>(
  name: string,
  config: {
    description: string;
    /** jsonSchema<INPUT>(...) —— 泛型携带入参类型,execute 的解构参数由此获得上下文类型(与直调 tool() 等价)。 */
    inputSchema: Schema<INPUT>;
    execute: (input: INPUT, callOptions?: unknown) => Promise<OUTPUT> | OUTPUT;
    /** [T-263] 授权判定器(可选)—— 有则该工具走 HITL 授权门(user-approval 时挂起等确认)。 */
    needsApproval?: ChatToolApprovalDecider<INPUT>;
  },
  humanizeError?: HumanizeErrorPort,
): Tool {
  const envelope = CHAT_TOOL_ERROR_ENVELOPES[name];
  if (!envelope) {
    // 新工具没登记信封元数据 = 契约缺口(错误态 kind 无从对齐)→ 装配期即炸,别拖到运行期。
    throw new Error(`[chat-tool-gate] 工具 ${name} 未登记 CHAT_TOOL_ERROR_ENVELOPES —— 新增工具须同步登记错误信封(kind 与正常结果一致 + 结构占位)`);
  }
  const budget = envelope.budgetChars ?? CHAT_TOOL_RESULT_BUDGET_CHARS;
  const gatedExecute = async (input: INPUT, callOptions?: unknown): Promise<unknown> => {
    const startedAt = Date.now();
    try {
      const result = await config.execute(input, callOptions);
      const bounded = enforceChatToolResultBudget(result, budget);
      // 【T-239e 挂点】usage 归因扩展字段(tokens/费用)加在这行日志上,别另起打点层。
      const resultRecord =
        result && typeof result === "object"
          ? (result as unknown as Record<string, unknown>)
          : null;
      const rawTaskId =
        resultRecord && typeof resultRecord.taskId === "string"
          ? resultRecord.taskId.trim()
          : "";
      const taskId = rawTaskId
        ? ` taskId=${rawTaskId.replace(/[^\w.:-]/g, "_").slice(0, 160)}`
        : "";
      console.log(
        `[chat-tool] name=${name} ok durationMs=${Date.now() - startedAt}${taskId}`,
      );
      return bounded;
    } catch (err) {
      console.log(
        `[chat-tool] name=${name} error durationMs=${Date.now() - startedAt} ${formatErrorDiagnostic(err)}`,
      );
      const human = humanizeError?.(err) ?? null;
      return {
        ...(envelope.extras ?? {}),
        kind: envelope.kind,
        error:
          human?.message ?? (err instanceof Error ? err.message : String(err)),
      };
    }
  };
  // 内部仍是官方 tool()(schema/描述原样透传);类型上收窄为 Tool 供 allChatTools 表使用。
  const built = tool({
    description: config.description,
    inputSchema: config.inputSchema,
    execute: gatedExecute,
  } as never) as Tool;
  // [T-263] 登记授权判定器(旁挂 WeakMap)—— buildChatToolApproval 据此装配 SDK toolApproval 配置。
  if (config.needsApproval) {
    CHAT_TOOL_APPROVAL_DECIDERS.set(
      built,
      config.needsApproval as ChatToolApprovalDecider<unknown>,
    );
  }
  return built;
}
