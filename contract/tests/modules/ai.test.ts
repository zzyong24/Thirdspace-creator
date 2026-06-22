import { describe, it, expect } from "vitest";
import { aiConversationResource } from "../../src/resources/ai";
import { aiOperations } from "../../src/operations/ai";

describe("ai contract", () => {
  it("parses an AIConversation resource", () => {
    const c = aiConversationResource.parse({
      id: "ai-conv-script-help",
      userId: "user-zyongzhu",
      projectId: "project-ainativebrowser",
      title: "脚本润色助手",
      createdAt: "2026-06-06T01:00:00.000Z",
      updatedAt: "2026-06-13T02:00:00.000Z",
    });
    expect(c.title).toBe("脚本润色助手");
    expect(c.projectId).toBe("project-ainativebrowser");
  });

  it("registers the conversation list + task confirm endpoints", () => {
    expect(aiOperations.listConversations.method).toBe("GET");
    expect(aiOperations.listConversations.path).toBe("/ai/conversations");
    expect(aiOperations.listConversations.isList).toBe(true);
    expect(aiOperations.confirmTask.method).toBe("POST");
    expect(aiOperations.confirmTask.path).toBe("/ai/tasks/:taskId/confirm");
    expect(aiOperations.listConversations.fr.length).toBeGreaterThan(0);
  });

  it("registers the global task feed list endpoint", () => {
    // GAP-COP-feed: cross-project AI-task feed for the copilot 「最近任务」 surface.
    expect(aiOperations.listAITasks.id).toBe("ai.tasks.list");
    expect(aiOperations.listAITasks.method).toBe("GET");
    expect(aiOperations.listAITasks.path).toBe("/ai/tasks");
    expect(aiOperations.listAITasks.isList).toBe(true);
    // Distinct from the param'd single-task read.
    expect(aiOperations.getTask.path).toBe("/ai/tasks/:taskId");
    expect(aiOperations.listAITasks.fr.length).toBeGreaterThan(0);
  });
});
