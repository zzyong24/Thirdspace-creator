import type { UIMessage } from "ai";

// [T-239d] 对话历史窗口化 —— **喂模型前的投影层**(SPEC 2026-07-11 director-agent-hardening
// §2-S3)。治「长会话必崩必贵」:每轮请求把整段历史原样喂模型,tool-result(素材清单/全文/
// 指标行)体积巨大且早已渲成前端数据卡,模型无需逐字重读;历史一长,上下文超窗直接 4xx,
// 或每轮 token 费随会话长度线性暴涨。
//
// 两级投影(只改喂模型的副本,**ai_messages 存储原样不动** —— 刷新恢复/卡重渲全不受影响):
//   1. tool-result 清体:近 N 轮(env CREATOROS_CHAT_TOOLRESULT_KEEP_TURNS,默认 4)之前的
//      tool part 输出替换为指针占位文案(CC TOOL_RESULT_CLEARED_MESSAGE 同款思路;honesty
//      规则 6「指针权」语义现成 —— 数据已展示给用户,模型只需指针,不需原文)。
//   2. token 估算截窗:chars/3 粗估(中文 1 字≈1 token 上下,3 字/token 偏保守不误杀),
//      阈值 = 模型有效窗口(env CREATOROS_CHAT_CONTEXT_WINDOW_TOKENS,默认 100000)× 80%
//      (gate-F2 估算边距);超阈 → 保 system + 近 K 轮(env CREATOROS_CHAT_KEEP_TURNS,
//      默认 12),更早历史**整轮**截掉,并在首条保留消息注入「[更早的 N 轮历史已省略]」
//      (模型知道历史不全,不瞎编「你之前说过…」)。
//
// 全部纯函数(不读 process.env、不打日志),chat-runner.runChatStream 在
// convertToModelMessages **之前**调用 —— 这是最薄切点:UIMessage 层结构简单(parts 数组),
// 转成 ModelMessage 后 tool-result 会拆散成多条消息,反而难按「轮」操作。

/** 清体占位文案 —— 与 honesty 规则 6 的「指针权」语义一致,单一真值供单测锚定。 */
export const TOOL_RESULT_CLEARED_MESSAGE =
  "[结果已展示给用户,如需重读请再调工具]";

/** 截窗注入文案(N = 被截掉的轮数)。 */
export function omittedTurnsNotice(n: number): string {
  return `[更早的 ${n} 轮历史已省略]`;
}

/** env → tool-result 保留轮数(默认 4,夹在 [0, 100])。 */
export function resolveToolResultKeepTurns(
  env: Record<string, string | undefined>,
): number {
  const raw = env.CREATOROS_CHAT_TOOLRESULT_KEEP_TURNS?.trim();
  if (!raw) return 4;
  const n = Number(raw);
  if (!Number.isFinite(n)) return 4;
  return Math.min(100, Math.max(0, Math.floor(n)));
}

/** env → 模型有效上下文窗口 token 数(窗口大小未知的模型给保守默认 100000;下限 1000 防误配)。 */
export function resolveContextWindowTokens(
  env: Record<string, string | undefined>,
): number {
  const raw = env.CREATOROS_CHAT_CONTEXT_WINDOW_TOKENS?.trim();
  if (!raw) return 100000;
  const n = Number(raw);
  if (!Number.isFinite(n)) return 100000;
  return Math.max(1000, Math.floor(n));
}

/** env → 超阈截窗时保留的近 K 轮(默认 12,夹在 [1, 100] —— 至少留当前轮)。 */
export function resolveTruncateKeepTurns(
  env: Record<string, string | undefined>,
): number {
  const raw = env.CREATOROS_CHAT_KEEP_TURNS?.trim();
  if (!raw) return 12;
  const n = Number(raw);
  if (!Number.isFinite(n)) return 12;
  return Math.min(100, Math.max(1, Math.floor(n)));
}

/**
 * token 粗估:JSON 序列化字符数 / 3(中文≈1字1token、英文≈4字符1token,取 3 偏保守 ——
 * 宁可高估提早截窗,不可低估撞窗 4xx)。gate-F2:阈值另乘 80% 边距,双保险。
 */
export function estimateTokens(payload: unknown): number {
  try {
    return Math.ceil(JSON.stringify(payload).length / 3);
  } catch {
    return 0; // 序列化失败(循环引用等异常态)→ 0,投影降级为不截(不因估算崩对话)
  }
}

