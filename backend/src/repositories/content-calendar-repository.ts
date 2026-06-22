import { eq, and, asc, gte, lte } from "drizzle-orm";
import type { Db } from "../db";
import {
  contentCalendarEntries,
  publishingCadences,
} from "../schema/content-calendar";

// Injected dependencies — mirrors project-repository's RepoDeps so the repo stays
// deterministic (no Date.now / Math.random / fetch inside) and user-scoped.
export interface RepoDeps {
  now: () => string; // ISO-8601 clock (injected for deterministic tests)
  nextId: (prefix: string) => string; // id generator (deterministic in tests)
  userId: string; // owner threaded from RequestContext
}

type EntryStatus = "planned" | "published" | "missed";
type CadenceFrequency = "daily" | "weekly" | "biweekly" | "monthly" | "custom";

type EntryRow = typeof contentCalendarEntries.$inferSelect;
type CadenceRow = typeof publishingCadences.$inferSelect;

interface PreferredSlot {
  weekday: number;
  time: string;
}

// §7.2 status machine: planned → published|missed; missed → published|planned.
// published is terminal. Transitions are adjacent-only (the FSM contract).
const STATUS_TRANSITIONS: Record<EntryStatus, readonly EntryStatus[]> = {
  planned: ["published", "missed"],
  missed: ["published", "planned"],
  published: [],
};

export interface ContentCalendarRepository {
  seedEntries(rows: EntryRow[]): Promise<void>;
  seedCadences(rows: CadenceRow[]): Promise<void>;

  // ContentCalendarEntry — core CRUD over a window.
  listEntries(filter?: {
    accountId?: string;
    from?: string;
    to?: string;
  }): Promise<EntryRow[]>;
  getEntry(entryId: string): Promise<EntryRow>;
  createEntry(input: {
    accountId: string;
    plannedAt: string;
    contentOutputId?: string | null;
    candidateId?: string | null;
    note?: string;
  }): Promise<EntryRow>;
  updateEntry(
    entryId: string,
    patch: {
      plannedAt?: string;
      note?: string;
      contentOutputId?: string | null;
      candidateId?: string | null;
    },
  ): Promise<EntryRow>;
  transitionEntry(entryId: string, status: EntryStatus): Promise<EntryRow>;
  deleteEntry(entryId: string): Promise<void>;

  // PublishingCadence — one per (user, account); upsert anchored on the UNIQUE ix.
  getCadence(accountId: string): Promise<CadenceRow | null>;
  upsertCadence(input: {
    accountId: string;
    frequency: CadenceFrequency;
    preferredSlots?: PreferredSlot[];
  }): Promise<CadenceRow>;

  // TODO(content-calendar): cadenceAttainmentResource is DERIVED (not stored) and
  // depends on reading publishing reality (C-4 reconcile). Deferred — out of scope
  // for the core entity repo; compute in the service/reconcile layer.
}

