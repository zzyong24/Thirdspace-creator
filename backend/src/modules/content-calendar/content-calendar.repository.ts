import type { Db } from "@creatoros/backend";
import {
  and,
  asc,
  eq,
  gte,
  inArray,
  isNotNull,
  lte,
} from "drizzle-orm";
import {
  contentCalendarEntries,
  publishingCadences,
} from "./content-calendar.db-schema";
import { OwnershipError, ValidationError } from "./content-calendar.errors";

// ContentCalendar repository (foundation §5.2) — user-scoped queries ONLY. `userId`
// is baked into deps (mirrors the platform-account/candidate repos): EVERY query
// filters `eq(table.userId, deps.userId)` and EVERY insert stamps
// `userId: deps.userId`. A getEntry(id) / getCadenceRowByAccount throws OwnershipError
// when the scoped select returns empty — never revealing cross-user existence
// (foundation §2: 404 not 403).
//
// [T-332 S2] 号一致性门(SPEC 2026-07-15 account-full-isolation §4.5):`accountId`
// (= ctx 当前号,service 已 requireAccountId 断言)也 baked 进 deps;**所有 by-id
// 读写叠号**——跨号 by-id 与跨 user 同语义(OwnershipError → 404,不泄露存在)。
// 两张表出生即 account_id NOT NULL(全仓 strict 终态范本),列表/节奏读本就
// strict eq(accountId),无 OR-NULL、无 null 退化。
//
// The not-both-bound invariant (an entry binds a ContentOutput OR a Candidate, never
// both — §7.2) is enforced here (a pglite CHECK across two nullable columns is awkward)
// AND re-validated on update. The cadence (user_id, account_id) UNIQUE backs upsert:
// UPDATE if present else INSERT, so a second upsert never duplicates.

export type ContentCalendarEntryRow =
  typeof contentCalendarEntries.$inferSelect;
export type PublishingCadenceRow = typeof publishingCadences.$inferSelect;

export interface PreferredSlot {
  weekday: number;
  time: string;
}

export interface RepoDeps {
  now: () => string; // ISO-8601 clock (injected for deterministic tests)
  nextId: (prefix: string) => string; // id generator (deterministic in tests)
  userId: string; // the ownership boundary, baked in at construction
  // [T-332 S2] ctx 当前号(service 已断言非空)。by-id 读写的号一致性门用它叠号
  // (§4.5:跨号 by-id → 404);列表/节奏路径仍走显式 accountId 参数(strict eq)。
  accountId: string;
}

export interface CreateEntryInput {
  plannedAt: string;
  plannedDate?: string;
  projectId?: string | null;
  contentOutputId?: string | null;
  candidateId?: string | null;
  note?: string;
}

export interface ListEntriesQuery {
  from: string;
  to: string;
  limit?: number;
  offset?: number;
}

export interface UpdateEntryInput {
  plannedAt?: string;
  plannedDate?: string;
  contentOutputId?: string | null;
  candidateId?: string | null;
  note?: string;
  // Service-approved status reset (the missed→planned reschedule); the machine
  // guard lives in the service.
  status?: string;
  publishedAt?: string | null;
}

export interface SetEntryStatusInput {
  status: string;
  publishedAt?: string | null;
}

export interface UpsertCadenceInput {
  frequency: string;
  preferredSlots: PreferredSlot[];
}

export interface ContentCalendarRepository {
  // Fixture hydration (insert with explicit user_id already on the row).
  seedEntries(rows: ContentCalendarEntryRow[]): Promise<void>;
  seedCadences(rows: PublishingCadenceRow[]): Promise<void>;

  createEntry(
    accountId: string,
    input: CreateEntryInput,
  ): Promise<ContentCalendarEntryRow>;
  listEntries(
    accountId: string,
    query: ListEntriesQuery,
  ): Promise<{ rows: ContentCalendarEntryRow[]; total: number }>;
  getEntry(entryId: string): Promise<ContentCalendarEntryRow>;
  findActiveProjectSchedule(
    projectId: string,
  ): Promise<ContentCalendarEntryRow | null>;
  listActiveProjectSchedules(
    accountId: string,
  ): Promise<ContentCalendarEntryRow[]>;
  updateEntry(
    entryId: string,
    patch: UpdateEntryInput,
  ): Promise<ContentCalendarEntryRow>;
  setEntryStatus(
    entryId: string,
    input: SetEntryStatusInput,
  ): Promise<ContentCalendarEntryRow>;
  deleteEntry(entryId: string): Promise<{ id: string; deleted: true }>;
  entriesForAttainment(
    accountId: string,
    window: { from: string; to: string },
  ): Promise<ContentCalendarEntryRow[]>;

