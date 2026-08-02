import {
  and,
  asc,
  eq,
  desc,
  inArray,
  sql,
  type Db,
  // [T-079a] 战绩投影的只读跨表直查(SPEC §1)。仓内跨模块 seam 惯例是 service 层
  // port(reviews/analytics 的「按 projectId 取窗口」行级 seam),但战绩是全列表
  // grouped 只读统计——按 material-links/analytics 的「共享 schema 直查」惯例
  // (这些表的 canonical 定义本就住共享 infra @creatoros/backend,模块间无 DB FK,
  // 所有权由 user_id 过滤保证),在本 repo 只读 join,不 import 任何其他模块的
  // repository/service(G1 acceptance:无 modules/<other> import)。
  materialLinks,
  contentOutputs,
  publications,
} from "@creatoros/backend";
import {
  knowledgeItems,
  knowledgeRevisions,
  knowledgeRelations,
  knowledgeFolders,
} from "./knowledge.db-schema";
import { OwnershipError, ConflictError } from "./knowledge.errors";

// Knowledge repository (foundation §5.2) — user-scoped queries ONLY. Every
// read/write filters on the owning item's `userId`; children (revisions/
// relations) inherit ownership via the parent `get` gate (foundation §1/§2,
// SPEC §10/§20). There is NO unscoped select/update.
//
// `userId` comes from RequestContext, passed per-call (NOT baked into deps):
// one repo instance serves all users; the service threads `ctx.userId`. The
// clock/id generator are injected (`deps`) for deterministic tests.
//
// §12 invariants enforced here:
//  - create mints revision #1 and sets currentRevisionId (items born `active`).
//  - createRevision appends the next revision (max+1), repoints
//    currentRevisionId, and NEVER UPDATE/DELETE an existing revision row.

export type KnowledgeItemRow = typeof knowledgeItems.$inferSelect;

// [T-079a] 战绩投影(SPEC §1):usedCount = 用料链(materialLinks,entity_type=
// 'knowledge')反查计数;usedInPublished = 所挂 projectId 存在 status='published'
// 的 publication(material_links.project_id → content_outputs → publications)。
// 只读派生值,非落库列;两条 grouped/inArray 查询一次算齐,无 N+1。
export type KnowledgeItemWithStats = KnowledgeItemRow & {
  usedCount: number;
  usedInPublished: boolean;
};
export type KnowledgeRevisionRow = typeof knowledgeRevisions.$inferSelect;
export type KnowledgeFolderRow = typeof knowledgeFolders.$inferSelect;
type KnowledgeRelationDbRow = typeof knowledgeRelations.$inferSelect;

// `strength` is stored as a decimal string; the repo parses it to Number so the
// DTO stays numeric (contract knowledgeRelationResource.strength is z.number()).
export type KnowledgeRelationRow = Omit<KnowledgeRelationDbRow, "strength"> & {
  strength: number;
};

export interface RepoDeps {
  now: () => string; // ISO-8601 clock (injected for deterministic tests)
  nextId: (prefix: string) => string; // id generator (deterministic in tests)
}

// [T-332 S2] 第二所有权维度(多抖音号 / 多人设)。knowledge 的 repo 一次构造、
// userId 逐调用传入(非 baked deps),故 accountId 也随调用透传(与 userId 并列)。
// SPEC 2026-07-15 account-full-isolation §4.1/§4.2:一律 strict——调用方(service)
// 已用 requireAccountId 断言非空,repo 侧类型收紧为 string,不存在「null → 退化
// 不过滤」路径。子表 revisions/relations 无此列,经父行门透传。
export type AccountScope = string;

