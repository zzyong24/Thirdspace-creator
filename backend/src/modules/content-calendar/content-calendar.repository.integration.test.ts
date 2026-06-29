import { describe, it, expect, beforeEach } from "vitest";
import { createDb, type Db } from "@creatoros/backend";
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

function repoFor(db: Db, userId: string): ContentCalendarRepository {
  let seq = 0;
  return createContentCalendarRepository(db, {
    now: () => "2026-06-21T00:00:00.000Z",
    nextId: (prefix: string) => `${prefix}-${userId}-${++seq}`,
    userId,
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
    expect(created.status).toBe("planned"); // default
    expect(created.note).toBe(""); // default
    expect(created.contentOutputId).toBeNull();
    expect(created.candidateId).toBeNull();
    expect(created.publishedAt).toBeNull();

    const got = await a.getEntry(created.id);
    expect(got.id).toBe(created.id);
    expect(got.plannedAt).toBe("2026-06-25T09:00:00.000Z");
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
});
