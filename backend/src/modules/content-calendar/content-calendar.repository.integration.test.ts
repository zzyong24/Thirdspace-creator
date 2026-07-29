import { describe, it, expect, beforeEach } from "vitest";
import { createDb, projects, type Db } from "@creatoros/backend";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import {
  createContentCalendarRepository,
  type ContentCalendarRepository,
} from "./content-calendar.repository";
import { OwnershipError, ValidationError } from "./content-calendar.errors";

// Step 1 (schema round-trip + cadence unique) + Step 2 (repository, pglite-backed,
// user-scoped ONLY). Tests:
//   - both tables round-trip with defaults (status 'planned', preferredSlots [],
//     nullable cols null).
//   - cadence (user_id, account_id) UNIQUE rejects a duplicate via upsert-as-update
//     (no second row).
//   - ownership: A's entry invisible to B (getEntry throws OwnershipError).
//   - createEntry with BOTH contentOutputId+candidateId → ValidationError.
//   - listEntries ascending-by-plannedAt, window-filtered, limit/offset.
//   - upsertCadence twice updates the SAME row (frequency change, no dup).
//   - getCadence returns null (no throw) when none.

const ACC = "acct-1";

// [T-332 S2] repo deps 增加 baked accountId(ctx 当前号):by-id 读写叠号一致性门。
function repoFor(
  db: Db,
  userId: string,
  accountId: string = ACC,
): ContentCalendarRepository {
  let seq = 0;
  return createContentCalendarRepository(db, {
    now: () => "2026-06-21T00:00:00.000Z",
    nextId: (prefix: string) => `${prefix}-${userId}-${accountId}-${++seq}`,
    userId,
    accountId,
  });
}

