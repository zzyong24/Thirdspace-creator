import { describe, it, expect } from "vitest";
import {
  aiConversationResource,
  aiTaskResultResource,
} from "../../src/resources/ai";
import { aiOperations } from "../../src/operations/ai";

describe("ai contract", () => {
  it("parses an AIConversation resource", () => {
    const c = aiConversationResource.parse({
      id: "ai-conv-script-help",
      userId: "user-zyongzhu",
      projectId: "project-ainativebrowser",
      // [T-096] 会话作用域(入口级隔离):项目会话归 project:<id> 桶。
      scope: "project:project-ainativebrowser",
      title: "脚本润色助手",
      createdAt: "2026-06-06T01:00:00.000Z",
      updatedAt: "2026-06-13T02:00:00.000Z",
    });
    expect(c.title).toBe("脚本润色助手");
    expect(c.projectId).toBe("project-ainativebrowser");
    expect(c.scope).toBe("project:project-ainativebrowser");
  });

  it("[T-096] list query 接受可选 scope 过滤;create body 接受可选 scope(additive,旧调用零破坏)", () => {
    const q = aiOperations.listConversations.query!.parse({
      page: 1,
      pageSize: 20,
      scope: "surface:topics",
    });
    expect((q as { scope?: string }).scope).toBe("surface:topics");
    // 不传 scope 仍合法(旧调用不破)。
    expect(() =>
      aiOperations.listConversations.query!.parse({ page: 1, pageSize: 20 }),
    ).not.toThrow();
    const b = aiOperations.createConversation.body!.parse({
      title: "蒸馏",
      scope: "surface:knowledge-distill",
    });
    expect((b as { scope?: string }).scope).toBe("surface:knowledge-distill");
    expect(() =>
      aiOperations.createConversation.body!.parse({ title: "旧调用" }),
    ).not.toThrow();
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

  it("T-512 候选结果携带服务端完整性判定，且保留其它 resultData 字段", () => {
    const result = aiTaskResultResource.parse({
      id: "result-script-1",
      aiTaskId: "task-script-1",
      resultType: "artifact_version",
      artifactId: null,
      knowledgeItemId: null,
      assetId: null,
      resultData: {
        validationStatus: "invalid",
        validationErrors: ["当前写稿技能要求至少 6 段，本次只有 1 段。"],
        canAdopt: false,
        sections: [{ heading: "开场", body: "只有一段" }],
      },
    });

    expect(result.resultData.validationStatus).toBe("invalid");
    expect(result.resultData.validationErrors).toEqual([
      "当前写稿技能要求至少 6 段，本次只有 1 段。",
    ]);
    expect(result.resultData.canAdopt).toBe(false);
    expect(result.resultData.sections).toEqual([
      { heading: "开场", body: "只有一段" },
    ]);
  });

  it("T-512 完整性字段若出现必须是完整三元组，禁止矛盾状态", () => {
    const base = {
      id: "result-script-2",
      aiTaskId: "task-script-2",
      resultType: "artifact_version",
      artifactId: null,
      knowledgeItemId: null,
      assetId: null,
    };

    expect(() =>
      aiTaskResultResource.parse({
        ...base,
        resultData: { validationStatus: "valid", canAdopt: true },
      }),
    ).toThrow();
    expect(() =>
      aiTaskResultResource.parse({
        ...base,
        resultData: {
          validationStatus: "invalid",
          validationErrors: [],
          canAdopt: true,
        },
      }),
    ).toThrow();
  });

  it("非 script.draft 的旧结果无需伪造完整性字段，原有载荷仍透传", () => {
    const result = aiTaskResultResource.parse({
      id: "result-topic-1",
      aiTaskId: "task-topic-1",
      resultType: "topic_candidates",
      artifactId: null,
      knowledgeItemId: null,
      assetId: null,
      resultData: { items: [{ title: "选题 A" }] },
    });

    expect(result.resultData.items).toEqual([{ title: "选题 A" }]);
    expect(result.resultData.validationStatus).toBeUndefined();
  });
});
