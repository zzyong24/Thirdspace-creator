import { describe, expect, it, vi, afterEach } from "vitest";
import { jsonSchema } from "ai";
import {
  BUDGET_MIN_KEEP_CHARS,
  BUDGET_TRUNCATION_SUFFIX,
  CHAT_TOOL_ERROR_ENVELOPES,
  CHAT_TOOL_RESULT_BUDGET_CHARS,
  buildChatToolApproval,
  defineChatTool,
  enforceChatToolResultBudget,
  getChatToolApprovalDecider,
} from "./chat-tool-gate";
import type { ToolSet } from "ai";
import { ALL_CHAT_TOOL_NAMES } from "./chat-tools";

// ── [T-239a] 统一工具门单测:裸抛→信封化 kind 对齐 / 超预算只截字符串 / 审计日志格式 ──

const NOOP_SCHEMA = jsonSchema<{ q?: string }>({
  type: "object",
  properties: { q: { type: "string" } },
});

// [T-263] 授权判定器读 input.path,故授权门用例用带 path 的 schema(INPUT 类型对齐)。
const PATH_SCHEMA = jsonSchema<{ path?: string }>({
  type: "object",
  properties: { path: { type: "string" } },
});

/** 取包装后 tool 的 execute(SDK Tool 类型上 execute 可选,单测里断言存在后调用)。 */
function executeOf(t: unknown): (input: unknown, opts?: unknown) => Promise<unknown> {
  const fn = (t as { execute?: unknown }).execute;
  expect(typeof fn).toBe("function");
  return fn as (input: unknown, opts?: unknown) => Promise<unknown>;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("defineChatTool 错误信封", () => {
  it("execute 裸抛 → 统一转 { ...结构占位, kind, error },kind 与正常结果 kind 一致(topic.generate → topic.candidates)", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const t = defineChatTool("topic.generate", {
      description: "d",
      inputSchema: NOOP_SCHEMA,
      execute: async () => {
        throw new Error("upstream boom");
      },
    });
    const out = (await executeOf(t)({}, {})) as Record<string, unknown>;
    expect(out.kind).toBe("topic.candidates"); // kind ≠ 工具名的既有契约,信封必须对齐
    expect(out.error).toBe("upstream boom");
    expect(out.items).toEqual([]); // 结构占位:前端卡不因缺字段渲染崩
  });

  it("注入 humanizeError 有映射时用人话;无映射(null)回落原始 message;非 Error 抛出转 String", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const humanized = defineChatTool(
      "script.hooks",
      {
        description: "d",
        inputSchema: NOOP_SCHEMA,
        execute: async () => {
          throw new Error("new_sensitive 1026");
        },
      },
      () => ({ message: "内容被安全审核拦截,请调整原文再试。", suggestSwitchModel: true }),
    );
    const out1 = (await executeOf(humanized)({}, {})) as Record<string, unknown>;
    expect(out1.kind).toBe("script.hooks");
    expect(out1.error).toBe("内容被安全审核拦截,请调整原文再试。");

    const raw = defineChatTool(
      "script.draft",
      {
        description: "d",
        inputSchema: NOOP_SCHEMA,
        execute: async () => {
          // 非 Error 抛出(漏网极端形态)也要信封化,不裸给 SDK。
          throw "weird string throw";
        },
      },
      () => null,
    );
    const out2 = (await executeOf(raw)({}, {})) as Record<string, unknown>;
    expect(out2.kind).toBe("script.draft");
    expect(out2.error).toBe("weird string throw");
    // [T-268] script.draft 改异步 dispatch:错误信封占位改为 { taskId, projectId }(不再 sections)。
    expect(out2.taskId).toBeNull();
    expect(out2.projectId).toBeNull();
  });

  it("未登记 CHAT_TOOL_ERROR_ENVELOPES 的工具名 → 装配期即抛(新工具须同步登记信封)", () => {
    expect(() =>
      defineChatTool("no.such.tool", {
        description: "d",
        inputSchema: NOOP_SCHEMA,
        execute: async () => ({ kind: "x" }),
      }),
    ).toThrow(/未登记 CHAT_TOOL_ERROR_ENVELOPES/);
  });

  it("信封真值表 guard:keys 与 ALL_CHAT_TOOL_NAMES 完全一致(新增工具不登记信封 = 红)", () => {
    expect(Object.keys(CHAT_TOOL_ERROR_ENVELOPES).sort()).toEqual(
      [...ALL_CHAT_TOOL_NAMES].sort(),
    );
  });
});

