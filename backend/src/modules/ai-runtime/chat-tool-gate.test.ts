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
  sanitizeSystemToolReferences,
  sanitizeToolName,
  sanitizeToolNames,
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
      expect.stringMatching(
        /^\[chat-tool\] name=context\.materials error durationMs=\d+ class=Error reason=unknown message="boom"$/,
      ),
    );
  });

  it("[T-486] 失败日志包含错误分类与脱敏原因，不泄露 token", async () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    const bad = defineChatTool("context.materials", {
      description: "d",
      inputSchema: NOOP_SCHEMA,
      execute: async () => {
        throw Object.assign(
          new Error("Failed after 3 attempts: Bearer sk-secret-token"),
          { statusCode: 503, code: "ECONNRESET" },
        );
      },
    });
    await executeOf(bad)({}, {});
    const line = String(spy.mock.calls.at(-1)?.[0] ?? "");
    expect(line).toContain("class=Error");
    expect(line).toContain("reason=http_503");
    expect(line).toContain("status=503");
    expect(line).toContain("message=");
    expect(line).not.toContain("sk-secret-token");
    expect(line).toContain("[REDACTED]");
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

// ── [T-439] 工具名合规化:模型 API 只收 ^[a-zA-Z0-9_-]+$,点号名会被 400 秒拒 ───────────────
describe("[T-439] 工具名合规化(DeepSeek/OpenAI/Anthropic 只收 ^[a-zA-Z0-9_-]+$)", () => {
  it("点号 → 下划线;已合规的名字原样不动", () => {
    expect(sanitizeToolName("context.positioning.detail")).toBe("context_positioning_detail");
    expect(sanitizeToolName("local.read")).toBe("local_read");
    expect(sanitizeToolName("already_safe-1")).toBe("already_safe-1");
  });

  it("全部注册工具名 sanitize 后都符合模型 API 规则(且长度 ≤64)", () => {
    for (const n of ALL_CHAT_TOOL_NAMES) {
      expect(sanitizeToolName(n)).toMatch(/^[a-zA-Z0-9_-]{1,64}$/);
    }
  });

  it("全部注册工具名 sanitize 后互不撞名(撞名=工具被静默覆盖,模型永远调不到它)", () => {
    const seen = new Set<string>();
    for (const n of ALL_CHAT_TOOL_NAMES) seen.add(sanitizeToolName(n));
    expect(seen.size).toBe(ALL_CHAT_TOOL_NAMES.length);
  });

  it("sanitizeToolNames 只换 key、不动 tool 实例;撞名 fail-fast 抛错(拒绝静默覆盖)", () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    // 用**真实已登记信封**的工具名(defineChatTool 会对未登记名直接抛错,见上文信封 guard)。
    const a = defineChatTool("context.projects", {
      description: "d",
      inputSchema: NOOP_SCHEMA,
      execute: async () => ({ kind: "context.projects" }),
    });
    const out = sanitizeToolNames({ "context.projects": a } as unknown as ToolSet);
    expect(Object.keys(out)).toEqual(["context_projects"]);
    expect(out["context_projects"]).toBe(a); // 同一实例 → execute 零改动
    expect(() =>
      sanitizeToolNames({ "context.projects": a, context_projects: a } as unknown as ToolSet),
    ).toThrow(/撞名/);
  });

  it("HITL 授权门的键跟随 sanitize 后的 key —— 改名不会让该拦的工具漏拦", () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const decide = vi.fn(async () => ({ status: "user-approval" }) as const);
    const t = defineChatTool("local.read", {
      description: "d",
      inputSchema: NOOP_SCHEMA,
      execute: async () => ({ kind: "local.read" }),
      needsApproval: decide,
    });
    const approval = buildChatToolApproval(
      sanitizeToolNames({ "local.read": t } as unknown as ToolSet),
    );
    // 键必须与真正发给模型的 function.name 一致,否则 SDK 回传时匹配不上 = 授权门形同虚设
    expect(Object.keys(approval ?? {})).toEqual(["local_read"]);
  });
});

// ── [T-439 配套] 前端 getToolName 靠 `_`→`.` 还原工具名,故注册表不得出现下划线 ──────────
describe("[T-439 配套] 工具名不得含下划线(前端还原的前提)", () => {
  it("全部注册工具名都不含 `_` —— 否则前端 `_`→`.` 还原出歧义,卡片会渲错/渲不出", () => {
    const withUnderscore = ALL_CHAT_TOOL_NAMES.filter((n) => n.includes("_"));
    expect(withUnderscore).toEqual([]);
  });

  it("sanitize 后再按 `_`→`.` 还原,必须精确回到原名(端到端往返)", () => {
    for (const n of ALL_CHAT_TOOL_NAMES) {
      expect(sanitizeToolName(n).replace(/_/g, ".")).toBe(n);
    }
  });
});

describe("[T-456] sanitizeSystemToolReferences —— system prompt 里带点工具名字面量换名", () => {
  const tools = {
    "context.projects": { execute: () => "x" },
    "context.metrics": { execute: () => "x" },
    "context.artifact.text": { execute: () => "x" },
    "context.positioning.detail": { execute: () => "x" },
    positioning_generate: { execute: () => "x" }, // 已合规,不动
  } as unknown as ToolSet;

  it("单出现:整词替换,不动周围文本", () => {
    const s = "要拿作品列表,请调 context.projects,然后...";
    expect(sanitizeSystemToolReferences(s, tools)).toBe(
      "要拿作品列表,请调 context_projects,然后...",
    );
  });

  it("多出现同一工具名:全替", () => {
    const s = "先 context.projects 拿 id 列表;再 context.projects 里选一条。";
    expect(sanitizeSystemToolReferences(s, tools)).toBe(
      "先 context_projects 拿 id 列表;再 context_projects 里选一条。",
    );
  });

  it("长短名并存:长名先替(避免 context.projects 里的 'context' 被短前缀吃)", () => {
    // context.artifact.text 是最长的,先替 → 不会被 context.projects/context.metrics 破
    const s = "读稿调 context.artifact.text,列表调 context.projects,指标调 context.metrics";
    expect(sanitizeSystemToolReferences(s, tools)).toBe(
      "读稿调 context_artifact_text,列表调 context_projects,指标调 context_metrics",
    );
  });

  it("已合规名 / 未列入 tools 的名字不动", () => {
    const s = "positioning_generate 已合规不动;random.other.name 也不动(不在 tools)";
    expect(sanitizeSystemToolReferences(s, tools)).toBe(s);
  });

  it("原始名是另一个原始名的前缀:精确边界不误伤", () => {
    // "context.projects" 若被错误替换成 "context_projects",不能污染 "context.projects.detail"
    // ——但注意:这里我们的 tools 定义里 "context.projects" 和 "context.positioning.detail" 都在,
    //   不涉及前缀嵌套。如果真有嵌套(context.projects vs context.projects.something),lookaround
    //   保证 "context.projects.something" 里的 "context.projects" 不被替
    const s = "调 context.projects.something 而非 context.projects";
    const result = sanitizeSystemToolReferences(s, tools);
    // "context.projects.something" 不在 tools 里 → 整体不动;"context.projects"(单独)才替。
    expect(result).toBe("调 context.projects.something 而非 context_projects");
  });

  it("tools 空 / 全合规 → 原文返回", () => {
    expect(sanitizeSystemToolReferences("hello", {} as ToolSet)).toBe("hello");
    expect(sanitizeSystemToolReferences("hello", { positioning_generate: {} } as unknown as ToolSet)).toBe(
      "hello",
    );
  });
});
