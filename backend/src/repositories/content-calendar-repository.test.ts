import { describe, it, expect, beforeEach } from "vitest";
import { createDb, type Db } from "../db";
import {
  createContentCalendarRepository,
  type ContentCalendarRepository,
} from "./content-calendar-repository";

const FIXED_NOW = "2026-06-13T10:00:00+08:00";

// Namespace ids per userId so two repos sharing a db never collide on PK.
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
let repo: ContentCalendarRepository;

beforeEach(async () => {
  ({ db } = await createDb()); // fresh in-memory pglite per test
  repo = createContentCalendarRepository(db, deterministicDeps("user-1"));
});

describe("ContentCalendarRepository (pglite-backed real persistence)", () => {
  it("creates an entry and reads it back from SQL", async () => {
    const created = await repo.createEntry({
      accountId: "acct-1",
      plannedAt: "2026-06-20T09:00:00+08:00",
      note: "晨间发布",
    });
    expect(created.id).toBe("calendar-entry-user-1-1");
    expect(created.status).toBe("planned");
    expect(created.publishedAt).toBeNull();

    const fetched = await repo.getEntry(created.id);
    expect(fetched.note).toBe("晨间发布");

    const list = await repo.listEntries({ accountId: "acct-1" });
    expect(list.map((e) => e.id)).toContain(created.id);
  });

  it("lists entries ordered by plannedAt within a window", async () => {
    await repo.createEntry({ accountId: "a", plannedAt: "2026-06-22T09:00:00+08:00" });
    await repo.createEntry({ accountId: "a", plannedAt: "2026-06-20T09:00:00+08:00" });
    await repo.createEntry({ accountId: "a", plannedAt: "2026-07-01T09:00:00+08:00" });

    const windowed = await repo.listEntries({
      accountId: "a",
      from: "2026-06-19T00:00:00+08:00",
      to: "2026-06-30T00:00:00+08:00",
    });
    expect(windowed.map((e) => e.plannedAt)).toEqual([
      "2026-06-20T09:00:00+08:00",
      "2026-06-22T09:00:00+08:00",
    ]);
  });

  it("throws for a missing entry", async () => {
    await expect(repo.getEntry("nope")).rejects.toThrow(/not found/);
  });

  it("rejects binding both a content output and a candidate", async () => {
    await expect(
      repo.createEntry({
        accountId: "acct-1",
        plannedAt: FIXED_NOW,
        contentOutputId: "out-1",
        candidateId: "cand-1",
      }),
    ).rejects.toThrow(/cannot bind both/);
  });

  // KEY INVARIANT: status FSM is adjacent-only; published stamps publishedAt.
  it("transitions planned -> published and stamps publishedAt", async () => {
    const e = await repo.createEntry({ accountId: "a", plannedAt: FIXED_NOW });
    const published = await repo.transitionEntry(e.id, "published");
    expect(published.status).toBe("published");
    expect(published.publishedAt).toBe(FIXED_NOW);
    // persisted
    expect((await repo.getEntry(e.id)).status).toBe("published");
  });

  it("allows missed -> planned (recovery) but rejects illegal jumps", async () => {
    const e = await repo.createEntry({ accountId: "a", plannedAt: FIXED_NOW });
    const missed = await repo.transitionEntry(e.id, "missed");
    expect(missed.status).toBe("missed");

    const replanned = await repo.transitionEntry(e.id, "planned");
    expect(replanned.status).toBe("planned");

    // published is terminal — no transition out of it.
    await repo.transitionEntry(e.id, "published");
    await expect(repo.transitionEntry(e.id, "planned")).rejects.toThrow(
      /illegal calendar status transition/,
    );
  });

  it("upserts a cadence idempotently on (user, account)", async () => {
    const first = await repo.upsertCadence({
      accountId: "acct-1",
      frequency: "weekly",
      preferredSlots: [{ weekday: 1, time: "09:00" }],
    });
    expect(first.frequency).toBe("weekly");

    const second = await repo.upsertCadence({
      accountId: "acct-1",
      frequency: "daily",
    });
    expect(second.id).toBe(first.id); // same row updated in place
    expect(second.frequency).toBe("daily");

    const fetched = await repo.getCadence("acct-1");
    expect(fetched?.frequency).toBe("daily");
    expect(fetched?.preferredSlots).toEqual([]);
  });

  // OWNERSHIP negative case: another user's entry is invisible (404 surface).
  it("does not leak entries across users", async () => {
    const mine = await repo.createEntry({ accountId: "a", plannedAt: FIXED_NOW });

    const other = createContentCalendarRepository(db, deterministicDeps("user-2"));
    await expect(other.getEntry(mine.id)).rejects.toThrow(/not found/);
    expect((await other.listEntries()).map((e) => e.id)).not.toContain(mine.id);
    // and the owner still sees it
    expect((await repo.listEntries()).map((e) => e.id)).toContain(mine.id);
  });
});