describe("enforceChatToolResultBudget 结果字符预算", () => {
  it("未超预算 → 原对象原样返回(零拷贝)", () => {
    const result = { kind: "context.projects", items: [{ title: "短标题" }] };
    expect(enforceChatToolResultBudget(result, CHAT_TOOL_RESULT_BUDGET_CHARS)).toBe(result);
  });

  it("超预算 → 只截最长的字符串值(加截断标记),结构(数组条数/字段/数字)零变", () => {
    const long = "a".repeat(9000);
    const mid = "b".repeat(3000);
    const result = {
      kind: "context.artifacts",
      found: true,
      total: 42,
      items: [
        { title: "候选一", body: long },
        { title: "候选二", body: mid },
      ],
    };
    const out = enforceChatToolResultBudget(result, 4000);
    // 结构完整:数组条数、非字符串字段、短字符串全部不动。
    expect(out.items).toHaveLength(2);
    expect(out.total).toBe(42);
    expect(out.kind).toBe("context.artifacts");
    // (noUncheckedIndexedAccess:上面已断言长度为 2,索引访问用 `!` 收窄。)
    expect(out.items[0]!.title).toBe("候选一");
    expect(out.items[1]!.title).toBe("候选二");
    // 最长的先截,带标记;整体进预算。
    expect(out.items[0]!.body.endsWith(BUDGET_TRUNCATION_SUFFIX)).toBe(true);
    expect(out.items[0]!.body.length).toBeLessThan(long.length);
    expect(JSON.stringify(out).length).toBeLessThanOrEqual(4000);
    // 原对象不被就地污染(深拷贝后截)。
    expect(result.items[0]!.body).toBe(long);
  });

  it("短字符串(≤最小保留)与信封字段 kind/error 永不截", () => {
    const result = {
      kind: "web.read",
      error: "e".repeat(300), // error 是信封字段,跳过不截
      note: "短",
      body: "x".repeat(5000),
    };
    const out = enforceChatToolResultBudget(result, 1000);
    expect(out.kind).toBe("web.read");
    expect(out.error).toBe(result.error);
    expect(out.note).toBe("短");
    expect(out.body.endsWith(BUDGET_TRUNCATION_SUFFIX)).toBe(true);
    // 截后至少保留最小字符数(防 id/正文被截没)。
    expect(out.body.length).toBeGreaterThanOrEqual(BUDGET_MIN_KEEP_CHARS);
  });

  it("经 defineChatTool 全链路:超预算结果落地即已截断", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const t = defineChatTool("context.artifact.text", {
      description: "d",
      inputSchema: NOOP_SCHEMA,
      execute: async () => ({
        kind: "context.artifact.text" as const,
        found: true,
        artifactType: "script",
        text: "长".repeat(70000), // [T-431] 撑到超新预算 60k,验护栏仍触发
        offset: 0,
        totalChars: 70000,
        hasMore: false,
      }),
    });
    const out = (await executeOf(t)({}, {})) as { text: string };
    expect(out.text.endsWith(BUDGET_TRUNCATION_SUFFIX)).toBe(true);
    expect(JSON.stringify(out).length).toBeLessThanOrEqual(CHAT_TOOL_RESULT_BUDGET_CHARS);
  });
});

describe("defineChatTool 审计打点", () => {
  it("成功/失败各打一条结构化日志:[chat-tool] name=X ok|error durationMs=N", async () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    const ok = defineChatTool("context.knowledge", {
      description: "d",
      inputSchema: NOOP_SCHEMA,
      execute: async () => ({ kind: "context.knowledge" as const, items: [] }),
    });
    await executeOf(ok)({}, {});
    expect(spy).toHaveBeenCalledWith(
      expect.stringMatching(/^\[chat-tool\] name=context\.knowledge ok durationMs=\d+$/),
    );

    spy.mockClear();
    const bad = defineChatTool("context.materials", {
      description: "d",
      inputSchema: NOOP_SCHEMA,
      execute: async () => {
        throw new Error("boom");
      },
    });
    await executeOf(bad)({}, {});
    expect(spy).toHaveBeenCalledWith(
      expect.stringMatching(/^\[chat-tool\] name=context\.materials error durationMs=\d+$/),
    );
  });
});

// ── [T-263] HITL 授权门:通用「未决→续跑」能力抽进 defineChatTool + buildChatToolApproval ──
describe("defineChatTool needsApproval + buildChatToolApproval(HITL 通用门)", () => {
  it("无 needsApproval 的工具 → getChatToolApprovalDecider 返 undefined,不进 toolApproval 配置", () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const t = defineChatTool("local.read", {
      description: "d",
      inputSchema: NOOP_SCHEMA,
      execute: async () => ({ kind: "local.read" }),
    });
    expect(getChatToolApprovalDecider(t)).toBeUndefined();
    expect(buildChatToolApproval({ "local.read": t } as unknown as ToolSet)).toBeUndefined();
  });

  it("登记 needsApproval → buildChatToolApproval 映射三态:user-approval / not-applicable / denied", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const decide = vi.fn(
      async (
        input: { path?: string },
      ): Promise<
        | { status: "user-approval" }
        | { status: "not-applicable" }
        | { status: "denied"; reason: string }
      > => {
        if (input.path === "~/.env") return { status: "denied", reason: "敏感文件不可读" };
        if (input.path === "~/granted.md") return { status: "not-applicable" };
        return { status: "user-approval" };
      },
    );
    const t = defineChatTool("local.read", {
      description: "d",
      inputSchema: PATH_SCHEMA,
      execute: async () => ({ kind: "local.read" }),
      needsApproval: decide,
    });
    // 判定器旁挂成功。
    expect(getChatToolApprovalDecider(t)).toBe(decide);

    const approval = buildChatToolApproval({ "local.read": t } as unknown as ToolSet);
    expect(approval).toBeDefined();
    const fn = approval!["local.read"]!;

    // 未授权 → 'user-approval'(SDK 挂起弹卡)。
    await expect(fn({ path: "~/Desktop/x.md" })).resolves.toBe("user-approval");
    // 已授权 → 'not-applicable'(免卡直接执行)。
    await expect(fn({ path: "~/granted.md" })).resolves.toBe("not-applicable");
    // 敏感硬拒 → { type:'denied', reason }(不弹卡、直接拒 + 原因)。
    await expect(fn({ path: "~/.env" })).resolves.toEqual({
      type: "denied",
      reason: "敏感文件不可读",
    });
  });

  it("判定器抛错 → 保守回 'not-applicable'(不因判定器抖动误挂授权门)", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const t = defineChatTool("local.read", {
      description: "d",
      inputSchema: NOOP_SCHEMA,
      execute: async () => ({ kind: "local.read" }),
      needsApproval: async () => {
        throw new Error("decide boom");
      },
    });
    const approval = buildChatToolApproval({ "local.read": t } as unknown as ToolSet);
    await expect(approval!["local.read"]!({ path: "x" })).resolves.toBe(
      "not-applicable",
    );
  });
});