export function createContentCalendarRepository(
  db: Db,
  deps: RepoDeps,
): ContentCalendarRepository {
  // Owner-scoped read: a row owned by another user is invisible → same
  // "not found" surface project-repository uses for cross-user / missing rows.
  async function getEntry(entryId: string): Promise<EntryRow> {
    const rows = await db
      .select()
      .from(contentCalendarEntries)
      .where(
        and(
          eq(contentCalendarEntries.id, entryId),
          eq(contentCalendarEntries.userId, deps.userId),
        ),
      );
    const row = rows[0];
    if (!row) {
      throw new Error(`OwnershipError: calendar entry not found: ${entryId}`);
    }
    return row;
  }

  // not-both-bound invariant: an entry binds a ContentOutput OR a Candidate, never
  // both. Enforced in the repo (a pglite CHECK across two nullable cols is awkward).
  function assertNotBothBound(
    contentOutputId: string | null | undefined,
    candidateId: string | null | undefined,
  ): void {
    if (contentOutputId != null && candidateId != null) {
      throw new Error(
        "ConflictError: calendar entry cannot bind both contentOutputId and candidateId",
      );
    }
  }

  return {
    async seedEntries(rows) {
      if (rows.length === 0) return;
      await db.insert(contentCalendarEntries).values(rows).onConflictDoNothing();
    },

    async seedCadences(rows) {
      if (rows.length === 0) return;
      await db.insert(publishingCadences).values(rows).onConflictDoNothing();
    },

    async listEntries(filter) {
      const conds = [eq(contentCalendarEntries.userId, deps.userId)];
      if (filter?.accountId) {
        conds.push(eq(contentCalendarEntries.accountId, filter.accountId));
      }
      if (filter?.from) {
        conds.push(gte(contentCalendarEntries.plannedAt, filter.from));
      }
      if (filter?.to) {
        conds.push(lte(contentCalendarEntries.plannedAt, filter.to));
      }
      return db
        .select()
        .from(contentCalendarEntries)
        .where(and(...conds))
        .orderBy(asc(contentCalendarEntries.plannedAt));
    },

    getEntry,

    async createEntry({ accountId, plannedAt, contentOutputId, candidateId, note }) {
      assertNotBothBound(contentOutputId, candidateId);
      const ts = deps.now();
      const inserted = await db
        .insert(contentCalendarEntries)
        .values({
          id: deps.nextId("calendar-entry"),
          userId: deps.userId,
          accountId,
          plannedAt,
          contentOutputId: contentOutputId ?? null,
          candidateId: candidateId ?? null,
          status: "planned",
          note: note ?? "",
          publishedAt: null,
          createdAt: ts,
          updatedAt: ts,
        })
        .returning();
      return inserted[0]!;
    },

    async updateEntry(entryId, patch) {
      const current = await getEntry(entryId); // ownership + existence gate
      // Resolve the post-patch binding then re-check the not-both-bound invariant.
      const nextContentOutputId =
        patch.contentOutputId !== undefined
          ? patch.contentOutputId
          : current.contentOutputId;
      const nextCandidateId =
        patch.candidateId !== undefined ? patch.candidateId : current.candidateId;
      assertNotBothBound(nextContentOutputId, nextCandidateId);

      const set: Partial<EntryRow> = { updatedAt: deps.now() };
      if (patch.plannedAt !== undefined) set.plannedAt = patch.plannedAt;
      if (patch.note !== undefined) set.note = patch.note;
      if (patch.contentOutputId !== undefined) {
        set.contentOutputId = patch.contentOutputId;
      }
      if (patch.candidateId !== undefined) set.candidateId = patch.candidateId;

      const updated = await db
        .update(contentCalendarEntries)
        .set(set)
        .where(eq(contentCalendarEntries.id, entryId))
        .returning();
      return updated[0]!;
    },

    async transitionEntry(entryId, status) {
      const current = await getEntry(entryId); // ownership + existence gate
      const from = current.status as EntryStatus;
      if (!STATUS_TRANSITIONS[from]?.includes(status)) {
        throw new Error(
          `ConflictError: illegal calendar status transition ${from} -> ${status}`,
        );
      }
      const ts = deps.now();
      const set: Partial<EntryRow> = { status, updatedAt: ts };
      // published_at is stamped only on a real → published flip; cleared otherwise.
      set.publishedAt = status === "published" ? ts : null;
      const updated = await db
        .update(contentCalendarEntries)
        .set(set)
        .where(eq(contentCalendarEntries.id, entryId))
        .returning();
      return updated[0]!;
    },

    async deleteEntry(entryId) {
      await getEntry(entryId); // ownership + existence gate
      await db
        .delete(contentCalendarEntries)
        .where(eq(contentCalendarEntries.id, entryId));
    },

    async getCadence(accountId) {
      const rows = await db
        .select()
        .from(publishingCadences)
        .where(
          and(
            eq(publishingCadences.userId, deps.userId),
            eq(publishingCadences.accountId, accountId),
          ),
        );
      return rows[0] ?? null;
    },

    // One cadence per (user, account): UNIQUE (user_id, account_id) is the upsert
    // anchor. Insert; on conflict update the mutable fields in place.
    async upsertCadence({ accountId, frequency, preferredSlots }) {
      const ts = deps.now();
      const slots = preferredSlots ?? [];
      const inserted = await db
        .insert(publishingCadences)
        .values({
          id: deps.nextId("cadence"),
          userId: deps.userId,
          accountId,
          frequency,
          preferredSlots: slots,
          createdAt: ts,
          updatedAt: ts,
        })
        .onConflictDoUpdate({
          target: [publishingCadences.userId, publishingCadences.accountId],
          set: { frequency, preferredSlots: slots, updatedAt: ts },
        })
        .returning();
      return inserted[0]!;
    },
  };
}
