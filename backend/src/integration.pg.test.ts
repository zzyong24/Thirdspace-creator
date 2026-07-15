import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  createRuntimeDb,
  users,
  aiTasks,
  aiTaskResults,
  eq,
  type RuntimeDb,
} from "./index";

// Opt-in real-Postgres integration smoke. Runs ONLY when TEST_DATABASE_URL is set (CI /
// local docker), exercising the node-postgres driver + the applied migrations that the
// pglite suite can't. Skipped otherwise, so the default suite needs no database.
//   TEST_DATABASE_URL=postgresql://creatoros:creatoros@localhost:5432/creatoros_test \
//     pnpm --filter @creatoros/backend exec vitest run src/integration.pg.test.ts
const URL = process.env.TEST_DATABASE_URL;
const suite = URL ? describe : describe.skip;

suite("real Postgres integration (node-postgres driver + migrations)", () => {
  let rt: RuntimeDb;
  const UA = "pgtest-user-A";
  const UB = "pgtest-user-B";
  const NOW = "2026-06-24T00:00:00.000Z";

  async function cleanup(db: RuntimeDb["db"]): Promise<void> {
    await db.delete(aiTaskResults).where(eq(aiTaskResults.id, "pgtest-res-1"));
    await db.delete(aiTasks).where(eq(aiTasks.id, "pgtest-task-A"));
    await db.delete(users).where(eq(users.id, UA));
    await db.delete(users).where(eq(users.id, UB));
  }

  beforeAll(async () => {
    rt = await createRuntimeDb({ connectionString: URL! });
    await cleanup(rt.db);
    for (const id of [UA, UB]) {
      await rt.db.insert(users).values({
        id,
        email: `${id}@t.local`,
        displayName: id,
        timezone: "UTC",
        locale: "en",
        passwordHash: "x",
        createdAt: NOW,
        updatedAt: NOW,
      });
    }
  });

  afterAll(async () => {
    if (rt) {
      await cleanup(rt.db);
      await rt.pool.end();
    }
  });

  it("migrations applied + users round-trip through the real driver", async () => {
    const rows = await rt.db.select().from(users).where(eq(users.id, UA));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.email).toBe(`${UA}@t.local`);
  });

  it("insert + parametrized select round-trips (ai_tasks)", async () => {
    await rt.db.insert(aiTasks).values({
      id: "pgtest-task-A",
      userId: UA,
      accountId: "pgtest-acct-A", // [T-332 S2] ai_tasks.account_id NOT NULL
      taskType: "planning.thesis",
      idempotencyKey: "k-A",
      requestedAt: NOW,
    });
    const rows = await rt.db.select().from(aiTasks).where(eq(aiTasks.userId, UA));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.id).toBe("pgtest-task-A");
  });

  it("cross-table ownership: ai_task_results join ai_tasks, filtered by owner", async () => {
    await rt.db.insert(aiTaskResults).values({
      id: "pgtest-res-1",
      aiTaskId: "pgtest-task-A",
      resultType: "artifact_version",
    });

    const owned = await rt.db
      .select({ resId: aiTaskResults.id })
      .from(aiTaskResults)
      .innerJoin(aiTasks, eq(aiTaskResults.aiTaskId, aiTasks.id))
      .where(eq(aiTasks.userId, UA));
    expect(owned.map((r) => r.resId)).toContain("pgtest-res-1");

    // Multi-tenant: user B owns no tasks, so the join yields nothing for them.
    const other = await rt.db
      .select({ resId: aiTaskResults.id })
      .from(aiTaskResults)
      .innerJoin(aiTasks, eq(aiTaskResults.aiTaskId, aiTasks.id))
      .where(eq(aiTasks.userId, UB));
    expect(other).toHaveLength(0);
  });
});
