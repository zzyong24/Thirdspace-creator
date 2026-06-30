import { and, desc, eq, inArray, sql, type Db } from "@creatoros/backend";
import { publications, publicationRevisions } from "./publishing.db-schema";
import { OwnershipError } from "./publishing.errors";

// Publishing repository (foundation §5.2) — user-scoped queries ONLY. `user_id`
// lives on EVERY owned row; every read/write filters `eq(table.userId,
// deps.userId)` and every insert stamps `userId: deps.userId`. The revision child
// is additionally gated through the parent publication's ownership check, so it is
// never reachable cross-user (foundation §2, SPEC §14: cross-user → OwnershipError
// 404, never reveal existence).
//
// `userId` is baked into `deps` (one repo instance per ctx) — the service builds a
// fresh repo per request via `repoFor(ctx)`. The clock/id generator are injected
// for deterministic tests. The §12 status machine + idempotency guard live in the
// SERVICE; the repository only executes service-approved updates and is the
// append-only writer for revisions (never UPDATE a revision row).

export type PublicationRow = typeof publications.$inferSelect;
export type PublicationRevisionRow = typeof publicationRevisions.$inferSelect;

export interface RepoDeps {
  now: () => string; // ISO-8601 clock (injected for deterministic tests)
  nextId: (prefix: string) => string; // id generator (deterministic in tests)
  userId: string; // owner — baked in; the service mints one repo per ctx
}

export interface CreatePublicationInput {
  platform: string;
  accountReference: string;
}

// 数据底座(SPEC §1.3):导入一条真实已发布作品对应的 publication —— 直接落
// status='published' 且带 external_id=aweme_id(ingestion 的 resolvePublication
// 据此命中,metrics 才能挂上去)。区别于常规 createPublication(draft 起、external_id
// 由 platform publish 回填):导入作品已是平台事实,无需再走 publish 副作用。
export interface CreateImportedPublicationInput {
  platform: string;
  accountReference: string;
  externalId: string;
  externalUrl?: string | null;
  publishedAt?: string | null;
}

export interface CreateRevisionInput {
  title: string;
  description: string;
  coverAssetId?: string | null;
  category?: string;
  series?: string;
  platformTags?: string[];
  platformSettings?: Record<string, unknown>;
}

export interface UpdateStatusPatch {
  status: string;
  externalId?: string | null;
  externalUrl?: string | null;
  scheduledAt?: string | null;
  publishedAt?: string | null;
  removedAt?: string | null;
}

export interface PublishingRepository {
  seedPublications(rows: PublicationRow[]): Promise<void>;
  seedRevisions(rows: PublicationRevisionRow[]): Promise<void>;
  createPublication(
    outputId: string,
    input: CreatePublicationInput,
  ): Promise<PublicationRow>;
  // 数据底座(SPEC §1.3):落一条已发布 publication(external_id 直填),不走 publish 副作用。
  createImportedPublication(
    outputId: string,
    input: CreateImportedPublicationInput,
  ): Promise<PublicationRow>;
  listPublicationsByOutput(
    outputId: string,
    page: { limit: number; offset: number },
  ): Promise<PublicationRow[]>;
  listPublicationsForUser(page: {
    limit: number;
    offset: number;
  }): Promise<PublicationRow[]>;
  // User-scoped publication ids for a set of ContentOutput ids (Analytics project
  // read resolves project→outputs→publications without an Analytics cross-module
  // join). Empty input → empty list.
  listPublicationIdsByOutputs(outputIds: ReadonlyArray<string>): Promise<string[]>;
  getPublication(publicationId: string): Promise<PublicationRow>;
  createRevision(
    publicationId: string,
    input: CreateRevisionInput,
  ): Promise<PublicationRevisionRow>;
  setCurrentRevision(
    publicationId: string,
    revisionId: string,
  ): Promise<PublicationRow>;
  getCurrentRevision(
    publicationId: string,
  ): Promise<PublicationRevisionRow | null>;
  listRevisions(
    publicationId: string,
    page: { limit: number; offset: number },
  ): Promise<PublicationRevisionRow[]>;
  updatePublicationStatus(
    publicationId: string,
    patch: UpdateStatusPatch,
  ): Promise<PublicationRow>;
  findByExternalKey(
    platform: string,
    externalId: string,
  ): Promise<PublicationRow | null>;
}

