import { describe, it, expect } from "vitest";
import { aiConversationResource } from "../../src/resources/ai.js";
import { aiOperations } from "../../src/operations/ai.js";

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
});
