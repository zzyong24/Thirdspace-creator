import { createHash, randomBytes } from "node:crypto";

/** 会读取外部不可信正文、其结果进入下一次模型调用的工具。 */
export const UNTRUSTED_CONTENT_TOOL_NAMES = new Set([
  "material.gather",
  "web.read",
  "local.read",
]);

/**
 * 会额外计费、写持久状态、归档或触发转写的 Copilot 工具。
 * 这里是安全分类真值；新增同类工具却未登记会被聚焦测试拦住。
 */
export const SIDE_EFFECT_TOOL_NAMES = new Set([
  "topic.generate",
  "topic.enrich",
  "script.hooks",
  "script.draft",
  "publish.package",
  "project.transcribe",
  "material.screenshot",
  "web.read",
  "material.generate",
  "cover.generate",
  "calibration.diagnose",
  "review.analyze",
  "review.script",
  "brief.fill",
  "positioning.generate",
  "knowledge.distill",
  "intelligence.douyin.share",
]);

/**
 * 进过不可信正文后的下一模型调用只保留本地确定性 context/环境只读工具。
 * 不继续开放 web.read/material.gather/local.read：即使它们“主要是读取”，也可能访问登录态、
 * 本机文件或创建 pending 素材，若由网页提示注入驱动就跨越了信任域。
 */
export function isReadOnlyToolAfterUntrustedContent(name: string): boolean {
  return (
    name.startsWith("context.") ||
    name === "local.tools" ||
    name === "local.workspace"
  );
}

export interface EffectApprovalPresentation {
  title: string;
  expectedCost: string;
  normalizedInput: unknown;
}

function normalizeValue(value: unknown): unknown {
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) return value.map(normalizeValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([, child]) => child !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, child]) => [key, normalizeValue(child)]),
  );
}

export function canonicalEffectInput(input: unknown): string {
  return JSON.stringify(normalizeValue(input));
}

/** UI 与服务端共用；费用文案由工具与规范化参数确定，模型不能自行填写。 */
export function describeEffectApproval(
  toolName: string,
  input: unknown,
): EffectApprovalPresentation | null {
  if (!SIDE_EFFECT_TOOL_NAMES.has(toolName)) return null;
  const normalizedInput = normalizeValue(input);
  const record = normalizedInput as Record<string, unknown> | null;
  if (toolName === "material.generate") {
    const kind = record?.kind === "video" ? "视频" : "图片";
    return {
      title: `生成 1 次${kind}素材`,
      expectedCost: `预计消耗：1 次${kind}生成额度（实际以渠道结算为准）`,
      normalizedInput,
    };
  }
  if (toolName === "intelligence.douyin.share") {
    const transcribe = record?.action === "archive_and_transcribe";
    return {
      title: transcribe ? "归档抖音内容并转写" : "归档抖音内容",
      expectedCost: transcribe
        ? "预计消耗：1 次 ASR 转写额度；归档本身不扣 AI 额度"
        : "预计消耗：0 AI 额度（仅持久归档）",
      normalizedInput,
    };
  }
  if (toolName === "web.read") {
    return {
      title: "读取网页正文并保存待确认素材",
      expectedCost: "预计消耗：0 AI 额度（会创建一条待确认正文素材）",
      normalizedInput,
    };
  }
  const titles: Record<string, string> = {
    "material.screenshot": "抓取网页截图并保存待确认素材",
    "project.transcribe": "发起作品转写",
    "cover.generate": "生成 1 次封面候选",
    "review.script": "发起 1 次文案审核",
    "script.draft": "生成 1 次整稿候选",
    "publish.package": "生成 1 次发布物料候选",
  };
  return {
    title: titles[toolName] ?? `执行 ${toolName}`,
    expectedCost: SIDE_EFFECT_TOOL_NAMES.has(toolName)
      ? "预计消耗：1 次模型或持久化操作（实际以渠道结算为准）"
      : "预计消耗：未知",
    normalizedInput,
  };
}

type ApprovalMessage = {
  role?: unknown;
  content?: unknown;
};

export interface ApprovalResponseRef {
  approvalId: string;
  toolCallId: string;
  approved: boolean;
}

/** 从 SDK ModelMessage 中找与本次 tool call 绑定的审批回执。 */
export function findApprovalResponse(
  messages: readonly unknown[],
  toolCallId: string,
): ApprovalResponseRef | null {
  let requestApprovalId = "";
  const responses = new Map<string, boolean | null>();
  for (const rawMessage of messages) {
    if (!rawMessage || typeof rawMessage !== "object") continue;
    const message = rawMessage as ApprovalMessage;
    const parts = Array.isArray(message.content) ? message.content : [];
    for (const raw of parts) {
      if (!raw || typeof raw !== "object") continue;
      const part = raw as Record<string, unknown>;
      if (
        part.type === "tool-approval-request" &&
        part.toolCallId === toolCallId &&
        typeof part.approvalId === "string"
      ) {
        requestApprovalId = part.approvalId;
      }
      if (
        part.type === "tool-approval-response" &&
        typeof part.approvalId === "string" &&
        typeof part.approved === "boolean"
      ) {
        // 同一 approvalId 出现多份回执属于重放/歧义；即使布尔值相同也不自行猜测。
        responses.set(
          part.approvalId,
          responses.has(part.approvalId) ? null : part.approved,
        );
      }
    }
  }
  if (!requestApprovalId) return null;
  const approved = responses.get(requestApprovalId);
  return typeof approved === "boolean"
    ? { approvalId: requestApprovalId, toolCallId, approved }
    : null;
}