export interface KnowledgeRepository {
  seedKnowledge(rows: KnowledgeItemRow[]): Promise<void>;
  seedRevisions(rows: KnowledgeRevisionRow[]): Promise<void>;
  seedRelations(rows: KnowledgeRelationDbRow[]): Promise<void>;
  listFolders(userId: string, accountId: AccountScope): Promise<KnowledgeFolderRow[]>;
  createFolder(
    userId: string,
    accountId: AccountScope,
    input: { name: string; parentId?: string | null },
  ): Promise<KnowledgeFolderRow>;
  moveToFolder(
    userId: string,
    accountId: AccountScope,
    knowledgeId: string,
    folderId: string | null,
  ): Promise<KnowledgeItemWithStats>;
  // [T-079a] list/get 返回带战绩投影的行(usedCount/usedInPublished);写路径的
  // 内部所有权门仍走轻量行读,不为门查询付统计成本。
  // [T-332 S2] 每个方法 userId 后紧跟 accountId(strict:eq 收窄,无 null 退化)。
  list(userId: string, accountId: AccountScope): Promise<KnowledgeItemWithStats[]>;
  get(
    userId: string,
    accountId: AccountScope,
    knowledgeId: string,
  ): Promise<KnowledgeItemWithStats>;
  getRevision(
    userId: string,
    accountId: AccountScope,
    revisionId: string,
  ): Promise<KnowledgeRevisionRow>;
  listRevisions(
    userId: string,
    accountId: AccountScope,
    knowledgeId: string,
  ): Promise<KnowledgeRevisionRow[]>;
  listRelations(
    userId: string,
    accountId: AccountScope,
    knowledgeId: string,
  ): Promise<KnowledgeRelationRow[]>;
  // [T-091] 全量语义边(user-scoped):经 source 端 knowledge_items 的 user_id 收窄
  // (relations 子表无 user_id 列,所有权经父行 join 保证)。单查询,无 N+1。
  listAllRelations(
    userId: string,
    accountId: AccountScope,
  ): Promise<KnowledgeRelationRow[]>;
  // [T-092] 已回流评论锚集合:active 且 sourceMetadata.origin='comment_backflow'
  // 的知识行,聚合其 signalExternalIds(幂等反查;库量级几百行,内存 diff)。
  listBackflowedSignalExternalIds(
    userId: string,
    accountId: AccountScope,
  ): Promise<Set<string>>;
  create(
    userId: string,
    accountId: AccountScope,
    input: {
      title: string;
      knowledgeType?: string;
      content?: string;
      // [T-079a] 可选出处(SPEC §1),缺省落库 NULL。
      sourceNote?: string | null;
      // [T-092] 评论回流:来源枚举(缺省 manual)+ 溯源/幂等锚 metadata(缺省 {})。
      sourceType?: string;
      sourceMetadata?: Record<string, unknown>;
      folderId?: string | null;
      assetId?: string | null;
    },
  ): Promise<KnowledgeItemWithStats>;
  createRevision(
    userId: string,
    accountId: AccountScope,
    knowledgeId: string,
    input: { content: string },
  ): Promise<KnowledgeRevisionRow>;
  /** 内置内容升级时只更新来源版本/校验元数据,正文仍通过 append-only revision。 */
  updateSourceMetadata(
    userId: string,
    accountId: AccountScope,
    knowledgeId: string,
    sourceMetadata: Record<string, unknown>,
  ): Promise<KnowledgeItemWithStats>;
  createRelation(
    userId: string,
    accountId: AccountScope,
    sourceKnowledgeId: string,
    input: {
      targetKnowledgeId: string;
      relationType: string;
      // [T-091] AI 建边 provenance;缺省 'user'。
      createdByType?: "user" | "ai";
    },
  ): Promise<KnowledgeRelationRow>;
  archive(
    userId: string,
    accountId: AccountScope,
    knowledgeId: string,
  ): Promise<KnowledgeItemWithStats>;
  // [T-211] 只改标题(scoped 更新,所有权门 + WHERE user 收窄)。startup fixup 用它把
  // win-video-tutor 存量条目标题去品牌前缀;不动 content/revision/status。
  renameTitle(
    userId: string,
    accountId: AccountScope,
    knowledgeId: string,
    title: string,
  ): Promise<KnowledgeItemWithStats>;
  removeRelation(
    userId: string,
    accountId: AccountScope,
    sourceKnowledgeId: string,
    input: { targetKnowledgeId: string; relationType: string },
  ): Promise<KnowledgeRelationRow>;
  // [T-332 S2 · ISO-06 例外口] 组合根(persistence-client)win-video-tutor 种子巡检
  // 专用:启动时跨号扫 canonical user 的 seed 条目(按 sourceMetadata.origin 幂等
  // 补 tag / 去旧标题前缀)。user 级、无 account 过滤——这是**显式命名**的系统巡检
  // 方法,非隐式全量退化;任何经 ctx 的业务读写严禁调用。
  listAllAccountsSystem(userId: string): Promise<KnowledgeItemWithStats[]>;
  // [T-332 S2 · ISO-06 例外口] 同上:种子条目标题修复(user 级门,跨号可改)。
  // 只改 title + updatedAt,不动 content/revision/status。
  renameTitleSystem(
    userId: string,
    knowledgeId: string,
    title: string,
  ): Promise<KnowledgeItemWithStats>;
}

