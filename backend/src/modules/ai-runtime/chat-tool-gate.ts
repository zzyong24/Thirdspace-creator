import { tool, type Tool, type Schema } from "ai";

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
export const CHAT_TOOL_RESULT_BUDGET_CHARS = 16000;
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
  "topic.generate": { kind: "topic.candidates", extras: { items: [] } },
  "topic.enrich": { kind: "topic.card", extras: { card: null } },
  "script.hooks": { kind: "script.hooks", extras: { items: [] } },
  "script.draft": { kind: "script.draft", extras: { sections: [] } },
  "material.gather": {
    kind: "material.gather",
    // grounding 占位取保守值(错误态卡渲空列表;model_memory 对应「需核实」黄条,不夸大)。
    extras: { items: [], grounding: "model_memory" },
  },
  // 以下 5 个工具 execute 内已有定制 catch(人话/降级),门只兜非 Error 抛出等极端漏网。
  "material.screenshot": { kind: "material.screenshot", extras: { asset: null } },
  "web.read": { kind: "web.read", extras: { asset: null, needLogin: null } },
  "material.generate": {
    kind: "material.generate",
    extras: { taskId: null, kindOf: "image", status: "queued" },
  },
  "review.script": {
    kind: "review.report",
    extras: { taskId: null, projectId: null },
  },
  "knowledge.distill": {
    kind: "knowledge.distill",
    extras: {
      atoms: [],
      suggestedTags: [],
      originalText: "",
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

/**
 * [T-239a] 统一工具门:在 Vercel AI SDK tool() 之上薄包(错误信封 + 结果预算 + 审计打点)。
 * 迁移形态:`"xxx": tool({...})` → `"xxx": defineChatTool("xxx", {...}, deps.humanizeError)`,
 * execute 签名/schema/描述零变;错误信封元数据查 CHAT_TOOL_ERROR_ENVELOPES(单一真值表)。
 */
export function defineChatTool<INPUT, OUTPUT extends { kind: string }>(
  name: string,
  config: {
    description: string;
    /** jsonSchema<INPUT>(...) —— 泛型携带入参类型,execute 的解构参数由此获得上下文类型(与直调 tool() 等价)。 */
    inputSchema: Schema<INPUT>;
    execute: (input: INPUT, callOptions?: unknown) => Promise<OUTPUT> | OUTPUT;
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
      console.log(`[chat-tool] name=${name} ok durationMs=${Date.now() - startedAt}`);
      return bounded;
    } catch (err) {
      console.log(`[chat-tool] name=${name} error durationMs=${Date.now() - startedAt}`);
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
  return tool({
    description: config.description,
    inputSchema: config.inputSchema,
    execute: gatedExecute,
  } as never) as Tool;
}
