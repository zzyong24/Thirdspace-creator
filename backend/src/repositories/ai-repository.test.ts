import { describe, it, expect, beforeEach } from "vitest";
import { createDb, type Db } from "../db";
import { createAiRepository, type AiRepository } from "./ai-repository";

const FIXED_NOW = "2026-06-13T10:00:00+08:00";

// Deterministic deps mirroring project-repository.test.ts. Ids are namespaced
// per userId so two users' repos against the SAME db never collide on PKs.
function deterministicDeps(userId: string) {
  const counters = new Map<string, number>();
  return {
    now: () => FIXED_NOW,
    nextId: (prefix: string) => {
      const n = (counters.get(prefix) ?? 0) + 1;
      counters.set(prefix, n);
      return `${prefix}-${userId}-${n}`;
    },
    userId,
  };
}

let db: Db;
let repo: AiRepository;

beforeEach(async () => {
  ({ db } = await createDb()); // fresh in-memory pglite per test
  repo = createAiRepository(db, deterministicDeps("user-1"));
});

describe("AiRepository (pglite-backed real persistence)", () => {
  it("creates a conversation and reads it back from SQL", async () => {
    const created = await repo.createConversation({ title: "聊天" });
    expect(created.id).toBe("ai_conversation-user-1-1");
    expect(created.userId).toBe("user-1");
    expect(created.projectId).toBeNull();

    const list = await repo.listConversations();
    expect(list.map((c) => c.id)).toContain("ai_conversation-user-1-1");

    const fetched = await repo.getConversation("ai_conversation-user-1-1");
    expect(fetched.title).toBe("聊天");
  });

  it("throws for a missing conversation", async () => {
    await expect(repo.getConversation("nope")).rejects.toThrow(/not found/);
  });

  it("appends messages durably and bumps the parent updatedAt", async () => {
    const c = await repo.createConversation({ title: "T" });
    await repo.appendMessage(c.id, { role: "user", content: "hi" });
    await repo.appendMessage(c.id, { role: "assistant", content: "hello" });

    const msgs = await repo.listMessages(c.id);
    expect(msgs).toHaveLength(2);
    expect(msgs.map((m) => m.role)).toEqual(["user", "assistant"]);
    expect(msgs[0]!.content).toBe("hi");
  });

  it("creates a task and reads it back, defaulting to queued", async () => {
    const task = await repo.createTask({
      taskType: "draft_script",
      idempotencyKey: "idem-1",
    });
    expect(task.status).toBe("queued");
    expect(task.userId).toBe("user-1");
    expect(task.startedAt).toBeNull();

    const fetched = await repo.getTask(task.id);
    expect(fetched.taskType).toBe("draft_script");

    const list = await repo.listTasks();
    expect(list.map((t) => t.id)).toContain(task.id);
  });

  // KEY INVARIANT 1: idempotent UNIQUE insert on (user_id, idempotency_key) —
  // a duplicate request returns the EXISTING task, never a second row.
  it("createTask is idempotent on (userId, idempotencyKey)", async () => {
    const first = await repo.createTask({
      taskType: "draft_script",
      idempotencyKey: "idem-dup",
    });
    const second = await repo.createTask({
      taskType: "draft_script",
      idempotencyKey: "idem-dup",
    });
    expect(second.id).toBe(first.id);

    const list = await repo.listTasks();
    expect(list.filter((t) => t.idempotencyKey === "idem-dup")).toHaveLength(1);
  });

  // KEY INVARIANT 2: FSM transitions are adjacent-only per the documented state
  // machine. queued → running stamps startedAt; running → succeeded stamps
  // completedAt; non-adjacent / from-terminal edges are rejected.
  it("transitions a task through legal FSM edges and stamps timestamps", async () => {
    const t = await repo.createTask({
      taskType: "draft_script",
      idempotencyKey: "idem-fsm",
    });
    const running = await repo.transitionTask(t.id, "running");
    expect(running.status).toBe("running");
    expect(running.startedAt).toBe(FIXED_NOW);

    const done = await repo.transitionTask(t.id, "succeeded");
    expect(done.status).toBe("succeeded");
    expect(done.completedAt).toBe(FIXED_NOW);
  });

  it("rejects an illegal (non-adjacent) task transition", async () => {
    const t = await repo.createTask({
      taskType: "draft_script",
      idempotencyKey: "idem-bad",
    });
    // queued → succeeded is not a legal edge (must go through running).
    await expect(repo.transitionTask(t.id, "succeeded")).rejects.toThrow(
      /illegal task transition/,
    );
  });

  it("rejects transitioning out of a terminal state", async () => {
    const t = await repo.createTask({
      taskType: "draft_script",
      idempotencyKey: "idem-term",
    });
    await repo.transitionTask(t.id, "cancelled");
    await expect(repo.transitionTask(t.id, "running")).rejects.toThrow(
      /illegal task transition/,
    );
  });

  it("persists task references and results through the ownership gate", async () => {
    const t = await repo.createTask({
      taskType: "draft_script",
      idempotencyKey: "idem-child",
    });
    await repo.addTaskReference(t.id, {
      entityType: "project",
      entityId: "project-1",
      relationType: "context",
    });
    await repo.addTaskResult(t.id, {
      resultType: "artifact",
      artifactId: "artifact-1",
    });

    const refs = await repo.listTaskReferences(t.id);
    expect(refs).toHaveLength(1);
    expect(refs[0]!.entityId).toBe("project-1");

    const results = await repo.listTaskResults(t.id);
    expect(results).toHaveLength(1);
    expect(results[0]!.artifactId).toBe("artifact-1");
  });

  // OWNERSHIP NEGATIVE CASE: a row owned by user-2 is invisible to user-1's repo
  // — same "not found" surface the reference repos use for cross-user access.
  it("does not leak another user's conversation or task across the ownership boundary", async () => {
    const repo2 = createAiRepository(db, deterministicDeps("user-2"));
    const theirConvo = await repo2.createConversation({ title: "secret" });
    const theirTask = await repo2.createTask({
      taskType: "draft_script",
      idempotencyKey: "idem-other",
    });

    await expect(repo.getConversation(theirConvo.id)).rejects.toThrow(
      /not found/,
    );
    await expect(repo.getTask(theirTask.id)).rejects.toThrow(/not found/);
    await expect(repo.transitionTask(theirTask.id, "running")).rejects.toThrow(
      /not found/,
    );

    // user-1's own lists never include user-2's rows.
    expect(await repo.listConversations()).toHaveLength(0);
    expect(await repo.listTasks()).toHaveLength(0);

    // user-2 can still see their own rows.
    expect((await repo2.listConversations()).map((c) => c.id)).toContain(
      theirConvo.id,
    );
  });

  it("seeds conversations and tasks idempotently", async () => {
    const convoRow = {
      id: "seed-convo-1",
      userId: "user-1",
      projectId: null,
      title: "种子会话",
      createdAt: FIXED_NOW,
      updatedAt: FIXED_NOW,
    };
    await repo.seedConversations([convoRow]);
    await repo.seedConversations([convoRow]); // again — conflict ignored
    const convos = await repo.listConversations();
    expect(convos.filter((c) => c.id === "seed-convo-1")).toHaveLength(1);
  });
});
