import { describe, it, expect } from "vitest";
import type { UIMessage } from "ai";
import {
  TOOL_RESULT_CLEARED_MESSAGE,
  omittedTurnsNotice,
  resolveToolResultKeepTurns,
  resolveContextWindowTokens,
  resolveTruncateKeepTurns,
  estimateTokens,
  projectChatHistory,
  formatChatContextLog,
  dropAbandonedApprovalParts,
  dropUnavailableScriptPatchParts,
} from "./chat-history-window";

// [T-239d] 对话历史窗口化 —— 投影层单测:①tool-result 清体只影响 N 轮之前、近轮原样;
// ②截窗保 system+近 K 轮 + 注入省略提示;③存储侧入参绝不被改(投影是副本);④日志格式锚定。

function userMsg(id: string, text: string): UIMessage {
  return { id, role: "user", parts: [{ type: "text", text }] } as UIMessage;
}

function assistantMsgWithTool(id: string, output: unknown): UIMessage {
  return {
    id,
    role: "assistant",
    parts: [
      { type: "text", text: `回复 ${id}` },
      {
        type: "tool-context.projects",
        toolCallId: `tc-${id}`,
        state: "output-available",
        input: { limit: 10 },
        output,
      },
    ],
  } as UIMessage;
}

// n 轮对话(每轮 user + assistant(带 tool 输出))。
function turns(n: number, outputSize = 10): UIMessage[] {
  const out: UIMessage[] = [];
  for (let i = 0; i < n; i++) {
    out.push(userMsg(`u-${i}`, `问题 ${i}`));
    out.push(assistantMsgWithTool(`a-${i}`, { rows: "x".repeat(outputSize) }));
  }
  return out;
}

const baseOpts = {
  systemText: "system",
  keepToolResultTurns: 4,
  keepTurns: 12,
  contextWindowTokens: 100000,
};

describe("[T-239d] env 解析器", () => {
  it("缺省:keepToolResultTurns=4 / window=100000 / keepTurns=12", () => {
    expect(resolveToolResultKeepTurns({})).toBe(4);
    expect(resolveContextWindowTokens({})).toBe(100000);
    expect(resolveTruncateKeepTurns({})).toBe(12);
  });
  it("env 可配 + 非法值回落默认", () => {
    expect(
      resolveToolResultKeepTurns({ CREATOROS_CHAT_TOOLRESULT_KEEP_TURNS: "2" }),
    ).toBe(2);
    expect(
      resolveContextWindowTokens({
        CREATOROS_CHAT_CONTEXT_WINDOW_TOKENS: "32000",
      }),
    ).toBe(32000);
    expect(resolveTruncateKeepTurns({ CREATOROS_CHAT_KEEP_TURNS: "6" })).toBe(6);
    expect(
      resolveToolResultKeepTurns({ CREATOROS_CHAT_TOOLRESULT_KEEP_TURNS: "abc" }),
    ).toBe(4);
    expect(
      resolveContextWindowTokens({ CREATOROS_CHAT_CONTEXT_WINDOW_TOKENS: "-1" }),
    ).toBe(1000); // 下限夹紧,防误配出 0 窗
  });
});

describe("[T-239d] tool-result 清体(近 N 轮之外)", () => {
  it("上下文逼近预算时,N 轮之前的 tool 输出替换为指针占位;近 N 轮原样", () => {
    const messages = turns(6, 3000); // 超 1000×80% 阈值,keepToolResultTurns=4 → 前 2 轮清体
    const p = projectChatHistory(messages, {
      ...baseOpts,
      keepTurns: 100,
      contextWindowTokens: 1000,
    });
    expect(p.cleared).toBe(2);
    // 前 2 轮 assistant 的 tool part 输出已清
    for (const i of [0, 1]) {
      const a = p.messages[i * 2 + 1] as { parts: Array<Record<string, unknown>> };
      const tool = a.parts.find((x) => x.type === "tool-context.projects")!;
      expect(tool.output).toBe(TOOL_RESULT_CLEARED_MESSAGE);
      // input / state / toolCallId 原样保留(只清输出体,不破坏成对结构)
      expect(tool.state).toBe("output-available");
      expect(tool.toolCallId).toBe(`tc-a-${i}`);
    }
    // 近 4 轮 tool 输出原样
    for (const i of [2, 3, 4, 5]) {
      const a = p.messages[i * 2 + 1] as { parts: Array<Record<string, unknown>> };
      const tool = a.parts.find((x) => x.type === "tool-context.projects")!;
      expect(tool.output).toEqual({ rows: "x".repeat(3000) });
    }
    // 文本 part 不动
    const first = p.messages[1] as { parts: Array<Record<string, unknown>> };
    expect(first.parts[0]).toEqual({ type: "text", text: "回复 a-0" });
  });

  it("[T-522] 预算充足时不因轮龄机械删除工具证据", () => {
    const messages = turns(20, 10);
    const p = projectChatHistory(messages, baseOpts);
    expect(p.estBefore).toBeLessThan(baseOpts.contextWindowTokens * 0.8);
    expect(p.cleared).toBe(0);
    expect(p.truncated).toBe(0);
    expect(p.messages).toEqual(messages);
  });

  it("轮数 ≤ N → 不清体、不截窗、消息原样", () => {
    const messages = turns(3);
    const p = projectChatHistory(messages, baseOpts);
    expect(p.cleared).toBe(0);
    expect(p.truncated).toBe(0);
    expect(p.messages).toEqual(messages);
    expect(p.estAfter).toBe(p.estBefore);
  });

  it("**入参消息对象绝不被改**(存储层投影隔离铁律)", () => {
    const messages = turns(6);
    const snapshot = JSON.parse(JSON.stringify(messages));
    projectChatHistory(messages, baseOpts);
    expect(messages).toEqual(snapshot);
  });
});

