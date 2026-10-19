/**
 * Unit tests for the Copilot 会话持久化 + 读回映射纯逻辑(conversation-persistence.ts):
 *   - localStorage 按 surface 分桶读写 + 清除;隐私模式/禁用 storage 降级不抛。
 *   - ai_messages(role/content)→ UIMessage(parts:[{type:"text"}])映射:system→assistant、
 *     空内容跳过、role 归一。
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  convKey,
  readStoredConversationId,
  writeStoredConversationId,
  toUIMessages,
  sumUsageTokens,
  sumStreamedUsage,
  type WireAIMessage,
} from "./conversation-persistence";

afterEach(() => {
  try {
    window.localStorage.clear();
  } catch {
    /* noop */
  }
  vi.restoreAllMocks();
});

describe("conversation-persistence: localStorage 按 scope 分桶(T-096)", () => {
  it("键按 scope 派生(global/project:<id>/surface:<name> 互相独立)", () => {
    expect(convKey("global")).toBe("copilot:conv:global");
    expect(convKey("project:proj-1")).toBe("copilot:conv:project:proj-1");
    expect(convKey("surface:topics")).toBe("copilot:conv:surface:topics");
    expect(convKey("global")).not.toBe(convKey("surface:topics"));
  });

  it("[T-096 矩阵#5 纯逻辑面] 清 surface:topics 的指针不动 global 的指针(不同桶互不覆盖)", () => {
    writeStoredConversationId("global", "conv-global");
    writeStoredConversationId("surface:topics", "conv-topics");
    writeStoredConversationId("surface:topics", null);
    expect(readStoredConversationId("surface:topics")).toBeNull();
    expect(readStoredConversationId("global")).toBe("conv-global");
  });

  it("写入后读回同 surface 的 conversationId;不同 surface 不串", () => {
    writeStoredConversationId("topics", "conv-topics");
    writeStoredConversationId("calibration", "conv-cal");
    expect(readStoredConversationId("topics")).toBe("conv-topics");
    expect(readStoredConversationId("calibration")).toBe("conv-cal");
    expect(readStoredConversationId("review")).toBeNull();
  });

  it("写 null/空串 → 清除该 surface 的存档", () => {
    writeStoredConversationId("topics", "conv-1");
    expect(readStoredConversationId("topics")).toBe("conv-1");
    writeStoredConversationId("topics", null);
    expect(readStoredConversationId("topics")).toBeNull();
  });

  it("读:storage 抛异常(隐私模式)→ 降级为 null,不抛", () => {
    vi.spyOn(window.localStorage, "getItem").mockImplementation(() => {
      throw new Error("SecurityError: storage disabled");
    });
    expect(readStoredConversationId("topics")).toBeNull();
  });

  it("写:storage 抛异常(隐私模式)→ 静默降级,不抛", () => {
    vi.spyOn(window.localStorage, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
    expect(() => writeStoredConversationId("topics", "conv-1")).not.toThrow();
  });
});

describe("conversation-persistence: toUIMessages 映射", () => {
  it("role/content → UIMessage(parts:[{type:text}]);顺序保留", () => {
    const rows: WireAIMessage[] = [
      { id: "m1", role: "user", content: "你好" },
      { id: "m2", role: "assistant", content: "在的" },
    ];
    const ui = toUIMessages(rows);
    expect(ui).toHaveLength(2);
    expect(ui[0]).toMatchObject({
      id: "m1",
      role: "user",
      parts: [{ type: "text", text: "你好" }],
    });
    expect(ui[1]).toMatchObject({
      id: "m2",
      role: "assistant",
      parts: [{ type: "text", text: "在的" }],
    });
  });

  it("role=system 折叠成 assistant(UI 只分我/助手,不丢内容)", () => {
    const ui = toUIMessages([{ id: "s1", role: "system", content: "系统提示" }]);
    expect(ui).toHaveLength(1);
    expect(ui[0].role).toBe("assistant");
  });

  it("空/纯空白 content 跳过(不渲染空气泡)", () => {
    const ui = toUIMessages([
      { id: "e1", role: "user", content: "   " },
      { id: "e2", role: "assistant", content: "" },
      { id: "k1", role: "user", content: "有内容" },
    ]);
    expect(ui).toHaveLength(1);
    expect(ui[0].id).toBe("k1");
  });
});

describe("conversation-persistence: [T-128] 落库 parts 回放(卡刷新不丢)", () => {
  it("有落库 parts(含 tool-result 卡)→ 原样回放,复用现有卡渲染分支", () => {
    const parts = [
      { type: "text", text: "给你 3 个选题" },
      {
        type: "tool-topic.generate",
        toolCallId: "tc-1",
        state: "output-available",
        input: {},
        output: { kind: "topic.candidates", items: [{ title: "A" }] },
      },
    ];
    const ui = toUIMessages([
      { id: "m1", role: "assistant", content: "给你 3 个选题", parts },
    ]);
    expect(ui).toHaveLength(1);
    // parts 原样透传(含 tool part),恢复时 ai-copilot-content 据 part.output.kind 渲候选卡。
    expect(ui[0].parts).toEqual(parts);
    expect(ui[0].role).toBe("assistant");
  });

  it("parts 只含纯文本 part → 回放文本气泡", () => {
    const ui = toUIMessages([
      {
        id: "m1",
        role: "assistant",
        content: "在的",
        parts: [{ type: "text", text: "在的" }],
      },
    ]);
    expect(ui[0].parts).toEqual([{ type: "text", text: "在的" }]);
  });

  it("存量行/旧后端(parts 缺失 或 [])→ 回落 content 文本气泡(向后兼容)", () => {
    const ui = toUIMessages([
      { id: "m1", role: "assistant", content: "旧文本" }, // parts undefined
      { id: "m2", role: "user", content: "旧用户", parts: [] }, // parts 空数组
    ]);
    expect(ui).toHaveLength(2);
    expect(ui[0].parts).toEqual([{ type: "text", text: "旧文本" }]);
    expect(ui[1].parts).toEqual([{ type: "text", text: "旧用户" }]);
  });

  it("parts 只含无渲染内容的空壳(step-start / 空 text)→ 回落 content", () => {
    const ui = toUIMessages([
      {
        id: "m1",
        role: "assistant",
        content: "兜底文本",
        parts: [{ type: "step-start" }, { type: "text", text: "  " }],
      },
    ]);
    // 无可渲染 part → 回落 content 文本气泡。
    expect(ui[0].parts).toEqual([{ type: "text", text: "兜底文本" }]);
  });
});

// ── [T-239e] 会话成本角标的两本账:落库底数 + 流式增量 ────────────────────────────────
describe("conversation-persistence: [T-239e] token 用量累计", () => {
  it("sumUsageTokens:只累加真数字;老消息/user 行 null/undefined 诚实跳过(不崩)", () => {
    const rows: WireAIMessage[] = [
      { id: "m1", role: "user", content: "hi" }, // 无用量字段(老后端形)
      { id: "m2", role: "assistant", content: "旧轮", inputTokens: null, outputTokens: null },
      { id: "m3", role: "assistant", content: "新轮", inputTokens: 1200, outputTokens: 340 },
      { id: "m4", role: "assistant", content: "再一轮", inputTokens: 800, outputTokens: 60 },
    ];
    expect(sumUsageTokens(rows)).toEqual({ inputTokens: 2000, outputTokens: 400 });
  });

  it("sumUsageTokens:全老消息 → 0/0(角标不渲,诚实空态)", () => {
    const rows: WireAIMessage[] = [
      { id: "m1", role: "user", content: "hi" },
      { id: "m2", role: "assistant", content: "旧" },
    ];
    expect(sumUsageTokens(rows)).toEqual({ inputTokens: 0, outputTokens: 0 });
  });

  it("sumStreamedUsage:读 metadata.usage;无 metadata/形状不合跳过", () => {
    const messages = [
      { metadata: undefined }, // 读回历史(toUIMessages 不设 metadata)
      { metadata: { usage: { inputTokens: 500, outputTokens: 90 } } },
      { metadata: { usage: { inputTokens: null, outputTokens: "x" } } }, // 形状不合
      { metadata: { other: 1 } },
    ];
    expect(sumStreamedUsage(messages)).toEqual({ inputTokens: 500, outputTokens: 90 });
  });
});

describe('账号组对话指针隔离',()=>{
 it('全局入口切组后不会读到另一组指针，原组晚到回执仍写原桶',()=>{
  window.localStorage.setItem('creatoros:current-group','group-a');
  writeStoredConversationId('global','conversation-a');
  window.localStorage.setItem('creatoros:current-group','group-b');
  expect(readStoredConversationId('global')).toBeNull();
  writeStoredConversationId('global','conversation-b');
  writeStoredConversationId('global','late-a','group:group-a');
  expect(readStoredConversationId('global')).toBe('conversation-b');
  window.localStorage.setItem('creatoros:current-group','group-a');
  expect(readStoredConversationId('global')).toBe('late-a');
 });
});