// 一「轮」= 从一条 user 消息起、到下一条 user 消息前的全部消息(首条 user 之前的引导消息
// 归入第一轮)。清体/截窗都按轮操作 —— 保证 assistant 的 tool 调用链不被拦腰截断
// (ModelMessage 层 tool-call 与 tool-result 必须成对,整轮保/整轮截天然成对)。
function splitTurns(messages: UIMessage[]): UIMessage[][] {
  const turns: UIMessage[][] = [];
  let current: UIMessage[] = [];
  for (const m of messages) {
    if (m.role === "user" && current.length > 0) {
      turns.push(current);
      current = [];
    }
    current.push(m);
  }
  if (current.length > 0) turns.push(current);
  return turns;
}

// 一个 part 是否 tool 输出部件(AI SDK v5+:静态工具 `tool-<name>`,动态 `dynamic-tool`)。
function isToolPart(part: unknown): part is { type: string; output?: unknown } {
  const t = (part as { type?: unknown })?.type;
  return (
    typeof t === "string" && (t.startsWith("tool-") || t === "dynamic-tool")
  );
}

// 清体一条消息:tool part 的 output 替换为指针占位(浅拷贝,不动原对象 —— 存储层/调用方
// 的 messages 原样)。只清「已有输出」的 part(state=output-available 的 output 字段);
// 无输出的(input-available/错误态)原样保留。返回 [投影消息, 清掉的 part 数]。
function clearToolOutputs(message: UIMessage): [UIMessage, number] {
  const parts = (message as { parts?: unknown[] }).parts;
  if (!Array.isArray(parts)) return [message, 0];
  let cleared = 0;
  const nextParts = parts.map((p) => {
    if (!isToolPart(p)) return p;
    const rec = p as Record<string, unknown>;
    if (rec.output === undefined) return p;
    if (rec.output === TOOL_RESULT_CLEARED_MESSAGE) return p; // 已清过(幂等)
    cleared += 1;
    return { ...rec, output: TOOL_RESULT_CLEARED_MESSAGE };
  });
  if (cleared === 0) return [message, 0];
  return [{ ...(message as object), parts: nextParts } as UIMessage, cleared];
}

// 截窗注入:把省略提示预置到首条保留消息的首个 text part(整轮截掉后首条保留消息必是该轮
// 的 user 消息);无 text part(纯附件等异常形)→ 头插一个 text part。浅拷贝,不动原对象。
function prependNotice(message: UIMessage, notice: string): UIMessage {
  const parts = (message as { parts?: unknown[] }).parts;
  const arr = Array.isArray(parts) ? parts : [];
  const idx = arr.findIndex(
    (p) => (p as { type?: unknown })?.type === "text",
  );
  const nextParts =
    idx >= 0
      ? arr.map((p, i) =>
          i === idx
            ? {
                ...(p as Record<string, unknown>),
                text: `${notice}\n${String((p as { text?: unknown }).text ?? "")}`,
              }
            : p,
        )
      : [{ type: "text", text: notice }, ...arr];
  return { ...(message as object), parts: nextParts } as UIMessage;
}

export interface ChatHistoryProjection {
  /** 投影后的消息(喂 convertToModelMessages;与入参不同引用,入参绝不被改)。 */
  messages: UIMessage[];
  /** 投影前的 token 粗估(system + 原始 messages)。 */
  estBefore: number;
  /** 投影后的 token 粗估(system + 投影 messages)。 */
  estAfter: number;
  /** 被清体的 tool part 数。 */
  cleared: number;
  /** 被整轮截掉的轮数。 */
  truncated: number;
}

/**
 * 两级投影主入口(纯函数)。opts 由 chat-runner 从 env 解析后传入;systemText 参与估算
 * (system 本身**永不截** —— 它是装配出来的当轮上下文,不属于历史)。
 */
