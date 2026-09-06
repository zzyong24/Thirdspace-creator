import { expect, it, vi } from "vitest";
import { createCopilotBusinessAdapter } from "./copilot-business-adapter";
const ctx = {
  userId: "u",
  accountId: "a",
  requestId: "r",
  source: "user" as const,
};
function fixture() {
  const rows = [
    {
      id: "m1",
      conversationId: "c",
      role: "user",
      content: "原始问题",
      modelMetadata: { replyTaskId: "task" },
    },
    {
      id: "future",
      conversationId: "c",
      role: "user",
      content: "稍后输入",
      modelMetadata: {},
    },
  ];
  const ai = {
    getConversation: vi.fn(async () => ({ id: "c", projectId: "p" })),
    listMessages: vi.fn(async () => rows),
  };
  const assertProject = vi.fn(async () => {}),
    positioning = { getPositioningCenter: vi.fn(async () => null) };
  const adapter = createCopilotBusinessAdapter({
    ai: ai as never,
    assertProject,
    positioning: positioning as never,
  });
  const task = {
    id: "task",
    retryOfTaskId: null,
    projectId: "p",
    skillSnapshot: {} as never,
    inputData: {
      conversationId: "c",
      sourceMessageId: "m1",
      historyMessageIds: ["m1"],
      projectId: "p",
    },
  };
  return { adapter, task, rows, ai, assertProject, positioning };
}
it("从真实会话取冻结历史，不读取客户端正文，也不混入后发消息", async () => {
  const f = fixture();
  const facets = await f.adapter.prepare(ctx, {
    ...f.task,
    inputData: { ...f.task.inputData, content: "伪造" },
  });
  expect(facets.transcript).toBe("用户：原始问题");
  expect(facets.transcript).not.toContain("稍后");
  expect(JSON.parse(facets.__copilotReply!)).toMatchObject({
    conversationId: "c",
    sourceMessageId: "m1",
    historyMessageIds: ["m1"],
    projectId: "p",
  });
  expect(f.assertProject).toHaveBeenCalledWith(ctx, "p");
});
it.each(["project", "source", "missing", "duplicate", "order"])(
  "拒绝%s断链，配置上下文不得提前读取",
  async (mode) => {
    const f = fixture();
    if (mode === "project") f.task.projectId = "other";
    if (mode === "source") f.rows[0]!.modelMetadata.replyTaskId = "other";
    if (mode === "missing")
      f.task.inputData.historyMessageIds = ["missing", "m1"];
    if (mode === "duplicate") f.task.inputData.historyMessageIds = ["m1", "m1"];
    if (mode === "order") f.task.inputData.historyMessageIds = ["m1", "future"];
    await expect(f.adapter.prepare(ctx, f.task)).rejects.toThrow();
    expect(f.positioning.getPositioningCenter).not.toHaveBeenCalled();
  },
);