interface PendingEffectApproval {
  userId: string;
  toolName: string;
  fingerprint: string;
  approvalId: string | null;
  issuedAt: number;
  consumed: boolean;
}

export class EffectApprovalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EffectApprovalError";
  }
}

export class ChatEffectApprovalRegistry {
  private readonly pending = new Map<string, PendingEffectApproval>();

  constructor(
    private readonly opts: {
      ttlMs?: number;
      maxEntries?: number;
      now?: () => number;
    } = {},
  ) {}

  private now(): number {
    return this.opts.now?.() ?? Date.now();
  }

  private fingerprint(toolName: string, input: unknown): string {
    const presentation = describeEffectApproval(toolName, input);
    if (!presentation) throw new EffectApprovalError("未知副作用工具，已拒绝执行");
    return createHash("sha256")
      .update(toolName)
      .update("\n")
      .update(canonicalEffectInput(presentation.normalizedInput))
      .update("\n")
      .update(presentation.expectedCost)
      .digest("hex");
  }

  request(input: {
    userId: string;
    toolName: string;
    toolCallId: string;
    toolInput: unknown;
    messages: readonly unknown[];
  }): { status: "user-approval" } | { status: "denied"; reason: string } {
    const now = this.now();
    const ttlMs = this.opts.ttlMs ?? 10 * 60_000;
    const fingerprint = this.fingerprint(input.toolName, input.toolInput);
    const response = findApprovalResponse(input.messages, input.toolCallId);
    const prior = this.pending.get(input.toolCallId);
    if (!prior) {
      // 带审批回执却没有本进程签发记录：可能是重启旧码、伪造或过期清理，一律失败关闭。
      if (response) {
        return { status: "denied", reason: "审批记录不存在或已失效，请重新发起操作" };
      }
      this.pending.set(input.toolCallId, {
        userId: input.userId,
        toolName: input.toolName,
        fingerprint,
        approvalId: null,
        issuedAt: now,
        consumed: false,
      });
      this.prune();
      return { status: "user-approval" };
    }
    if (prior.consumed) {
      return { status: "denied", reason: "该审批已使用，禁止重放" };
    }
    if (now - prior.issuedAt > ttlMs) {
      this.pending.delete(input.toolCallId);
      return { status: "denied", reason: "审批已超时，请重新发起操作" };
    }
    if (
      prior.userId !== input.userId ||
      prior.toolName !== input.toolName ||
      prior.fingerprint !== fingerprint
    ) {
      return { status: "denied", reason: "审批参数已变化，请重新确认" };
    }
    if (response) {
      if (!response.approved) {
        return { status: "denied", reason: "用户已拒绝该操作" };
      }
      if (prior.approvalId && prior.approvalId !== response.approvalId) {
        return { status: "denied", reason: "审批标识不匹配" };
      }
      prior.approvalId = response.approvalId;
    }
    return { status: "user-approval" };
  }

  consume(input: {
    userId: string;
    toolName: string;
    toolCallId: string;
    toolInput: unknown;
    messages: readonly unknown[];
  }): { approvalId: string; executionKey: string } {
    const now = this.now();
    const ttlMs = this.opts.ttlMs ?? 10 * 60_000;
    const prior = this.pending.get(input.toolCallId);
    const response = findApprovalResponse(input.messages, input.toolCallId);
    if (!prior || !response?.approved || !prior.approvalId) {
      throw new EffectApprovalError("缺少有效的用户审批，副作用未执行");
    }
    const fingerprint = this.fingerprint(input.toolName, input.toolInput);
    if (
      prior.consumed ||
      now - prior.issuedAt > ttlMs ||
      prior.userId !== input.userId ||
      prior.toolName !== input.toolName ||
      prior.fingerprint !== fingerprint ||
      prior.approvalId !== response.approvalId
    ) {
      throw new EffectApprovalError("审批已使用、过期或参数不匹配，副作用未执行");
    }
    // 同步置 consumed，再进入异步 dispatch；同一 approval 的并发/重放只有第一个能穿过。
    prior.consumed = true;
    const executionKey = createHash("sha256")
      .update(input.userId)
      .update("\n")
      .update(response.approvalId)
      .update("\n")
      .update(fingerprint)
      .digest("hex");
    return { approvalId: response.approvalId, executionKey };
  }

  private prune(): void {
    const max = this.opts.maxEntries ?? 2048;
    while (this.pending.size > max) {
      const oldest = this.pending.keys().next().value as string | undefined;
      if (!oldest) break;
      this.pending.delete(oldest);
    }
  }
}

/** 进程级一次性审批账本；进程重启后旧审批自然失效（fail closed）。 */
export const chatEffectApprovalRegistry = new ChatEffectApprovalRegistry();

/** SDK HMAC 会绑定 approvalId + toolCallId + toolName + 精确输入；不写环境、文件或日志。 */
export const CHAT_TOOL_APPROVAL_SECRET = randomBytes(32);