export function createPublishingRepository(
  db: Db,
  deps: RepoDeps,
): PublishingRepository {
  const userId = deps.userId;

  // Private ownership gate — a cross-user / unknown id is indistinguishable from a
  // missing one (foundation §2: 404, never reveal existence) → OwnershipError.
  async function getPublicationRowById(
    publicationId: string,
  ): Promise<PublicationRow> {
    const rows = await db
      .select()
      .from(publications)
      .where(
        and(eq(publications.id, publicationId), eq(publications.userId, userId)),
      );
    const row = rows[0];
    if (!row) {
      throw new OwnershipError(
        `OwnershipError: publication not found: ${publicationId}`,
      );
    }
    return row;
  }

  return {
    async seedPublications(rows) {
      if (rows.length === 0) return;
      await db.insert(publications).values(rows).onConflictDoNothing();
    },

    async seedRevisions(rows) {
      if (rows.length === 0) return;
      await db.insert(publicationRevisions).values(rows).onConflictDoNothing();
    },

    async createPublication(outputId, input) {
      const now = deps.now();
      const id = deps.nextId("pub");
      await db.insert(publications).values({
        id,
        userId,
        contentOutputId: outputId,
        platform: input.platform,
        accountReference: input.accountReference,
        status: "draft",
        currentRevisionId: null,
        externalId: null,
        externalUrl: null,
        scheduledAt: null,
        publishedAt: null,
        removedAt: null,
        createdAt: now,
        updatedAt: now,
      });
      return getPublicationRowById(id);
    },

    async createImportedPublication(outputId, input) {
      // 数据底座(SPEC §1.3):直接落 published + external_id=aweme_id。无 revision
      //   (导入作品的标题挂在 content_output / project,不强造空 revision)。publishedAt
      //   用真实发布时刻(缺则 now)。
      const now = deps.now();
      const id = deps.nextId("pub");
      await db.insert(publications).values({
        id,
        userId,
        contentOutputId: outputId,
        platform: input.platform,
        accountReference: input.accountReference,
        status: "published",
        currentRevisionId: null,
        externalId: input.externalId,
        externalUrl: input.externalUrl ?? null,
        scheduledAt: null,
        publishedAt: input.publishedAt ?? now,
        removedAt: null,
        createdAt: now,
        updatedAt: now,
      });
      return getPublicationRowById(id);
    },

    async listPublicationsByOutput(outputId, page) {
      return db
        .select()
        .from(publications)
        .where(
          and(
            eq(publications.userId, userId),
            eq(publications.contentOutputId, outputId),
          ),
        )
        .orderBy(desc(publications.createdAt))
        .limit(page.limit)
        .offset(page.offset);
    },

    async listPublicationsForUser(page) {
      // 真机反馈 #1(时间倒序):最近发布 / 待校准列表必须「最新发布在前」。导入的
      //   真实作品 published_at 是真实发布时刻(可空仅对未发布草稿),所以按
      //   COALESCE(published_at, created_at) 倒序 —— 已发布优先用真实发布时刻排序,
      //   未发布草稿回退建档时刻。原 createdAt 倒序对导入历史作品语义错(导入顺序≠发布顺序)。
      return db
        .select()
        .from(publications)
        .where(eq(publications.userId, userId))
        .orderBy(
          desc(sql`coalesce(${publications.publishedAt}, ${publications.createdAt})`),
        )
        .limit(page.limit)
        .offset(page.offset);
    },

    async listPublicationIdsByOutputs(outputIds) {
      if (outputIds.length === 0) return [];
      const rows = await db
        .select({ id: publications.id })
        .from(publications)
        .where(
          and(
            eq(publications.userId, userId),
            inArray(publications.contentOutputId, [...outputIds]),
          ),
        );
      return rows.map((r) => r.id);
    },

    getPublication: getPublicationRowById,

    async createRevision(publicationId, input) {
      // Parent-ownership gate before the write (no cross-user child rows).
      await getPublicationRowById(publicationId);
      // revisionNumber = (max existing for this publication, scoped) + 1.
      const existing = await db
        .select()
        .from(publicationRevisions)
        .where(
          and(
            eq(publicationRevisions.userId, userId),
            eq(publicationRevisions.publicationId, publicationId),
          ),
        )
        .orderBy(desc(publicationRevisions.revisionNumber))
        .limit(1);
      const revisionNumber = (existing[0]?.revisionNumber ?? 0) + 1;
      const id = deps.nextId("rev");
      await db.insert(publicationRevisions).values({
        id,
        userId,
        publicationId,
        revisionNumber,
        title: input.title,
        description: input.description ?? "",
        coverAssetId: input.coverAssetId ?? null,
        category: input.category ?? "",
        series: input.series ?? "",
        platformTags: input.platformTags ?? [],
        platformSettings: input.platformSettings ?? {},
        createdAt: deps.now(),
      });
      const rows = await db
        .select()
        .from(publicationRevisions)
        .where(
          and(
            eq(publicationRevisions.id, id),
            eq(publicationRevisions.userId, userId),
          ),
        );
      return rows[0]!;
    },

    async setCurrentRevision(publicationId, revisionId) {
      await getPublicationRowById(publicationId); // ownership gate
      await db
        .update(publications)
        .set({ currentRevisionId: revisionId, updatedAt: deps.now() })
        .where(
          and(
            eq(publications.id, publicationId),
            eq(publications.userId, userId),
          ),
        );
      return getPublicationRowById(publicationId);
    },

    async getCurrentRevision(publicationId) {
      const pub = await getPublicationRowById(publicationId);
      if (!pub.currentRevisionId) return null;
      const rows = await db
        .select()
        .from(publicationRevisions)
        .where(
          and(
            eq(publicationRevisions.id, pub.currentRevisionId),
            eq(publicationRevisions.userId, userId),
          ),
        );
      return rows[0] ?? null;
    },

    async listRevisions(publicationId, page) {
      await getPublicationRowById(publicationId); // parent-ownership gate
      return db
        .select()
        .from(publicationRevisions)
        .where(
          and(
            eq(publicationRevisions.userId, userId),
            eq(publicationRevisions.publicationId, publicationId),
          ),
        )
        .orderBy(desc(publicationRevisions.revisionNumber))
        .limit(page.limit)
        .offset(page.offset);
    },

    async updatePublicationStatus(publicationId, patch) {
      await getPublicationRowById(publicationId); // ownership gate
      const set: Record<string, unknown> = {
        status: patch.status,
        updatedAt: deps.now(),
      };
      if (patch.externalId !== undefined) set.externalId = patch.externalId;
      if (patch.externalUrl !== undefined) set.externalUrl = patch.externalUrl;
      if (patch.scheduledAt !== undefined) set.scheduledAt = patch.scheduledAt;
      if (patch.publishedAt !== undefined) set.publishedAt = patch.publishedAt;
      if (patch.removedAt !== undefined) set.removedAt = patch.removedAt;
      await db
        .update(publications)
        .set(set)
        .where(
          and(
            eq(publications.id, publicationId),
            eq(publications.userId, userId),
          ),
        );
      return getPublicationRowById(publicationId);
    },

    async findByExternalKey(platform, externalId) {
      const rows = await db
        .select()
        .from(publications)
        .where(
          and(
            eq(publications.userId, userId),
            eq(publications.platform, platform),
            eq(publications.externalId, externalId),
          ),
        );
      return rows[0] ?? null;
    },
  };
}
