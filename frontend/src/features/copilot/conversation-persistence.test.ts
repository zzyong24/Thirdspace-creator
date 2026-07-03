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
