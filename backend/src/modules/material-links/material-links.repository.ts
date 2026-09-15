import { and, count, desc, eq, isNull, type Db } from "@creatoros/backend";
import { materialLinks } from "./material-links.db-schema";
import { OwnershipError } from "./material-links.errors";

// MaterialLink repository (foundation §5.2) — user-scoped queries ONLY. `userId` is
// baked into deps (mirrors the platform-account repo): EVERY query filters
// `eq(materialLinks.userId, deps.userId)` and EVERY insert stamps
// `userId: deps.userId`. `delete` selects ownership-scoped first and throws
// OwnershipError when the scoped row is missing — never revealing cross-user existence
// (foundation §2: 404 not 403).

export type MaterialLinkRow = typeof materialLinks.$inferSelect;

export interface RepoDeps {
  now: () => string; // ISO-8601 clock (injected for deterministic tests)
  nextId: (prefix: string) => string; // id generator (deterministic in tests)
  userId: string; // the ownership boundary, baked in at construction
}

export interface CreateMaterialLinkInput {
  projectId: string;
  contentOutputId?: string | null;
  entityType: "knowledge" | "asset";
  entityId: string;
  role?: string;
  stage?: string;
  addedByType?: string;
  // [T-146 切片 b] 项目内优先级('high' | 'normal')。缺省 → repo DEFAULT 'normal';
  // 派生(user→high / ai→normal)由 SERVICE 层算好后显式传入(repo 不派生,只落值)。
  priority?: string;
}

export interface ListMaterialLinksQuery {
  limit?: number;
  offset?: number;
}

export interface MaterialLinkRepository {
  // Fixture hydration (insert with explicit user_id already on the row).
  seedLinks(rows: MaterialLinkRow[]): Promise<void>;

  // [T-060③b] projectId 传 null = 该用户全量 links(素材中心按项目分组的反查读)。
  list(
    projectId: string | null,
    query: ListMaterialLinksQuery,
  ): Promise<{ rows: MaterialLinkRow[]; total: number }>;
  create(input: CreateMaterialLinkInput): Promise<MaterialLinkRow>;
  delete(linkId: string): Promise<MaterialLinkRow>;
}

export function createMaterialLinkRepository(
  db: Db,
  deps: RepoDeps,
): MaterialLinkRepository {
  return {
    async seedLinks(rows) {
      if (rows.length === 0) return;
      await db.insert(materialLinks).values(rows).onConflictDoNothing();
    },

    async list(projectId, { limit = 100, offset = 0 }) {
      const where = projectId
        ? and(
            eq(materialLinks.userId, deps.userId),
            eq(materialLinks.projectId, projectId),
          )
        : eq(materialLinks.userId, deps.userId);
      const rows = await db
        .select()
        .from(materialLinks)
        .where(where)
        .orderBy(desc(materialLinks.createdAt), desc(materialLinks.id))
        .limit(limit)
        .offset(offset);
      const totals = await db
        .select({ total: count() })
        .from(materialLinks)
        .where(where);
      return { rows, total: totals[0]?.total ?? 0 };
    },

    async create(input) {
      // [T-813] 保存重试幂等：响应丢失/刷新后再次保存同一项目素材时返回既有边，
      // 不让一份正文在长期上下文里重复出现。
      const role = input.role ?? "reference";
      const stage = input.stage ?? "research";
      const existing = await db
        .select()
        .from(materialLinks)
        .where(
          and(
            eq(materialLinks.userId, deps.userId),
            eq(materialLinks.projectId, input.projectId),
            input.contentOutputId
              ? eq(materialLinks.contentOutputId, input.contentOutputId)
              : isNull(materialLinks.contentOutputId),
            eq(materialLinks.entityType, input.entityType),
            eq(materialLinks.entityId, input.entityId),
            eq(materialLinks.role, role),
            eq(materialLinks.stage, stage),
          ),
        )
        .limit(1);
      if (existing[0]) return existing[0];
      const inserted = await db
        .insert(materialLinks)
        .values({
          id: deps.nextId("matlink"),
          userId: deps.userId,
          projectId: input.projectId,
          contentOutputId: input.contentOutputId ?? null,
          entityType: input.entityType,
          entityId: input.entityId,
          role,
          stage,
          addedByType: input.addedByType ?? "user",
          priority: input.priority ?? "normal",
          createdAt: deps.now(),
        })
        .returning();
      return inserted[0]!;
    },

    async delete(linkId) {
      // Ownership gate: a cross-user / unknown id selects empty → OwnershipError (404),
      // never leaking that the row exists for another user.
      const rows = await db
        .select()
        .from(materialLinks)
        .where(
          and(
            eq(materialLinks.userId, deps.userId),
            eq(materialLinks.id, linkId),
          ),
        );
      const row = rows[0];
      if (!row) {
        throw new OwnershipError(
          `OwnershipError: material link not found: ${linkId}`,
        );
      }
      await db
        .delete(materialLinks)
        .where(
          and(
            eq(materialLinks.userId, deps.userId),
            eq(materialLinks.id, linkId),
          ),
        );
      return row;
    },
  };
}