describe("[T-239d] token 估算截窗", () => {
  it("超「窗口×80%」→ 只保近 K 轮,更早整轮截掉 + 首条注入省略提示", () => {
    // 20 轮、每轮 tool 输出 3000 字符 → 估算远超 1000×0.8 token 阈值
    const messages = turns(20, 3000);
    const p = projectChatHistory(messages, {
      ...baseOpts,
      keepToolResultTurns: 100, // 关掉清体,单测截窗
      keepTurns: 5,
      contextWindowTokens: 1000,
    });
    expect(p.truncated).toBe(15);
    expect(p.messages).toHaveLength(10); // 5 轮 × (user+assistant)
    // 首条保留消息(该轮 user)注入省略提示
    const first = p.messages[0] as { role: string; parts: Array<{ type: string; text?: string }> };
    expect(first.role).toBe("user");
    expect(first.parts[0]!.text).toContain(omittedTurnsNotice(15));
    expect(first.parts[0]!.text).toContain("问题 15"); // 原文还在,提示是前缀
    // 最新一轮完整保留
    const last = p.messages[p.messages.length - 1] as { id: string };
    expect(last.id).toBe("a-19");
    expect(p.estAfter).toBeLessThan(p.estBefore);
  });

  it("没超阈 → 不截(truncated=0)", () => {
    const p = projectChatHistory(turns(20, 10), baseOpts);
    expect(p.truncated).toBe(0);
    expect(p.messages).toHaveLength(40);
  });

  it("估算 chars/3(粗估中文保守)", () => {
    expect(estimateTokens("abc")).toBe(2); // JSON 引号 +2 字符 → ceil(5/3)=2
  });
});

describe("[T-239d] 日志格式(SPEC 验收锚定)", () => {
  it("[chat-context] est=X→Y tokens cleared=N truncated=M", () => {
    const line = formatChatContextLog({
      messages: [],
      estBefore: 1234,
      estAfter: 567,
      cleared: 3,
      truncated: 2,
    });
    expect(line).toBe("[chat-context] est=1234→567 tokens cleared=3 truncated=2");
  });
});

// [T-274] 被遗弃的授权请求净化 —— HITL 授权卡没点就发新消息导致的悬空 tool-call → 崩整流。
function assistantWithToolState(
  id: string,
  state: string,
  extra: Record<string, unknown> = {},
): UIMessage {
  return {
    id,
    role: "assistant",
    parts: [
      { type: "text", text: `准备读文件 ${id}` },
      {
        type: "tool-local.read",
        toolCallId: `tc-${id}`,
        state,
        input: { path: "/Users/x/note.md" },
        ...extra,
      },
    ],
  } as UIMessage;
}

function toolStatesOf(m: UIMessage): string[] {
  const parts = (m as { parts?: Array<{ type?: string; state?: string }> }).parts ?? [];
  return parts.filter((p) => p.type?.startsWith("tool-")).map((p) => p.state ?? "");
}

