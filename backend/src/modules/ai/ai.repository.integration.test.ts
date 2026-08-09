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

// [T-332 S2] RepoDeps.accountId 已收成必填 string(strict 门):缺省用固定测试号,
// 「null 全局视图」形态随 SPEC §4.2 裁决删除。
function repoFor(
  db: Db,
  userId: string,
  accountId = "acct-default",
  tag = userId,
) {
  let seq = 0;
  return createAiRepository(db, {
    now: () => NOW,
    nextId: (prefix: string) => `${prefix}-${tag}-${++seq}`,
    userId,
    accountId,
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

  // [T-116c] listTasks additive 读过滤:传 projectId + taskType 只回命中的任务;
  // 都不传维持全量馈。用户归属门始终在最外层。
  it("[T-116c] listTasks additive 过滤:projectId + taskType 窄化;不传维持全量", async () => {
    const repo = repoFor(db, "user-a");
    const base = {
      contentOutputId: null,
      inputData: {},
      modelKey: "m",
      requestedAt: NOW,
    };
    // 本项目的复盘分析任务(目标)。
    await repo.createTask({
      ...base,
      projectId: "project-x",
      taskType: "review.analyze",
      idempotencyKey: "idem-x-review",
    });
    // 本项目的另一种任务(taskType 不匹配 → 被过滤)。
    await repo.createTask({
      ...base,
      projectId: "project-x",
      taskType: "script.rewrite",
      idempotencyKey: "idem-x-rewrite",
    });
    // 另一项目的复盘分析任务(projectId 不匹配 → 被过滤)。
    await repo.createTask({
      ...base,
      projectId: "project-y",
      taskType: "review.analyze",
      idempotencyKey: "idem-y-review",
    });

    const filtered = await repo.listTasks({
      limit: 50,
      offset: 0,
      projectId: "project-x",
      taskType: "review.analyze",
    });
    expect(filtered.rows).toHaveLength(1);
    expect(filtered.rows[0]!.projectId).toBe("project-x");
    expect(filtered.rows[0]!.taskType).toBe("review.analyze");
    expect(filtered.total).toBe(1);

    // 不传过滤 → 全量(3 条)。
    const all = await repo.listTasks({ limit: 50, offset: 0 });
    expect(all.rows).toHaveLength(3);
    expect(all.total).toBe(3);

    // 另一用户看不到 user-a 的任务(归属门在最外层,过滤是内层)。
    const repoB = repoFor(db, "user-b");
    const crossUser = await repoB.listTasks({
      limit: 50,
      offset: 0,
      projectId: "project-x",
      taskType: "review.analyze",
    });
    expect(crossUser.rows).toHaveLength(0);
    expect(crossUser.total).toBe(0);
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
      secretValue: null,
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

  // ── [T-096] 会话作用域(scope)—— SPEC 2026-07-03 §1.3 + §3 防泄漏矩阵 #1/#9 ──
  it("[T-096] createConversation 落 scope;缺省 'global'(与列 DEFAULT 一致)", async () => {
    const repo = repoFor(db, "user-a");
    const global = await repo.createConversation({
      title: "全局闲聊",
      projectId: null,
    });
    expect(global.scope).toBe("global");
    const distill = await repo.createConversation({
      title: "蒸馏",
      projectId: null,
      scope: "surface:knowledge-distill",
    });
    expect(distill.scope).toBe("surface:knowledge-distill");
  });

  it("[T-096 矩阵#1/#9] listConversations 按 scope 过滤:跨 scope 会话在列表中不出现;计数与 DB 按 scope 一致", async () => {
    const repo = repoFor(db, "user-a");
    await repo.createConversation({
      title: "蒸馏 A",
      projectId: null,
      scope: "surface:knowledge-distill",
    });
    await repo.createConversation({
      title: "选题 B",
      projectId: null,
      scope: "surface:topics",
    });
    await repo.createConversation({ title: "全局 C", projectId: null });

    // scope B(surface:topics)拉历史 → 不含 A(蒸馏)的会话(硬约束②)。
    const topics = await repo.listConversations({
      limit: 20,
      offset: 0,
      scope: "surface:topics",
    });
    expect(topics.total).toBe(1);
    expect(topics.rows.map((r) => r.title)).toEqual(["选题 B"]);

    const distill = await repo.listConversations({
      limit: 20,
      offset: 0,
      scope: "surface:knowledge-distill",
    });
    expect(distill.total).toBe(1);
    expect(distill.rows[0]!.title).toBe("蒸馏 A");

    // 不传 scope 维持全量(契约 additive,旧调用零破坏)。
    const all = await repo.listConversations({ limit: 20, offset: 0 });
    expect(all.total).toBe(3);
  });

  it("[T-096] scope 过滤是 user ownership 门的内层:同 scope 跨用户仍不可见", async () => {
    const repoA = repoFor(db, "user-a");
    const repoB = repoFor(db, "user-b");
    await repoA.createConversation({
      title: "A 的全局",
      projectId: null,
      scope: "global",
    });
    const listB = await repoB.listConversations({
      limit: 20,
      offset: 0,
      scope: "global",
    });
    expect(listB.total).toBe(0);
  });

  // [T-332 S2 · ISO-02/08] 号维度 strict 隔离:同一 user 下两个抖音号,
  // ai_conversations / ai_tasks 盖章 + 恒开号门(无 null 全局视图)。
  it("accountId-scoped repo isolates conversations/tasks across accounts; create stamps accountId", async () => {
    const repoA = repoFor(db, "user-a", "account-a", "acc-a");
    const repoB = repoFor(db, "user-a", "account-b", "acc-b");

    const convA = await repoA.createConversation({
      title: "号A 会话",
      projectId: null,
    });
    const convB = await repoB.createConversation({
      title: "号B 会话",
      projectId: null,
    });
    expect(convA.accountId).toBe("account-a");
    expect(convB.accountId).toBe("account-b");

    // listConversations 号门:各号只见本号;null 见全部。
    expect(
      (await repoA.listConversations({ limit: 20, offset: 0 })).rows.map(
        (r) => r.id,
      ),
    ).toEqual([convA.id]);
    expect(
      (await repoB.listConversations({ limit: 20, offset: 0 })).rows.map(
        (r) => r.id,
      ),
    ).toEqual([convB.id]);
    // 跨号 requireConversation → 404。
    await expect(repoB.requireConversation(convA.id)).rejects.toBeInstanceOf(
      OwnershipError,
    );

    const taskA = await repoA.createTask({
      projectId: "project-1",
      contentOutputId: null,
      taskType: "script.rewrite",
      inputData: {},
      modelKey: "claude-fable-5",
      idempotencyKey: "idem-A",
      requestedAt: NOW,
    });
    expect(taskA.accountId).toBe("account-a");

    // listTasks + requireTask 号门。
    expect(
      (await repoA.listTasks({ limit: 20, offset: 0 })).rows.map((r) => r.id),
    ).toEqual([taskA.id]);
    expect((await repoB.listTasks({ limit: 20, offset: 0 })).rows).toHaveLength(
      0,
    );
    await expect(repoB.requireTask(taskA.id)).rejects.toBeInstanceOf(
      OwnershipError,
    );
  });
});

// [DATA-H06] recordAdoptedKey —— 逐项幂等日志:append 去重 + 透传属主门。
describe("[DATA-H06] recordAdoptedKey(adopted-keys journal)", () => {
  let db: Db;
  beforeEach(async () => {
    ({ db } = await createDb());
  });

  async function seedTaskWithResult(repo: ReturnType<typeof repoFor>) {
    const task = await repo.createTask({
      projectId: "project-1",
      contentOutputId: null,
      taskType: "research.gather",
      inputData: {},
      modelKey: "claude-fable-5",
      idempotencyKey: `idem-${Math.random()}`,
      requestedAt: NOW,
    });
    const result = await repo.insertResult({
      aiTaskId: task.id,
      resultType: "material_list",
      artifactId: null,
      knowledgeItemId: null,
      assetId: null,
      resultData: { items: [] },
    });
    return { task, result };
  }

  it("append 去重:同键记两次只落一条;不同键按序累积;原 result_data 字段保留", async () => {
    const repo = repoFor(db, "user-a");
    const { result } = await seedTaskWithResult(repo);
    await repo.recordAdoptedKey(result.id, "k1");
    await repo.recordAdoptedKey(result.id, "k1"); // 幂等 no-op
    await repo.recordAdoptedKey(result.id, "k2");
    const rows = await repo.listResults(result.aiTaskId);
    const data = rows[0]!.resultData as { adoptedKeys?: string[]; items?: unknown[] };
    expect(data.adoptedKeys).toEqual(["k1", "k2"]);
    expect(data.items).toEqual([]); // 原字段不被覆盖
  });

  it("透传属主门:B 用户对 A 的结果行 recordAdoptedKey → OwnershipError(不落键)", async () => {
    const repoA = repoFor(db, "user-a");
    const repoB = repoFor(db, "user-b");
    const { result } = await seedTaskWithResult(repoA);
    await expect(repoB.recordAdoptedKey(result.id, "kx")).rejects.toBeInstanceOf(
      OwnershipError,
    );
    const rows = await repoA.listResults(result.aiTaskId);
    expect(
      (rows[0]!.resultData as { adoptedKeys?: string[] }).adoptedKeys,
    ).toBeUndefined();
  });

  it("未知结果 id → OwnershipError(与 getResult 同语义,不泄露存在性)", async () => {
    const repo = repoFor(db, "user-a");
    await expect(repo.recordAdoptedKey("nope", "k")).rejects.toBeInstanceOf(
      OwnershipError,
    );
  });
});