function parseRelation(row: KnowledgeRelationDbRow): KnowledgeRelationRow {
  return { ...row, strength: Number(row.strength) };
}

export function createKnowledgeRepository(
  db: Db,
  deps: RepoDeps,
): KnowledgeRepository {
  // [T-332 S2] strict 号门(SPEC §4.1,退役 lenient OR-NULL):当前号 = 唯一可见集。
  // 存量 NULL 行兼容前提已被拍板 ②(清库重拉)废除;调用方已断言 accountId 非空。
  const accountVisibility = (accountId: AccountScope) =>
    eq(knowledgeItems.accountId, accountId);

  // 轻量行读:写路径/子实体的所有权门用它(不付战绩统计成本)。
  // [T-332 S2] strict:仅当前号的行可见;跨号 by-id → OwnershipError(404,§4.5)。
  async function getRow(
    userId: string,
    accountId: AccountScope,
    knowledgeId: string,
  ): Promise<KnowledgeItemRow> {
    const rows = await db
      .select()
      .from(knowledgeItems)
      .where(
        and(
          eq(knowledgeItems.id, knowledgeId),
          eq(knowledgeItems.userId, userId),
          accountVisibility(accountId),
        ),
      );
    const row = rows[0];
    // Cross-user / unknown id is indistinguishable (foundation §2: 404, never
    // reveal existence) → OwnershipError.
    if (!row) throw new OwnershipError("Knowledge item not found");
    return row;
  }

  // [T-079a] 战绩投影:对一批行一次算齐 usedCount + usedInPublished(两条
  // grouped/inArray 查询,无 N+1)。usedCount = material_links(entity_type=
  // 'knowledge')反查计数;usedInPublished = 该知识所挂任一 projectId 下存在
  // status='published' 的 publication(project → content_outputs → publications,
  // publications 无 project_id 列,经 content_output 归属项目)。全程只读,
  // user_id 过滤保证所有权(见文件头 seam 注释)。
  async function attachStats(
    userId: string,
    rows: KnowledgeItemRow[],
  ): Promise<KnowledgeItemWithStats[]> {
    if (rows.length === 0) return [];
    const ids = rows.map((r) => r.id);
    const scope = and(
      eq(materialLinks.userId, userId),
      eq(materialLinks.entityType, "knowledge"),
      inArray(materialLinks.entityId, ids),
    );
    const counts = await db
      .select({
        entityId: materialLinks.entityId,
        n: sql<number>`count(*)::int`,
      })
      .from(materialLinks)
      .where(scope)
      .groupBy(materialLinks.entityId);
    const published = await db
      .selectDistinct({ entityId: materialLinks.entityId })
      .from(materialLinks)
      .innerJoin(
        contentOutputs,
        eq(contentOutputs.projectId, materialLinks.projectId),
      )
      .innerJoin(
        publications,
        and(
          eq(publications.contentOutputId, contentOutputs.id),
          eq(publications.status, "published"),
        ),
      )
      .where(scope);
    const countBy = new Map(counts.map((c) => [c.entityId, c.n]));
    const publishedSet = new Set(published.map((p) => p.entityId));
    return rows.map((row) => ({
      ...row,
      usedCount: countBy.get(row.id) ?? 0,
      usedInPublished: publishedSet.has(row.id),
    }));
  }

  async function get(
    userId: string,
    accountId: AccountScope,
    knowledgeId: string,
  ): Promise<KnowledgeItemWithStats> {
    const row = await getRow(userId, accountId, knowledgeId);
    const [withStats] = await attachStats(userId, [row]);
    return withStats!;
  }

  return {
    async seedKnowledge(rows) {
      if (rows.length === 0) return;
      await db.insert(knowledgeItems).values(rows).onConflictDoNothing();
    },
    async seedRevisions(rows) {
      if (rows.length === 0) return;
      await db.insert(knowledgeRevisions).values(rows).onConflictDoNothing();
    },
    async seedRelations(rows) {
      if (rows.length === 0) return;
      await db.insert(knowledgeRelations).values(rows).onConflictDoNothing();
    },

    async listFolders(userId, accountId) {
      return db
        .select()
        .from(knowledgeFolders)
        .where(
          and(
            eq(knowledgeFolders.userId, userId),
            eq(knowledgeFolders.accountId, accountId),
            eq(knowledgeFolders.status, "active"),
          ),
        )
        .orderBy(asc(knowledgeFolders.createdAt));
    },

    async createFolder(userId, accountId, input) {
      if (input.parentId) {
        const parents = await db
          .select()
          .from(knowledgeFolders)
          .where(
            and(
              eq(knowledgeFolders.id, input.parentId),
              eq(knowledgeFolders.userId, userId),
              eq(knowledgeFolders.accountId, accountId),
              eq(knowledgeFolders.status, "active"),
            ),
          );
        if (!parents[0]) throw new OwnershipError("Parent folder not found");
      }
      const id = deps.nextId("kfolder");
      const now = deps.now();
      await db.insert(knowledgeFolders).values({
        id,
        userId,
        accountId,
        parentId: input.parentId ?? null,
        name: input.name,
        status: "active",
        createdAt: now,
        updatedAt: now,
      });
      const rows = await db
        .select()
        .from(knowledgeFolders)
        .where(eq(knowledgeFolders.id, id));
      return rows[0]!;
    },

    async moveToFolder(userId, accountId, knowledgeId, folderId) {
      await getRow(userId, accountId, knowledgeId);
      if (folderId) {
        const folders = await db
          .select()
          .from(knowledgeFolders)
          .where(
            and(
              eq(knowledgeFolders.id, folderId),
              eq(knowledgeFolders.userId, userId),
              eq(knowledgeFolders.accountId, accountId),
              eq(knowledgeFolders.status, "active"),
            ),
          );
        if (!folders[0]) throw new OwnershipError("Folder not found");
      }
      await db
        .update(knowledgeItems)
        .set({ folderId, updatedAt: deps.now() })
        .where(
          and(
            eq(knowledgeItems.id, knowledgeId),
            eq(knowledgeItems.userId, userId),
            eq(knowledgeItems.accountId, accountId),
          ),
        );
      return get(userId, accountId, knowledgeId);
    },

    async list(userId, accountId) {
      const rows = await db
        .select()
        .from(knowledgeItems)
        .where(
          and(
            eq(knowledgeItems.userId, userId),
            // [T-332 S2] strict:只读当前号的知识(无 OR-NULL、无退化)。
            accountVisibility(accountId),
          ),
        )
        // [T-547] 知识库是导入/写入型资源：默认最新写入在前；id 作为同毫秒
        // 稳定次序，避免数据库返回顺序漂移。课程自然章节顺序不再绑架全局列表。
        .orderBy(desc(knowledgeItems.createdAt), desc(knowledgeItems.id));
      // [T-079a] 列表带战绩投影(一次 grouped 查询,无 N+1)。
      return attachStats(userId, rows);
    },

    get,

    async getRevision(userId, accountId, revisionId) {
      const rows = await db
        .select()
        .from(knowledgeRevisions)
        .where(eq(knowledgeRevisions.id, revisionId));
      const rev = rows[0];
      if (!rev) throw new OwnershipError("Revision not found");
      // Ownership gate: the parent item must be owned by `userId` (+号) (throws if not).
      await getRow(userId, accountId, rev.knowledgeItemId);
      return rev;
    },

    async listRevisions(userId, accountId, knowledgeId) {
      // Ownership gate on the parent item (cross-user / 跨号 / unknown id → 404, no
      // leak). Newest revision first so the caller can read the current head
      // (highest revisionNumber) as rows[0] without re-querying the item.
      await getRow(userId, accountId, knowledgeId);
      return db
        .select()
        .from(knowledgeRevisions)
        .where(eq(knowledgeRevisions.knowledgeItemId, knowledgeId))
        .orderBy(desc(knowledgeRevisions.revisionNumber));
    },

    async listRelations(userId, accountId, knowledgeId) {
      // Ownership gate on the source item.
      await getRow(userId, accountId, knowledgeId);
      const rows = await db
        .select()
        .from(knowledgeRelations)
        .where(eq(knowledgeRelations.sourceKnowledgeId, knowledgeId));
      return rows.map(parseRelation);
    },

    async listAllRelations(userId, accountId) {
      // [T-091] 全量边:relations 无 user_id 列 → join source 端 knowledge_items
      // 以 user_id 收窄(createRelation 已保证两端同 owner,source 端过滤即够)。
      // [T-332 S2] 号维度:经 source 端 knowledge_items.account_id strict 收窄。
      const rows = await db
        .select({ relation: knowledgeRelations })
        .from(knowledgeRelations)
        .innerJoin(
          knowledgeItems,
          eq(knowledgeItems.id, knowledgeRelations.sourceKnowledgeId),
        )
        .where(
          and(
            eq(knowledgeItems.userId, userId),
            accountVisibility(accountId),
          ),
        );
      return rows.map((r) => parseRelation(r.relation));
    },

    async listBackflowedSignalExternalIds(userId, accountId) {
      // [T-092] 幂等反查:active + origin='comment_backflow' 的行,聚合
      // sourceMetadata.signalExternalIds(jsonb 内数组;行数量级几百,内存收集)。
      const rows = await db
        .select({ sourceMetadata: knowledgeItems.sourceMetadata })
        .from(knowledgeItems)
        .where(
          and(
            eq(knowledgeItems.userId, userId),
            // [T-332 S2] strict:回流锚幂等集也按号隔离(A 号回流过的评论,B 号可再回流)。
            accountVisibility(accountId),
            eq(knowledgeItems.status, "active"),
            sql`${knowledgeItems.sourceMetadata} ->> 'origin' = 'comment_backflow'`,
          ),
        );
      const set = new Set<string>();
      for (const row of rows) {
        const meta = (row.sourceMetadata ?? {}) as Record<string, unknown>;
        const ids = meta.signalExternalIds;
        if (!Array.isArray(ids)) continue;
        for (const id of ids) {
          if (typeof id === "string" && id.trim() !== "") set.add(id);
        }
      }
      return set;
    },

    async create(userId, accountId, input) {
      const now = deps.now();
      const itemId = deps.nextId("knowledge");
      const revId = deps.nextId("revision");

      // Insert the item first with currentRevisionId already pointing at the
      // about-to-be-inserted revision #1 (UoW: item + revision #1 atomically).
      await db.insert(knowledgeItems).values({
        id: itemId,
        userId,
        // [T-332 S2] 号维度盖章(service 已断言非空;列 NOT NULL,ISO-01/03)。
        accountId,
        currentRevisionId: revId,
        folderId: input.folderId ?? null,
        assetId: input.assetId ?? null,
        knowledgeType: input.knowledgeType ?? "note",
        title: input.title,
        // [T-092] 评论回流可声明 sourceType='import' + 溯源/幂等锚 metadata;
        // 缺省与旧行为一致(manual + {})。
        sourceType: input.sourceType ?? "manual",
        sourceUrl: null,
        sourceMetadata: input.sourceMetadata ?? {},
        status: "active",
        archivedAt: null,
        // [T-079a] 出处一等公民:create 透传,缺省 NULL。
        sourceNote: input.sourceNote ?? null,
        createdAt: now,
        updatedAt: now,
      });
      await db.insert(knowledgeRevisions).values({
        id: revId,
        knowledgeItemId: itemId,
        revisionNumber: 1,
        content: input.content ?? "",
        structuredData: {},
        createdAt: now,
      });
      return get(userId, accountId, itemId);
    },

    async createRevision(userId, accountId, knowledgeId, input) {
      // Ownership gate: a cross-user / 跨号 / unknown id throws before any write.
      await getRow(userId, accountId, knowledgeId);

      // Allocate the next revision number (max+1, starting at 1). Append-only:
      // we never UPDATE/DELETE an existing revision.
      const existing = await db
        .select()
        .from(knowledgeRevisions)
        .where(eq(knowledgeRevisions.knowledgeItemId, knowledgeId))
        .orderBy(desc(knowledgeRevisions.revisionNumber));
      const nextNumber = (existing[0]?.revisionNumber ?? 0) + 1;

      const now = deps.now();
      const revId = deps.nextId("revision");
      await db.insert(knowledgeRevisions).values({
        id: revId,
        knowledgeItemId: knowledgeId,
        revisionNumber: nextNumber,
        content: input.content,
        structuredData: {},
        createdAt: now,
      });
      // Repoint the item's currentRevisionId + bump updatedAt (the item itself is
      // re-stamped; the prior revision rows are untouched).
      await db
        .update(knowledgeItems)
        .set({ currentRevisionId: revId, updatedAt: now })
        .where(
          and(
            eq(knowledgeItems.id, knowledgeId),
            eq(knowledgeItems.userId, userId),
          ),
        );
      const rows = await db
        .select()
        .from(knowledgeRevisions)
        .where(eq(knowledgeRevisions.id, revId));
      return rows[0]!;
    },

    async updateSourceMetadata(
      userId,
      accountId,
      knowledgeId,
      sourceMetadata,
    ) {
      await getRow(userId, accountId, knowledgeId);
      const now = deps.now();
      await db
        .update(knowledgeItems)
        .set({ sourceMetadata, updatedAt: now })
        .where(
          and(
            eq(knowledgeItems.id, knowledgeId),
            eq(knowledgeItems.userId, userId),
            accountVisibility(accountId),
          ),
        );
      return get(userId, accountId, knowledgeId);
    },

    async createRelation(userId, accountId, sourceKnowledgeId, input) {
      // Reject a self-link before touching ownership (cheap guard first).
      if (sourceKnowledgeId === input.targetKnowledgeId) {
        throw new ConflictError("Cannot link a knowledge item to itself");
      }
      // Both ends must be owned (cross-user / 跨号 link → OwnershipError, no leak).
      await getRow(userId, accountId, sourceKnowledgeId);
      await getRow(userId, accountId, input.targetKnowledgeId);

      // [T-091] 幂等兜底:同向同类型边已存在 → 返回既有边,不重插(AI 候选门
      // 重复采纳同一对不产生重复行,SPEC §1.3)。
      const existing = await db
        .select()
        .from(knowledgeRelations)
        .where(
          and(
            eq(knowledgeRelations.sourceKnowledgeId, sourceKnowledgeId),
            eq(knowledgeRelations.targetKnowledgeId, input.targetKnowledgeId),
            eq(knowledgeRelations.relationType, input.relationType),
          ),
        );
      if (existing[0]) return parseRelation(existing[0]);

      const relId = deps.nextId("relation");
      await db.insert(knowledgeRelations).values({
        id: relId,
        sourceKnowledgeId,
        targetKnowledgeId: input.targetKnowledgeId,
        relationType: input.relationType,
        strength: "1",
        // [T-091] AI 建边 provenance(确认门采纳时 'ai');缺省 'user'。
        createdByType: input.createdByType ?? "user",
      });
      const rows = await db
        .select()
        .from(knowledgeRelations)
        .where(eq(knowledgeRelations.id, relId));
      return parseRelation(rows[0]!);
    },

    async archive(userId, accountId, knowledgeId) {
      // Ownership gate (cross-user / 跨号 / unknown id → 404, no leak). The §12-style
      // status transition (active → archived) is enforced by the SERVICE; the
      // repo only stamps the new status + archivedAt + updatedAt. Re-read scoped
      // so a cross-user update surfaces as a no-op (WHERE matched 0 rows).
      await getRow(userId, accountId, knowledgeId);
      const now = deps.now();
      await db
        .update(knowledgeItems)
        .set({ status: "archived", archivedAt: now, updatedAt: now })
        .where(
          and(
            eq(knowledgeItems.id, knowledgeId),
            eq(knowledgeItems.userId, userId),
          ),
        );
      return get(userId, accountId, knowledgeId);
    },

    async renameTitle(userId, accountId, knowledgeId, title) {
      // [T-211] Ownership gate (cross-user / 跨号 / unknown id → 404, no leak),
      // then scoped title update. WHERE 收窄 id + userId,跨用户更新 = no-op(0 行)。
      // 只改 title + updatedAt(不动 content/revision/status/archivedAt)。
      await getRow(userId, accountId, knowledgeId);
      const now = deps.now();
      await db
        .update(knowledgeItems)
        .set({ title, updatedAt: now })
        .where(
          and(
            eq(knowledgeItems.id, knowledgeId),
            eq(knowledgeItems.userId, userId),
          ),
        );
      return get(userId, accountId, knowledgeId);
    },

    async removeRelation(userId, accountId, sourceKnowledgeId, input) {
      // Ownership gate on the source item (the only end we need to own to drop
      // an outgoing relation; cross-user / 跨号 / unknown id → 404, no leak).
      await getRow(userId, accountId, sourceKnowledgeId);
      // Capture the row we're about to delete so the op can echo the removed
      // relation back (mirrors the create op's return shape). A missing relation
      // is a 404 (OwnershipError) — never reveal whether it ever existed.
      const existing = await db
        .select()
        .from(knowledgeRelations)
        .where(
          and(
            eq(knowledgeRelations.sourceKnowledgeId, sourceKnowledgeId),
            eq(knowledgeRelations.targetKnowledgeId, input.targetKnowledgeId),
            eq(knowledgeRelations.relationType, input.relationType),
          ),
        );
      const row = existing[0];
      if (!row) throw new OwnershipError("Relation not found");
      await db
        .delete(knowledgeRelations)
        .where(eq(knowledgeRelations.id, row.id));
      return parseRelation(row);
    },

    async listAllAccountsSystem(userId) {
      // [T-332 S2 · ISO-06 例外口] 组合根种子巡检专用:user 级全量读(跨号,无
      // account 过滤)。显式命名区别于业务 list——非隐式全量退化;经 ctx 的业务
      // 路径一律走 list(userId, accountId) strict 门。
      const rows = await db
        .select()
        .from(knowledgeItems)
        .where(eq(knowledgeItems.userId, userId))
        .orderBy(asc(knowledgeItems.createdAt));
      return attachStats(userId, rows);
    },

    async renameTitleSystem(userId, knowledgeId, title) {
      // [T-332 S2 · ISO-06 例外口] 组合根种子巡检专用:user 级门(跨号可改 seed
      // 条目标题)。WHERE 收窄 id + userId,跨用户 = 404;只改 title + updatedAt。
      const rows = await db
        .select()
        .from(knowledgeItems)
        .where(
          and(
            eq(knowledgeItems.id, knowledgeId),
            eq(knowledgeItems.userId, userId),
          ),
        );
      if (!rows[0]) throw new OwnershipError("Knowledge item not found");
      const now = deps.now();
      await db
        .update(knowledgeItems)
        .set({ title, updatedAt: now })
        .where(
          and(
            eq(knowledgeItems.id, knowledgeId),
            eq(knowledgeItems.userId, userId),
          ),
        );
      const after = await db
        .select()
        .from(knowledgeItems)
        .where(
          and(
            eq(knowledgeItems.id, knowledgeId),
            eq(knowledgeItems.userId, userId),
          ),
        );
      const [withStats] = await attachStats(userId, [after[0]!]);
      return withStats!;
    },
  };
}