describe("[T-274] dropAbandonedApprovalParts", () => {
  it("approval-requested 后面跟了新 user 消息 → 摘掉该悬空 tool 部件(text 保留)", () => {
    const msgs = [
      userMsg("u0", "读一下这个文件夹"),
      assistantWithToolState("a0", "approval-requested"),
      userMsg("u1", "帮我立一棵论点树"),
    ];
    const out = dropAbandonedApprovalParts(msgs);
    // 中间 assistant 的 tool 部件被摘,text 还在
    expect(toolStatesOf(out[1]!)).toEqual([]);
    const parts = (out[1] as { parts?: Array<{ type?: string }> }).parts ?? [];
    expect(parts.some((p) => p.type === "text")).toBe(true);
    // 入参不被改(纯函数,存储副本)
    expect(toolStatesOf(msgs[1]!)).toEqual(["approval-requested"]);
  });

  it("input-available/input-streaming 中断残留在 user 之前 → 一并摘", () => {
    const msgs = [
      userMsg("u0", "查一下"),
      assistantWithToolState("a0", "input-available"),
      assistantWithToolState("a1", "input-streaming"),
      userMsg("u1", "换个话题"),
    ];
    const out = dropAbandonedApprovalParts(msgs);
    expect(toolStatesOf(out[1]!)).toEqual([]);
    expect(toolStatesOf(out[2]!)).toEqual([]);
  });

  it("live 授权卡(末条 user 之后,无新 user 消息)→ 不动(不误伤当前轮/正常 resume)", () => {
    const msgs = [
      userMsg("u0", "读一下这个文件夹"),
      assistantWithToolState("a0", "approval-requested"),
    ];
    const out = dropAbandonedApprovalParts(msgs);
    expect(out).toBe(msgs); // 无改动 → 原引用返回
    expect(toolStatesOf(out[1]!)).toEqual(["approval-requested"]);
  });

  it("已批准 resume(approval-responded)在 user 之前也不摘 —— SDK 会执行/合成结果,不崩", () => {
    const msgs = [
      userMsg("u0", "读一下"),
      assistantWithToolState("a0", "approval-responded", {
        approval: { id: "ap0", approved: true },
      }),
      userMsg("u1", "继续"),
    ];
    const out = dropAbandonedApprovalParts(msgs);
    expect(toolStatesOf(out[1]!)).toEqual(["approval-responded"]);
  });

  it("已完成的 tool(output-available)不动", () => {
    const msgs = [
      userMsg("u0", "读一下"),
      assistantWithToolState("a0", "output-available", { output: { ok: true } }),
      userMsg("u1", "再来"),
    ];
    const out = dropAbandonedApprovalParts(msgs);
    expect(toolStatesOf(out[1]!)).toEqual(["output-available"]);
  });

  it("无 user 消息 / user 是首条 → 原样返回", () => {
    const only = [assistantWithToolState("a0", "approval-requested")];
    expect(dropAbandonedApprovalParts(only)).toBe(only);
    const firstUser = [userMsg("u0", "hi"), assistantWithToolState("a0", "approval-requested")];
    expect(dropAbandonedApprovalParts(firstUser)).toBe(firstUser);
  });
});

describe("[T-740] dropUnavailableScriptPatchParts", () => {
  it("当前未挂载局部补丁工具时，仅从喂模型的历史摘掉新旧形态的 script.patch parts", () => {
    const messages = [
      userMsg("u0", "改写第 2 段"),
      {
        id: "a0",
        role: "assistant",
        parts: [
          { type: "text", text: "已给出候选" },
          {
            type: "tool-script_patch",
            toolCallId: "tc-safe",
            state: "output-available",
            input: { replacementText: "新文" },
            output: { kind: "script.patch", replacementText: "新文" },
          },
          {
            type: "tool-script.patch",
            toolCallId: "tc-old-static",
            state: "output-available",
            input: { replacementText: "旧版候选" },
            output: { kind: "script.patch", replacementText: "旧版候选" },
          },
          {
            type: "tool-context.projects",
            toolCallId: "tc-keep",
            state: "output-available",
            input: {},
            output: { kind: "context.projects", rows: [] },
          },
        ],
      } as UIMessage,
      {
        id: "a1",
        role: "assistant",
        parts: [
          {
            type: "dynamic-tool",
            toolName: "script.patch",
            toolCallId: "tc-legacy",
            state: "output-error",
            input: {},
            errorText: "No such tool",
          },
        ],
      } as UIMessage,
      {
        id: "a2",
        role: "assistant",
        parts: [
          {
            type: "dynamic-tool",
            toolName: "script_patch",
            toolCallId: "tc-safe-dynamic",
            state: "output-error",
            input: {},
            errorText: "Invalid tool input",
          },
        ],
      } as UIMessage,
      userMsg("u1", "什么原因？"),
    ];

    const projected = dropUnavailableScriptPatchParts(messages, false);
    const projectedParts = projected.flatMap(
      (message) =>
        ((message as { parts?: Array<{ type?: string; toolName?: string }> })
          .parts ?? []),
    );
    expect(
      projectedParts.some(
        (part) =>
          part.type === "tool-script_patch" ||
          part.type === "tool-script.patch" ||
          (part.type === "dynamic-tool" &&
            (part.toolName === "script.patch" ||
              part.toolName === "script_patch")),
      ),
    ).toBe(false);
    expect(projectedParts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "text", text: "已给出候选" }),
        expect.objectContaining({ type: "tool-context.projects" }),
      ]),
    );
    expect(projected.map((message) => message.id)).not.toContain("a1");
    expect(projected.map((message) => message.id)).not.toContain("a2");
    expect(
      (messages[1] as { parts: Array<{ type: string }> }).parts.map(
        (part) => part.type,
      ),
    ).toContain("tool-script_patch");
  });

  it("当前有可信锚点且工具已挂载时原样保留局部改稿历史", () => {
    const messages = [
      userMsg("u0", "继续改这一段"),
      {
        id: "a0",
        role: "assistant",
        parts: [
          {
            type: "tool-script_patch",
            toolCallId: "tc-safe",
            state: "output-available",
            input: { replacementText: "新文" },
            output: { kind: "script.patch", replacementText: "新文" },
          },
        ],
      } as UIMessage,
    ];

    expect(dropUnavailableScriptPatchParts(messages, true)).toBe(messages);
  });
});