export function projectChatHistory(
  messages: UIMessage[],
  opts: {
    systemText: string;
    keepToolResultTurns: number;
    keepTurns: number;
    contextWindowTokens: number;
  },
): ChatHistoryProjection {
  const estBefore = estimateTokens(opts.systemText) + estimateTokens(messages);
  const turns = splitTurns(messages);

  // ① tool-result 清体:近 keepToolResultTurns 轮之外的轮,tool 输出换指针占位。
  const clearBoundary = Math.max(0, turns.length - opts.keepToolResultTurns);
  let cleared = 0;
  let projected: UIMessage[][] = turns.map((turn, i) => {
    if (i >= clearBoundary) return turn;
    return turn.map((m) => {
      const [pm, n] = clearToolOutputs(m);
      cleared += n;
      return pm;
    });
  });

  // ② token 估算截窗:清体后仍超「窗口 × 80%」→ 只保近 keepTurns 轮,更早整轮截掉 +
  //    首条保留消息注入省略提示。
  let truncated = 0;
  const threshold = Math.floor(opts.contextWindowTokens * 0.8);
  const estAfterClear =
    estimateTokens(opts.systemText) + estimateTokens(projected.flat());
  if (estAfterClear > threshold && projected.length > opts.keepTurns) {
    truncated = projected.length - opts.keepTurns;
    projected = projected.slice(truncated);
    if (projected.length > 0 && projected[0]!.length > 0) {
      const first = projected[0]!;
      projected = [
        [prependNotice(first[0]!, omittedTurnsNotice(truncated)), ...first.slice(1)],
        ...projected.slice(1),
      ];
    }
  }

  const outMessages = projected.flat();
  const estAfter =
    cleared === 0 && truncated === 0
      ? estBefore
      : estimateTokens(opts.systemText) + estimateTokens(outMessages);
  return { messages: outMessages, estBefore, estAfter, cleared, truncated };
}

/** 日志行(SPEC 验收锚定格式):`[chat-context] est=X→Y tokens cleared=N truncated=M`。 */
export function formatChatContextLog(p: ChatHistoryProjection): string {
  return `[chat-context] est=${p.estBefore}→${p.estAfter} tokens cleared=${p.cleared} truncated=${p.truncated}`;
}

// [T-274] 无结果的未完成 tool 态 —— 这些部件转 ModelMessage 后是「有 tool-call、无 tool-result」:
//   · approval-requested = HITL 授权卡弹出但用户从没点(local.read 授权门);
//   · input-available / input-streaming = 工具调用已发出但执行没产出(上一轮中断/腰斩)。
// approval-responded 不在此列:已批准的会在续跑轮执行、被拒的有合成 denied 结果,SDK 两者都不崩。
const ABANDONED_TOOL_STATES = new Set([
  "approval-requested",
  "input-available",
  "input-streaming",
]);

/**
 * [T-274] 净化「被后续对话遗弃的未完成 tool 调用」(纯函数,喂模型前调用,存储层原样不动)。
 *
 * 根因:HITL 授权卡(local.read)处于 `approval-requested`(用户没点)时,用户改发新消息,这条
 * 「未批准、无结果」的 tool-call 会随 useChat 内存历史一起 POST 回来;ai@7 的
 * `convert-to-language-model-prompt` 在遇到其**后面**的 user 消息时,发现有 tool-call 没配对
 * tool-result → 抛 `MissingToolResultsError` → 整条流 error(前端「出错了,请重试」;build15
 * sidecar 日志实锤)。
 *
 * 修法:把**最后一条 user 消息之前**、assistant 里处于 {@link ABANDONED_TOOL_STATES} 的 tool
 * 部件摘掉(它们被新一轮对话遗弃,不该再作为悬空调用喂模型)。
 *
 * **不误伤正常 HITL 流**(源码核实):
 *   · 当前 live 轮的授权卡 / 正常「批准后 resume」都在**最后一条 user 消息之后**(resume 是
 *     sendAutomaticallyWhen 自动重发,末条 assistant 的态是 approval-responded、其后无 user 消息)
 *     → i >= lastUserIdx,一律不动;
 *   · 只摘无结果的未完成态,已批准/已拒绝的授权部件不动。
 */
export function dropAbandonedApprovalParts(messages: UIMessage[]): UIMessage[] {
  let lastUserIdx = -1;
  for (let i = 0; i < messages.length; i++) {
    if (messages[i]!.role === "user") lastUserIdx = i;
  }
  if (lastUserIdx <= 0) return messages; // 无 user 消息、或它是首条 → 无「之前」可遗弃
  let changed = false;
  const out = messages.map((m, i) => {
    if (i >= lastUserIdx || m.role !== "assistant") return m;
    const parts = (m as { parts?: unknown[] }).parts;
    if (!Array.isArray(parts)) return m;
    const nextParts = parts.filter((p) => {
      if (!isToolPart(p)) return true;
      const state = (p as { state?: unknown }).state;
      return !(typeof state === "string" && ABANDONED_TOOL_STATES.has(state));
    });
    if (nextParts.length === parts.length) return m;
    changed = true;
    return { ...(m as object), parts: nextParts } as UIMessage;
  });
  return changed ? out : messages;
}