describe("content-calendar repository", () => {
  let db: Db;
  beforeEach(async () => {
    ({ db } = await createDb());
  });

  it("round-trips an entry with column defaults intact", async () => {
    const a = repoFor(db, "user-a");
    const created = await a.createEntry(ACC, {
      plannedAt: "2026-06-25T09:00:00.000Z",
    });
    expect(created.userId).toBe("user-a");
    expect(created.accountId).toBe(ACC);
    expect(created.projectId).toBeNull();
    expect(created.plannedDate).toBe("2026-06-25");
    expect(created.status).toBe("planned"); // default
    expect(created.note).toBe(""); // default
    expect(created.contentOutputId).toBeNull();
    expect(created.candidateId).toBeNull();
    expect(created.publishedAt).toBeNull();

    const got = await a.getEntry(created.id);
    expect(got.id).toBe(created.id);
    expect(got.plannedAt).toBe("2026-06-25T09:00:00.000Z");
  });

  it("round-trips and lists one active project schedule by date-only semantics", async () => {
    const a = repoFor(db, "user-a");
    await db.insert(projects).values({
      id: "project-1",
      userId: "user-a",
      accountId: ACC,
      title: "排期项目",
      creationMode: "guided",
      status: "active",
      currentStage: "script",
      startedAt: "2026-06-20T00:00:00.000Z",
      createdAt: "2026-06-20T00:00:00.000Z",
      updatedAt: "2026-06-20T00:00:00.000Z",
    });
    const created = await a.createEntry(ACC, {
      projectId: "project-1",
      plannedDate: "2026-06-25",
      plannedAt: "2026-06-25T12:00:00.000Z",
    });

    expect(
      await a.findActiveProjectSchedule("project-1"),
    ).toMatchObject({ id: created.id, plannedDate: "2026-06-25" });
    expect(
      (await a.listActiveProjectSchedules(ACC)).map((row) => row.id),
    ).toEqual([created.id]);

    const window = await a.listEntries(ACC, {
      from: "2026-06-25T23:59:59.000Z",
      to: "2026-06-25T23:59:59.000Z",
    });
    expect(window.rows.map((row) => row.id)).toEqual([created.id]);
  });

  it("round-trips a cadence with preferredSlots default [] and enforces unique", async () => {
    const a = repoFor(db, "user-a");
    const cad = await a.upsertCadence(ACC, {
      frequency: "weekly",
      preferredSlots: [],
    });
    expect(cad.frequency).toBe("weekly");
    expect(cad.preferredSlots).toEqual([]);

    // Second upsert for the SAME (user, account) updates the SAME row (unique holds).
    const updated = await a.upsertCadence(ACC, {
      frequency: "daily",
      preferredSlots: [{ weekday: 1, time: "09:00" }],
    });
    expect(updated.id).toBe(cad.id); // same row, no duplicate
    expect(updated.frequency).toBe("daily");
    expect(updated.preferredSlots).toEqual([{ weekday: 1, time: "09:00" }]);
  });

  it("scopes ownership: A's entry is invisible to B", async () => {
    const a = repoFor(db, "user-a");
    const b = repoFor(db, "user-b");
    const created = await a.createEntry(ACC, {
      plannedAt: "2026-06-25T09:00:00.000Z",
    });
    await expect(b.getEntry(created.id)).rejects.toBeInstanceOf(OwnershipError);
    // A still reads its own.
    expect((await a.getEntry(created.id)).id).toBe(created.id);
  });

  it("rejects an entry bound to BOTH a contentOutput and a candidate", async () => {
    const a = repoFor(db, "user-a");
    await expect(
      a.createEntry(ACC, {
        plannedAt: "2026-06-25T09:00:00.000Z",
        contentOutputId: "out-1",
        candidateId: "cand-1",
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("lists entries ascending-by-plannedAt, window-filtered, paginated", async () => {
    const a = repoFor(db, "user-a");
    // out of window (before from):
    await a.createEntry(ACC, { plannedAt: "2026-06-01T09:00:00.000Z" });
    // in window, inserted out of order:
    await a.createEntry(ACC, { plannedAt: "2026-06-27T09:00:00.000Z" });
    await a.createEntry(ACC, { plannedAt: "2026-06-23T09:00:00.000Z" });
    await a.createEntry(ACC, { plannedAt: "2026-06-25T09:00:00.000Z" });
    // out of window (after to):
    await a.createEntry(ACC, { plannedAt: "2026-07-15T09:00:00.000Z" });

    const win = { from: "2026-06-22T00:00:00.000Z", to: "2026-06-28T23:59:59.000Z" };
    const all = await a.listEntries(ACC, win);
    expect(all.total).toBe(3); // window excludes the 2 out-of-range
    expect(all.rows.map((r) => r.plannedAt)).toEqual([
      "2026-06-23T09:00:00.000Z",
      "2026-06-25T09:00:00.000Z",
      "2026-06-27T09:00:00.000Z",
    ]);

    const page = await a.listEntries(ACC, { ...win, limit: 2, offset: 1 });
    expect(page.rows).toHaveLength(2);
    expect(page.total).toBe(3); // total ignores limit/offset
    expect(page.rows[0]!.plannedAt).toBe("2026-06-25T09:00:00.000Z");
  });

  it("getCadence returns null (no throw) when none set", async () => {
    const a = repoFor(db, "user-a");
    expect(await a.getCadence("acct-none")).toBeNull();
  });

  it("scopes cadence per user: A's cadence invisible to B", async () => {
    const a = repoFor(db, "user-a");
    const b = repoFor(db, "user-b");
    await a.upsertCadence(ACC, { frequency: "weekly", preferredSlots: [] });
    expect(await b.getCadence(ACC)).toBeNull();
    // both can hold a cadence for the same account id, scoped per user.
    const bCad = await b.upsertCadence(ACC, {
      frequency: "monthly",
      preferredSlots: [],
    });
    expect(bCad.userId).toBe("user-b");
  });

  it("updateEntry sets only provided fields and re-validates not-both-bound", async () => {
    let clock = 0;
    const a = createContentCalendarRepository(db, {
      now: () => `2026-06-21T00:00:0${clock++}.000Z`,
      nextId: (p: string) => `${p}-u-1`,
      userId: "user-a",
      accountId: ACC,
    });
    const entry = await a.createEntry(ACC, {
      plannedAt: "2026-06-25T09:00:00.000Z",
      contentOutputId: "out-1",
    });
    const updated = await a.updateEntry(entry.id, { note: "draft" });
    expect(updated.note).toBe("draft");
    expect(updated.contentOutputId).toBe("out-1"); // unchanged
    expect(updated.updatedAt).not.toBe(entry.updatedAt); // bumped

    // Adding a candidateId to an entry already bound to an output → ValidationError.
    await expect(
      a.updateEntry(entry.id, { candidateId: "cand-1" }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("deleteEntry removes the scoped row", async () => {
    const a = repoFor(db, "user-a");
    const entry = await a.createEntry(ACC, {
      plannedAt: "2026-06-25T09:00:00.000Z",
    });
    const res = await a.deleteEntry(entry.id);
    expect(res).toEqual({ id: entry.id, deleted: true });
    await expect(a.getEntry(entry.id)).rejects.toBeInstanceOf(OwnershipError);
  });

  // [T-332 S2] 双账号隔离:同 user 两个号,by-id 叠号一致性门(§4.5)。
  it("scopes by-id reads/writes per account: 跨号 by-id → 404(同 user 双号零泄漏)", async () => {
    const ACC_2 = "acct-2";
    const viewAcc1 = repoFor(db, "user-a", ACC);
    const viewAcc2 = repoFor(db, "user-a", ACC_2);
    const e1 = await viewAcc1.createEntry(ACC, {
      plannedAt: "2026-06-25T09:00:00.000Z",
    });
    const e2 = await viewAcc2.createEntry(ACC_2, {
      plannedAt: "2026-06-26T09:00:00.000Z",
    });

    // 列表 strict:每号只见自己的行。
    const win = { from: "2026-06-01T00:00:00.000Z", to: "2026-06-30T23:59:59.000Z" };
    expect((await viewAcc1.listEntries(ACC, win)).rows.map((r) => r.id)).toEqual([e1.id]);
    expect((await viewAcc2.listEntries(ACC_2, win)).rows.map((r) => r.id)).toEqual([e2.id]);

    // 跨号 by-id 读/写/删 → OwnershipError(404,不泄露存在)。
    await expect(viewAcc2.getEntry(e1.id)).rejects.toBeInstanceOf(OwnershipError);
    await expect(
      viewAcc2.updateEntry(e1.id, { note: "跨号篡改" }),
    ).rejects.toBeInstanceOf(OwnershipError);
    await expect(viewAcc2.deleteEntry(e1.id)).rejects.toBeInstanceOf(OwnershipError);
    await expect(
      viewAcc1.setEntryStatus(e2.id, { status: "published" }),
    ).rejects.toBeInstanceOf(OwnershipError);
    // 本号 by-id 正常。
    expect((await viewAcc1.getEntry(e1.id)).id).toBe(e1.id);
  });
});

describe("0061_project_schedule_calendar migration", () => {
  it("backfills only owned unique chains and enforces date, active unique, and cascade", async () => {
    const client = new PGlite();
    await client.exec(`
      CREATE TABLE projects (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        account_id TEXT NOT NULL
      );
      CREATE TABLE content_outputs (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL
      );
      CREATE TABLE topic_promotions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        account_id TEXT NOT NULL,
        candidate_id TEXT NOT NULL,
        project_id TEXT NOT NULL
      );
      CREATE TABLE content_calendar_entries (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        account_id TEXT NOT NULL,
        planned_at TEXT NOT NULL,
        content_output_id TEXT,
        candidate_id TEXT,
        status TEXT NOT NULL DEFAULT 'planned',
        note TEXT NOT NULL DEFAULT '',
        published_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      INSERT INTO projects(id, user_id, account_id) VALUES
        ('project-output', 'user-a', 'acct-1'),
        ('project-promo', 'user-a', 'acct-1'),
        ('project-conflict', 'user-a', 'acct-1'),
        ('project-foreign', 'user-b', 'acct-1');
      INSERT INTO content_outputs(id, project_id) VALUES
        ('output-owned', 'project-output'),
        ('output-conflict-1', 'project-conflict'),
        ('output-conflict-2', 'project-conflict'),
        ('output-foreign', 'project-foreign');
      INSERT INTO topic_promotions(
        id, user_id, account_id, candidate_id, project_id
      ) VALUES (
        'promotion-owned', 'user-a', 'acct-1', 'candidate-owned', 'project-promo'
      );
      INSERT INTO content_calendar_entries(
        id, user_id, account_id, planned_at, content_output_id, candidate_id,
        status, note, created_at, updated_at
      ) VALUES
        ('entry-output', 'user-a', 'acct-1', '2026-08-01T09:00:00.000Z', 'output-owned', NULL, 'planned', '', '2026-07-01T00:00:00.000Z', '2026-07-01T00:00:00.000Z'),
        ('entry-promo', 'user-a', 'acct-1', '2026-08-02T09:00:00.000Z', NULL, 'candidate-owned', 'planned', '', '2026-07-01T00:00:00.000Z', '2026-07-01T00:00:00.000Z'),
        ('entry-foreign', 'user-a', 'acct-1', '2026-08-03T09:00:00.000Z', 'output-foreign', NULL, 'planned', '', '2026-07-01T00:00:00.000Z', '2026-07-01T00:00:00.000Z'),
        ('entry-note', 'user-a', 'acct-1', '2026-08-04T09:00:00.000Z', NULL, NULL, 'planned', 'project-output', '2026-07-01T00:00:00.000Z', '2026-07-01T00:00:00.000Z'),
        ('entry-conflict-1', 'user-a', 'acct-1', '2026-08-05T09:00:00.000Z', 'output-conflict-1', NULL, 'planned', '', '2026-07-01T00:00:00.000Z', '2026-07-01T00:00:00.000Z'),
        ('entry-conflict-2', 'user-a', 'acct-1', '2026-08-06T09:00:00.000Z', 'output-conflict-2', NULL, 'missed', '', '2026-07-01T00:00:00.000Z', '2026-07-01T00:00:00.000Z');
    `);

    const migration = await readFile(
      new URL(
        "../../../drizzle/0061_project_schedule_calendar.sql",
        import.meta.url,
      ),
      "utf8",
    );
    for (const statement of migration.split("--> statement-breakpoint")) {
      if (statement.trim()) await client.exec(statement);
    }

    const migrated = await client.query<{
      id: string;
      project_id: string | null;
      planned_date: string;
    }>(
      "SELECT id, project_id, planned_date FROM content_calendar_entries ORDER BY id",
    );
    const byId = new Map(migrated.rows.map((row) => [row.id, row]));
    expect(byId.get("entry-output")).toMatchObject({
      project_id: "project-output",
      planned_date: "2026-08-01",
    });
    expect(byId.get("entry-promo")?.project_id).toBe("project-promo");
    expect(byId.get("entry-foreign")?.project_id).toBeNull();
    expect(byId.get("entry-note")?.project_id).toBeNull();
    expect(byId.get("entry-conflict-1")?.project_id).toBeNull();
    expect(byId.get("entry-conflict-2")?.project_id).toBeNull();

    await expect(
      client.exec(`
        INSERT INTO content_calendar_entries(
          id, user_id, account_id, project_id, planned_date, planned_at,
          status, created_at, updated_at
        ) VALUES (
          'entry-duplicate', 'user-a', 'acct-1', 'project-output',
          '2026-08-08', '2026-08-08T12:00:00.000Z', 'missed',
          '2026-07-01T00:00:00.000Z', '2026-07-01T00:00:00.000Z'
        )
      `),
    ).rejects.toThrow();
    await expect(
      client.exec(`
        INSERT INTO content_calendar_entries(
          id, user_id, account_id, planned_date, planned_at,
          status, created_at, updated_at
        ) VALUES (
          'entry-bad-date', 'user-a', 'acct-1', '2026-02-30',
          '2026-03-02T12:00:00.000Z', 'planned',
          '2026-07-01T00:00:00.000Z', '2026-07-01T00:00:00.000Z'
        )
      `),
    ).rejects.toThrow();

    await client.exec("DELETE FROM projects WHERE id = 'project-output'");
    const cascade = await client.query<{ count: number }>(
      "SELECT count(*)::int AS count FROM content_calendar_entries WHERE id = 'entry-output'",
    );
    expect(cascade.rows[0]?.count).toBe(0);
    await client.close();
  });
});
