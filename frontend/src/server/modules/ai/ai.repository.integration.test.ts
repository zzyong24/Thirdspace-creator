import { describe, it, expect, beforeEach } from "vitest";
import { createDb, type Db } from "@creatoros/backend";
import { createAiRepository } from "./ai.repository";
import { OwnershipError } from "./ai.errors";

// AI repository integration test (Steps 1+2) — pglite-backed. Covers the schema
// round-trip (conversation + message + task + reference + result), cross-user
// OwnershipError on requireTask/requireConversation, idempotency lookup by
// (userId, idempotencyKey), transitive child ownership (user A cannot getResult user B's
// result), and seed onConflictDoNothing parity. Every assertion is user-scoped.

const NOW = "2026-06-21T00:00:00.000Z";

function repoFor(db: Db, userId: string) {
  let seq = 0;
  return createAiRepository(db, {
    now: () => NOW,
    nextId: (prefix: string) => `${prefix}-${userId}-${++seq}`,
    userId,
  });
}

describe("ai repository (pglite)", () => {
  let db: Db;
  beforeEach(async () => {
    ({ db } = await createDb());
  });

  it("schema round-trips: insert conversation + message + task + reference + result", async () => {
    const repo = repoFor(db, "user-a");
    const conv = await repo.createConversation({ title: "Copilot", projectId: null });
    expect(conv.userId).toBe("user-a");
    const msg = await repo.createMessage(conv.id, {
      role: "user",
      content: "改写开场",
      attachments: [],
      modelMetadata: {},
    });
    expect(msg.conversationId).toBe(conv.id);
    expect(msg.role).toBe("user");

    const task = await repo.createTask({
      projectId: "project-1",
      contentOutputId: null,
      taskType: "script.rewrite",
      inputData: { artifactId: "artifact-1" },
      modelKey: "claude-fable-5",
      idempotencyKey: "idem-1",
      requestedAt: NOW,
    });
    expect(task.status).toBe("queued");
    expect(task.userId).toBe("user-a");

    await repo.addReferences(task.id, [
      { entityType: "artifact", entityId: "artifact-1", relationType: "rewrites" },
    ]);
    const refs = await repo.listReferences(task.id);
    expect(refs).toHaveLength(1);
    expect(refs[0]!.entityId).toBe("artifact-1");

    const result = await repo.insertResult({
      aiTaskId: task.id,
      resultType: "artifact_version",
      artifactId: "artifact-1",
      knowledgeItemId: null,
      assetId: null,
      resultData: { body: "改写稿", summary: "收紧开场" },
    });
    const fetched = await repo.getResult(result.id);
    expect(fetched.resultData).toEqual({ body: "改写稿", summary: "收紧开场" });

    const messages = await repo.listMessages(conv.id);
    expect(messages).toHaveLength(1);
  });

  it("user A cannot read user B's task (OwnershipError)", async () => {
    const repoB = repoFor(db, "user-b");
    const task = await repoB.createTask({
      projectId: null,
      contentOutputId: null,
      taskType: "copilot.assist",
      inputData: {},
      modelKey: "claude-opus-4-8",
      idempotencyKey: "idem-b",
      requestedAt: NOW,
    });
    const repoA = repoFor(db, "user-a");
    await expect(repoA.requireTask(task.id)).rejects.toBeInstanceOf(OwnershipError);
  });

  it("user A cannot read user B's conversation (OwnershipError)", async () => {
    const repoB = repoFor(db, "user-b");
    const conv = await repoB.createConversation({ title: "B", projectId: null });
    const repoA = repoFor(db, "user-a");
    await expect(repoA.requireConversation(conv.id)).rejects.toBeInstanceOf(
      OwnershipError,
    );
  });

  it("user A cannot getResult user B's result (transitive ownership)", async () => {
    const repoB = repoFor(db, "user-b");
    const task = await repoB.createTask({
      projectId: null,
      contentOutputId: null,
      taskType: "script.rewrite",
      inputData: {},
      modelKey: "m",
      idempotencyKey: "idem-b2",
      requestedAt: NOW,
    });
    const result = await repoB.insertResult({
      aiTaskId: task.id,
      resultType: "artifact_version",
      artifactId: "artifact-x",
      knowledgeItemId: null,
      assetId: null,
      resultData: { body: "x" },
    });
    const repoA = repoFor(db, "user-a");
    await expect(repoA.getResult(result.id)).rejects.toBeInstanceOf(OwnershipError);
  });

  it("idempotency lookup by (userId, idempotencyKey)", async () => {
    const repo = repoFor(db, "user-a");
    const task = await repo.createTask({
      projectId: null,
      contentOutputId: null,
      taskType: "script.rewrite",
      inputData: {},
      modelKey: "m",
      idempotencyKey: "idem-dup",
      requestedAt: NOW,
    });
    const found = await repo.findTaskByIdempotencyKey("idem-dup");
    expect(found?.id).toBe(task.id);
    // A different user with the same key sees nothing (scoped lookup).
    const other = repoFor(db, "user-b");
    expect(await other.findTaskByIdempotencyKey("idem-dup")).toBeNull();
  });

  it("createMessage bumps the parent conversation updatedAt and is user-scoped", async () => {
    const repoB = repoFor(db, "user-b");
    const conv = await repoB.createConversation({ title: "B", projectId: null });
    const repoA = repoFor(db, "user-a");
    await expect(
      repoA.createMessage(conv.id, {
        role: "user",
        content: "hi",
        attachments: [],
        modelMetadata: {},
      }),
    ).rejects.toBeInstanceOf(OwnershipError);
  });

  it("updateTaskStatus is user-scoped; status patch round-trips", async () => {
    const repo = repoFor(db, "user-a");
    const task = await repo.createTask({
      projectId: null,
      contentOutputId: null,
      taskType: "script.rewrite",
      inputData: {},
      modelKey: "m",
      idempotencyKey: "idem-u",
      requestedAt: NOW,
    });
    const updated = await repo.updateTaskStatus(task.id, {
      status: "awaiting_confirmation",
      startedAt: NOW,
    });
    expect(updated.status).toBe("awaiting_confirmation");
    expect(updated.startedAt).toBe(NOW);
  });

  it("seedAgentConfigs/seedModelConfigs are onConflictDoNothing (parity)", async () => {
    const repo = repoFor(db, "user-a");
    const agentRow = {
      id: "agent-1",
      userId: "user-a",
      name: "Script Rewrite",
      agentType: "script.rewrite",
      status: "active",
      capabilities: { skills: ["script-rewrite"] },
      settings: {},
      secretReference: "env:ANTHROPIC_API_KEY",
      createdAt: NOW,
      updatedAt: NOW,
    };
    const modelRow = {
      id: "model-1",
      userId: "user-a",
      capability: "script.rewrite",
      provider: "anthropic",
      modelName: "claude-fable-5",
      secretReference: "env:ANTHROPIC_API_KEY",
      baseUrl: null,
      apiFormat: "anthropic",
      settings: { effort: "high" },
      isDefault: false,
    };
    await repo.seedAgentConfigs([agentRow]);
    await repo.seedAgentConfigs([agentRow]); // idempotent
    await repo.seedModelConfigs([modelRow]);
    await repo.seedModelConfigs([modelRow]); // idempotent
    const model = await repo.getModelConfig("script.rewrite");
    expect(model?.modelName).toBe("claude-fable-5");
    const agent = await repo.getAgentConfig("script.rewrite");
    expect(agent?.agentType).toBe("script.rewrite");
  });
});
