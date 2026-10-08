import {projects,contentOutputs} from "../../schema/projects";
import {withWorkspaceParentWrite, type WorkspaceWriteTx} from "../../workspace-write";
import {accountGroups} from "../../schema/account-groups";
import {workspaceFilter, workspaceStamp} from "../../workspace-scope";
import type {RequestContext} from "@creatoros/contract";
import {lockWorkspaceMembership} from "../platform-account/membership-lock.service";
import type { Db } from "@creatoros/backend";
import {
  and,
  asc,
  eq,
  gte,
  inArray,
  isNotNull,
  lte,
  ne,
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
  accountId: string | null;
  groupId?: string | null;
  ctx?: RequestContext;
}

export interface CreateEntryInput {
  targetAccountId?: string | null;
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
    accountId: string | null,
    input: CreateEntryInput,
  ): Promise<ContentCalendarEntryRow>;
  listEntries(
    accountId: string | null,
    query: ListEntriesQuery,
  ): Promise<{ rows: ContentCalendarEntryRow[]; total: number }>;
  getEntry(entryId: string): Promise<ContentCalendarEntryRow>;
  setTarget(entryId: string, targetAccountId: string | null): Promise<ContentCalendarEntryRow>;
  findActiveProjectSchedule(
    projectId: string,
  ): Promise<ContentCalendarEntryRow | null>;
  listActiveProjectSchedules(
    accountId: string | null,
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
    accountId: string | null,
    window: { from: string; to: string },
  ): Promise<ContentCalendarEntryRow[]>;

  upsertCadence(
    accountId: string | null,
    input: UpsertCadenceInput,
  ): Promise<PublishingCadenceRow>;
  getCadence(accountId: string | null): Promise<PublishingCadenceRow | null>;
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
  async function lockWritableGroup(tx:Parameters<Parameters<Db["transaction"]>[0]>[0]):Promise<void> {
    if (!deps.groupId) return;
    const [group]=await tx.select({id:accountGroups.id}).from(accountGroups).where(and(eq(accountGroups.userId,deps.userId),eq(accountGroups.id,deps.groupId),eq(accountGroups.status,"active"))).for("update");
    if(!group)throw new OwnershipError("账号组已归档或不可用");
  }
  function withEntryParent<T>(tx:WorkspaceWriteTx,input:{projectId?:string|null;contentOutputId?:string|null},write:()=>Promise<T>):Promise<T> {
    const ctx:RequestContext=deps.ctx??{userId:deps.userId,groupId:deps.groupId,accountId:deps.accountId,requestId:"calendar-parent-write",source:"user"};
    if(input.projectId)return withWorkspaceParentWrite(tx as unknown as Db,ctx,{table:projects,id:projects.id,userId:projects.userId,groupId:projects.groupId,accountId:projects.accountId},[input.projectId],write);
    if(input.contentOutputId)return withWorkspaceParentWrite(tx as unknown as Db,ctx,{table:projects,id:projects.id,userId:projects.userId,groupId:projects.groupId,accountId:projects.accountId,via:[{table:contentOutputs,id:contentOutputs.id,parentId:contentOutputs.projectId}]},[input.contentOutputId],write);
    return write();
  }
  async function getEntryRowById(
    entryId: string,
    queryDb:Db=db,
  ): Promise<ContentCalendarEntryRow> {
    const rows = await queryDb
      .select()
      .from(contentCalendarEntries)
      .where(
        and(
          eq(contentCalendarEntries.userId, deps.userId),
          // [T-332 S2] 号一致性门(§4.5):by-id 叠当前号;跨号与跨 user 同语义
          // (404,不泄露存在)。
          workspaceFilter(contentCalendarEntries, deps),
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
      return db.transaction(async tx => {
      const frozen = deps.groupId && deps.ctx ? await lockWorkspaceMembership(tx, {...deps.ctx, accountId:input.targetAccountId ?? null, membershipVersion:undefined}) : null;
      await lockWritableGroup(tx);
      return withEntryParent(tx,input,async()=>{
      const inserted = await tx
        .insert(contentCalendarEntries)
        .values({
          id: deps.nextId("cal"),
          userId: deps.userId,
          ...workspaceStamp(deps),
          accountId: deps.groupId ? (input.targetAccountId ?? null) : accountId,
          membershipVersion: frozen?.membershipVersion ?? null,
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
      });
      });
    },

    async listEntries(accountId, { from, to, limit = 100, offset = 0 }) {
      const where = and(
        eq(contentCalendarEntries.userId, deps.userId),
        workspaceFilter(contentCalendarEntries, deps),
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
    async setTarget(entryId, targetAccountId) {
      await getEntryRowById(entryId);
      if (!deps.groupId || !deps.ctx) throw new ValidationError("请使用账号组入口选择发布目标");
      return db.transaction(async tx => {
        const frozen = await lockWorkspaceMembership(tx, {...deps.ctx!, accountId:targetAccountId, membershipVersion:undefined});
        await lockWritableGroup(tx);
        const current=await getEntryRowById(entryId,tx as unknown as Db);
        return withEntryParent(tx,current,async()=>{
        const [row] = await tx.update(contentCalendarEntries).set({accountId:targetAccountId,membershipVersion:frozen.membershipVersion,updatedAt:deps.now()}).where(and(eq(contentCalendarEntries.userId,deps.userId),workspaceFilter(contentCalendarEntries,deps),eq(contentCalendarEntries.id,entryId),ne(contentCalendarEntries.status,"published"))).returning();
        if (!row) throw new OwnershipError("排期不存在");
        return row;
        });
      });
    },

    async findActiveProjectSchedule(projectId) {
      const rows = await db
        .select()
        .from(contentCalendarEntries)
        .where(
          and(
            eq(contentCalendarEntries.userId, deps.userId),
            workspaceFilter(contentCalendarEntries, deps),
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
            workspaceFilter(contentCalendarEntries, deps),
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
      return db.transaction(async tx=>{
      await lockWritableGroup(tx);
      const current=await getEntryRowById(entryId,tx as unknown as Db);
      return withEntryParent(tx,{projectId:current.projectId,contentOutputId:patch.contentOutputId??current.contentOutputId},async()=>{
      const updated = await tx
        .update(contentCalendarEntries)
        .set(set)
        .where(
          and(
            eq(contentCalendarEntries.userId, deps.userId),
            // [T-332 S2] 写 WHERE 同步叠号(与门一致,防 TOCTOU 漂移)。
            workspaceFilter(contentCalendarEntries, deps),
            eq(contentCalendarEntries.id, entryId),
          ),
        )
        .returning();
      if(!updated[0])throw new OwnershipError("排期不存在");
      return updated[0];
      });
      });
    },

    async setEntryStatus(entryId, { status, publishedAt }) {
      await getEntryRowById(entryId); // ownership gate
      const set: Record<string, unknown> = {
        status,
        updatedAt: deps.now(),
      };
      if (publishedAt !== undefined) set.publishedAt = publishedAt;
      return db.transaction(async tx=>{
      await lockWritableGroup(tx);
      const current=await getEntryRowById(entryId,tx as unknown as Db);
      return withEntryParent(tx,current,async()=>{
      const updated = await tx
        .update(contentCalendarEntries)
        .set(set)
        .where(
          and(
            eq(contentCalendarEntries.userId, deps.userId),
            // [T-332 S2] 写 WHERE 同步叠号(与门一致)。
            workspaceFilter(contentCalendarEntries, deps),
            eq(contentCalendarEntries.id, entryId),
          ),
        )
        .returning();
      if(!updated[0])throw new OwnershipError("排期不存在");
      return updated[0];
      });
      });
    },

    async deleteEntry(entryId) {
      await getEntryRowById(entryId); // ownership gate
      return db.transaction(async tx=>{
      await lockWritableGroup(tx);
      const current=await getEntryRowById(entryId,tx as unknown as Db);
      return withEntryParent(tx,current,async()=>{
      await tx
        .delete(contentCalendarEntries)
        .where(
          and(
            eq(contentCalendarEntries.userId, deps.userId),
            // [T-332 S2] 删除 WHERE 同步叠号(与门一致)。
            workspaceFilter(contentCalendarEntries, deps),
            eq(contentCalendarEntries.id, entryId),
          ),
        );
      return { id: entryId, deleted: true as const };
      });
      });
    },

    async entriesForAttainment(accountId, { from, to }) {
      return db
        .select()
        .from(contentCalendarEntries)
        .where(
          and(
            eq(contentCalendarEntries.userId, deps.userId),
            workspaceFilter(contentCalendarEntries, deps),
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
      return db.transaction(async tx=>{
      await lockWritableGroup(tx);
      const existing = await tx
        .select()
        .from(publishingCadences)
        .where(
          and(
            eq(publishingCadences.userId, deps.userId),
            workspaceFilter(publishingCadences, deps),
          ),
        )
        .limit(1);
      if (existing[0]) {
        const updated = await tx
          .update(publishingCadences)
          .set({
            frequency: input.frequency,
            preferredSlots: input.preferredSlots,
            updatedAt: deps.now(),
          })
          .where(
            and(
              eq(publishingCadences.userId, deps.userId),
              workspaceFilter(publishingCadences, deps),
            ),
          )
          .returning();
        return updated[0]!;
      }
      const inserted = await tx
        .insert(publishingCadences)
        .values({
          id: deps.nextId("cad"),
          userId: deps.userId,
          ...workspaceStamp(deps),
          accountId: deps.groupId ? null : accountId,
          frequency: input.frequency,
          preferredSlots: input.preferredSlots,
          createdAt: deps.now(),
          updatedAt: deps.now(),
        })
        .returning();
      return inserted[0]!;
      });
    },

    async getCadence(accountId) {
      const rows = await db
        .select()
        .from(publishingCadences)
        .where(
          and(
            eq(publishingCadences.userId, deps.userId),
            workspaceFilter(publishingCadences, deps),
          ),
        )
        .limit(1);
      return rows[0] ?? null;
    },
  };
}
