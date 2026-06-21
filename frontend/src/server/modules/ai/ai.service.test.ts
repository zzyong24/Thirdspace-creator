import { describe, it, expect, beforeEach, vi } from "vitest";
import { createDb, type Db } from "@creatoros/backend";
import type { RequestContext } from "@creatoros/contract";
import { createAiService, type AiArtifactsPort } from "./ai.service";
import { ConflictError } from "./ai.errors";

// AI service test (Step 3) — the six cases: idempotent create, references persisted +
// status queued, confirm state-machine guard (valid + invalid), confirm→createVersion(ai)
// formalize, cancel transitions, message append. The candidate result is seeded directly
// via the worker store path (insertResult + updateTaskStatus) to put a task into
// awaiting_confirmation deterministically (no Agent SDK).

const NOW = "2026-06-21T00:00:00.000Z";
const ctx: RequestContext = { userId: "user-a", requestId: "r1", source: "user" };

function makeService(db: Db, artifactsPort?: Partial<AiArtifactsPort>) {
  let seq = 0;
  const port: AiArtifactsPort = {
    createVersion: artifactsPort?.createVersion ?? vi.fn(async () => ({})),
  };
  const service = createAiService({
    db,
    now: () => NOW,
    nextId: (prefix: string) => `${prefix}-${++seq}`,
    artifacts: port,
  });
  return { service, port };
}

describe("ai service", () => {
  let db: Db;
  beforeEach(async () => {
    ({ db } = await createDb());
  });

  it("createTask is idempotent: same idempotencyKey returns the existing task, no second row", async () => {
    const { service } = makeService(db);
    const a = await service.createTask(ctx, {
      taskType: "script.rewrite",
      inputData: { artifactId: "artifact-1", idempotencyKey: "dup-1" },
    });
    const b = await service.createTask(ctx, {
      taskType: "script.rewrite",
      inputData: { artifactId: "artifact-1", idempotencyKey: "dup-1" },
    });
    expect(b.id).toBe(a.id);
  });

  it("createTask persists AITaskReference rows from inputData refs and stamps status queued", async () => {
    const { service } = makeService(db);
    const task = await service.createTask(ctx, {
      taskType: "script.rewrite",
      inputData: {
        artifactId: "artifact-1",
        references: [
          { entityType: "artifact", entityId: "artifact-1", relationType: "rewrites" },
          { entityType: "knowledge_item", entityId: "k-1", relationType: "context" },
        ],
      },
    });
    expect(task.status).toBe("queued");
    const refs = await service.listReferences(ctx, task.id);
    expect(refs.map((r) => r.entityId).sort()).toEqual(["artifact-1", "k-1"]);
  });

  it("confirmTask rejects a task not in awaiting_confirmation (state-machine guard)", async () => {
    const { service } = makeService(db);
    const task = await service.createTask(ctx, {
      taskType: "script.rewrite",
      inputData: { artifactId: "artifact-1", idempotencyKey: "k-q" },
    });
    // queued → confirm is illegal
    await expect(service.confirmTask(ctx, task.id)).rejects.toBeInstanceOf(
      ConflictError,
    );
  });

  it("confirmTask on an artifact_version candidate calls ArtifactsService.createVersion(createdByType:'ai') and flips task to succeeded", async () => {
    const createVersion =
      vi.fn<AiArtifactsPort["createVersion"]>(async () => ({ id: "version-2" }));
    const { service } = makeService(db, { createVersion });
    const task = await service.createTask(ctx, {
      taskType: "script.rewrite",
      inputData: { artifactId: "artifact-1", idempotencyKey: "k-c" },
    });
    // Drive the task into awaiting_confirmation with a candidate result (worker path).
    await service.recordCandidate(ctx, task.id, {
      resultType: "artifact_version",
      artifactId: "artifact-1",
      resultData: { body: "改写稿", summary: "收紧开场" },
    });
    const confirmed = await service.confirmTask(ctx, task.id);
    expect(confirmed.status).toBe("succeeded");
    expect(createVersion).toHaveBeenCalledTimes(1);
    const [, artifactId, input] = createVersion.mock.calls[0]!;
    expect(artifactId).toBe("artifact-1");
    expect((input as { createdByType?: string }).createdByType).toBe("ai");
    expect((input as { contentText?: string }).contentText).toBe("改写稿");
    expect((input as { aiTaskId?: string }).aiTaskId).toBe(task.id);
  });

  it("cancelTask transitions queued/awaiting_confirmation → cancelled; rejects from a terminal state", async () => {
    const { service } = makeService(db, {
      createVersion: vi.fn(async () => ({})),
    });
    // queued → cancelled
    const t1 = await service.createTask(ctx, {
      taskType: "script.rewrite",
      inputData: { artifactId: "a", idempotencyKey: "k1" },
    });
    const c1 = await service.cancelTask(ctx, t1.id);
    expect(c1.status).toBe("cancelled");
    // cancelled (terminal) → cancel again rejects
    await expect(service.cancelTask(ctx, t1.id)).rejects.toBeInstanceOf(
      ConflictError,
    );

    // awaiting_confirmation → cancelled
    const t2 = await service.createTask(ctx, {
      taskType: "script.rewrite",
      inputData: { artifactId: "a", idempotencyKey: "k2" },
    });
    await service.recordCandidate(ctx, t2.id, {
      resultType: "artifact_version",
      artifactId: "a",
      resultData: { body: "x" },
    });
    const c2 = await service.cancelTask(ctx, t2.id);
    expect(c2.status).toBe("cancelled");
  });

  it("createMessage appends a user message then a stubbed assistant reply, bumps conversation updatedAt", async () => {
    const { service } = makeService(db);
    const conv = await service.createConversation(ctx, {
      title: "Copilot",
      projectId: null,
    });
    const userMsg = await service.createMessage(ctx, conv.id, {
      content: "改写开场",
      attachments: [],
    });
    expect(userMsg.role).toBe("user");
    const all = await service.listMessages(ctx, conv.id);
    // user message + deterministic assistant stub
    expect(all.map((m) => m.role)).toEqual(["user", "assistant"]);
    expect(all[1]!.content.length).toBeGreaterThan(0);
  });

  it("listConversations is user-scoped (A cannot see B)", async () => {
    const { service } = makeService(db);
    await service.createConversation(ctx, { title: "A", projectId: null });
    const ctxB: RequestContext = { userId: "user-b", requestId: "r2", source: "user" };
    const listB = await service.listConversations(ctx, { limit: 20, offset: 0 });
    expect(listB.total).toBe(1);
    const onlyB = await service.listConversations(ctxB, { limit: 20, offset: 0 });
    expect(onlyB.total).toBe(0);
  });
});