  upsertCadence(
    accountId: string,
    input: UpsertCadenceInput,
  ): Promise<PublishingCadenceRow>;
  getCadence(accountId: string): Promise<PublishingCadenceRow | null>;
}

// Reject an entry that binds BOTH a ContentOutput and a Candidate (§7.2 — exactly one,
// or neither). Validated on create + on the resulting row after update.
function assertNotBothBound(
  contentOutputId: string | null | undefined,
  candidateId: string | null | undefined,
): void {
  if (contentOutputId != null && candidateId != null) {
    throw new ValidationError(
      "ValidationError: a calendar entry cannot bind both a contentOutputId and a candidateId",
    );
  }
}

export function createContentCalendarRepository(
  db: Db,
  deps: RepoDeps,
): ContentCalendarRepository {
  async function getEntryRowById(
    entryId: string,
  ): Promise<ContentCalendarEntryRow> {
    const rows = await db
      .select()
      .from(contentCalendarEntries)
      .where(
        and(
          eq(contentCalendarEntries.userId, deps.userId),
          // [T-332 S2] 号一致性门(§4.5):by-id 叠当前号;跨号与跨 user 同语义
          // (404,不泄露存在)。
          eq(contentCalendarEntries.accountId, deps.accountId),
          eq(contentCalendarEntries.id, entryId),
        ),
      );
    const row = rows[0];
    if (!row) {
      throw new OwnershipError(
        `OwnershipError: calendar entry not found: ${entryId}`,
      );
    }
    return row;
  }

  return {
    async seedEntries(rows) {
      if (rows.length === 0) return;
      await db
        .insert(contentCalendarEntries)
        .values(rows)
        .onConflictDoNothing();
    },

    async seedCadences(rows) {
      if (rows.length === 0) return;
      await db.insert(publishingCadences).values(rows).onConflictDoNothing();
    },

    async createEntry(accountId, input) {
      const contentOutputId = input.contentOutputId ?? null;
      const candidateId = input.candidateId ?? null;
      assertNotBothBound(contentOutputId, candidateId);
      const inserted = await db
        .insert(contentCalendarEntries)
        .values({
          id: deps.nextId("cal"),
          userId: deps.userId,
          accountId,
          projectId: input.projectId ?? null,
          plannedDate: input.plannedDate ?? input.plannedAt.slice(0, 10),
          plannedAt: input.plannedAt,
          contentOutputId,
          candidateId,
          status: "planned",
          note: input.note ?? "",
          publishedAt: null,
          createdAt: deps.now(),
          updatedAt: deps.now(),
        })
        .returning();
      return inserted[0]!;
    },

    async listEntries(accountId, { from, to, limit = 100, offset = 0 }) {
      const where = and(
        eq(contentCalendarEntries.userId, deps.userId),
        eq(contentCalendarEntries.accountId, accountId),
        gte(contentCalendarEntries.plannedDate, from.slice(0, 10)),
        lte(contentCalendarEntries.plannedDate, to.slice(0, 10)),
      );
      const rows = await db
        .select()
        .from(contentCalendarEntries)
        .where(where)
        .orderBy(
          asc(contentCalendarEntries.plannedDate),
          asc(contentCalendarEntries.createdAt),
          asc(contentCalendarEntries.id),
        )
        .limit(limit)
        .offset(offset);
      const all = await db
        .select({ id: contentCalendarEntries.id })
        .from(contentCalendarEntries)
        .where(where);
      return { rows, total: all.length };
    },

    getEntry: getEntryRowById,

    async findActiveProjectSchedule(projectId) {
      const rows = await db
        .select()
        .from(contentCalendarEntries)
        .where(
          and(
            eq(contentCalendarEntries.userId, deps.userId),
            eq(contentCalendarEntries.accountId, deps.accountId),
            eq(contentCalendarEntries.projectId, projectId),
            inArray(contentCalendarEntries.status, ["planned", "missed"]),
          ),
        )
        .orderBy(
          asc(contentCalendarEntries.plannedDate),
          asc(contentCalendarEntries.createdAt),
          asc(contentCalendarEntries.id),
        )
        .limit(1);
      return rows[0] ?? null;
    },

    async listActiveProjectSchedules(accountId) {
      return db
        .select()
        .from(contentCalendarEntries)
        .where(
          and(
            eq(contentCalendarEntries.userId, deps.userId),
            eq(contentCalendarEntries.accountId, accountId),
            isNotNull(contentCalendarEntries.projectId),
            inArray(contentCalendarEntries.status, ["planned", "missed"]),
          ),
        )
        .orderBy(
          asc(contentCalendarEntries.plannedDate),
          asc(contentCalendarEntries.createdAt),
          asc(contentCalendarEntries.id),
        );
    },

    async updateEntry(entryId, patch) {
      const existing = await getEntryRowById(entryId); // ownership gate
      const set: Record<string, unknown> = { updatedAt: deps.now() };
      if (patch.plannedAt !== undefined) set.plannedAt = patch.plannedAt;
      if (patch.plannedDate !== undefined) set.plannedDate = patch.plannedDate;
      if (patch.contentOutputId !== undefined)
        set.contentOutputId = patch.contentOutputId;
      if (patch.candidateId !== undefined) set.candidateId = patch.candidateId;
      if (patch.note !== undefined) set.note = patch.note;
      if (patch.status !== undefined) set.status = patch.status;
      if (patch.publishedAt !== undefined) set.publishedAt = patch.publishedAt;
      // Re-validate the not-both-bound invariant on the RESULTING row (a patch that
      // only sets one side must not collide with the other already-stored side).
      const resultingOutputId =
        patch.contentOutputId !== undefined
          ? patch.contentOutputId
          : existing.contentOutputId;
      const resultingCandidateId =
        patch.candidateId !== undefined
          ? patch.candidateId
          : existing.candidateId;
      assertNotBothBound(resultingOutputId, resultingCandidateId);
      const updated = await db
        .update(contentCalendarEntries)
        .set(set)
        .where(
          and(
            eq(contentCalendarEntries.userId, deps.userId),
            // [T-332 S2] 写 WHERE 同步叠号(与门一致,防 TOCTOU 漂移)。
            eq(contentCalendarEntries.accountId, deps.accountId),
            eq(contentCalendarEntries.id, entryId),
          ),
        )
        .returning();
      return updated[0]!;
    },

    async setEntryStatus(entryId, { status, publishedAt }) {
      await getEntryRowById(entryId); // ownership gate
      const set: Record<string, unknown> = {
        status,
        updatedAt: deps.now(),
      };
      if (publishedAt !== undefined) set.publishedAt = publishedAt;
      const updated = await db
        .update(contentCalendarEntries)
        .set(set)
        .where(
          and(
            eq(contentCalendarEntries.userId, deps.userId),
            // [T-332 S2] 写 WHERE 同步叠号(与门一致)。
            eq(contentCalendarEntries.accountId, deps.accountId),
            eq(contentCalendarEntries.id, entryId),
          ),
        )
        .returning();
      return updated[0]!;
    },

    async deleteEntry(entryId) {
      await getEntryRowById(entryId); // ownership gate
      await db
        .delete(contentCalendarEntries)
        .where(
          and(
            eq(contentCalendarEntries.userId, deps.userId),
            // [T-332 S2] 删除 WHERE 同步叠号(与门一致)。
            eq(contentCalendarEntries.accountId, deps.accountId),
            eq(contentCalendarEntries.id, entryId),
          ),
        );
      return { id: entryId, deleted: true };
    },

    async entriesForAttainment(accountId, { from, to }) {
      return db
        .select()
        .from(contentCalendarEntries)
        .where(
          and(
            eq(contentCalendarEntries.userId, deps.userId),
            eq(contentCalendarEntries.accountId, accountId),
            gte(contentCalendarEntries.plannedDate, from.slice(0, 10)),
            lte(contentCalendarEntries.plannedDate, to.slice(0, 10)),
          ),
        )
        .orderBy(
          asc(contentCalendarEntries.plannedDate),
          asc(contentCalendarEntries.createdAt),
          asc(contentCalendarEntries.id),
        );
    },

    async upsertCadence(accountId, input) {
      const existing = await db
        .select()
        .from(publishingCadences)
        .where(
          and(
            eq(publishingCadences.userId, deps.userId),
            eq(publishingCadences.accountId, accountId),
          ),
        )
        .limit(1);
      if (existing[0]) {
        const updated = await db
          .update(publishingCadences)
          .set({
            frequency: input.frequency,
            preferredSlots: input.preferredSlots,
            updatedAt: deps.now(),
          })
          .where(
            and(
              eq(publishingCadences.userId, deps.userId),
              eq(publishingCadences.accountId, accountId),
            ),
          )
          .returning();
        return updated[0]!;
      }
      const inserted = await db
        .insert(publishingCadences)
        .values({
          id: deps.nextId("cad"),
          userId: deps.userId,
          accountId,
          frequency: input.frequency,
          preferredSlots: input.preferredSlots,
          createdAt: deps.now(),
          updatedAt: deps.now(),
        })
        .returning();
      return inserted[0]!;
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
        )
        .limit(1);
      return rows[0] ?? null;
    },
  };
}
