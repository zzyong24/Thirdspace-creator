import {factFilter} from "../../workspace-scope";
import {requireAccountId} from "../../errors";
import { and, desc, eq, inArray, isNull, or, sql, type Db } from "@creatoros/backend";
import { publications, publicationRevisions } from "./publishing.db-schema";
import { ConflictError, OwnershipError } from "./publishing.errors";

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

export type PublicationRow = Omit<typeof publications.$inferSelect,"groupId"|"groupVersion"|"membershipVersion"> & {groupId?:string|null;groupVersion?:number|null;membershipVersion?:number|null};
export type PublicationRevisionRow = typeof publicationRevisions.$inferSelect;

export interface RepoDeps {
  now: () => string; // ISO-8601 clock (injected for deterministic tests)
  nextId: (prefix: string) => string; // id generator (deterministic in tests)
  userId: string; // owner — baked in; the service mints one repo per ctx
  // [T-332 S2] 第二属主维度(按号,strict)。必填:service 层经 requireAccountId 断言
  //   ctx.accountId 后注入(未选号 → AccountRequiredError,引导态,不再有「null = 全量」
  //   退化)。写路径 create 一律 stamp 本号;读路径(列表/聚合/by-id)一律
  //   eq(account_id, deps.accountId) —— 无任何 OR-IS-NULL lenient 分支(用户拍板 ②:
  //   清库重来,不存在待兼容的存量 NULL 行)。唯一例外是 findByExternalKey(见其注释)。
  accountId: string|null;
  groupId?: string|null;
  groupVersion?: number|null;
  membershipVersion?: number|null;
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
  // [B-02] 原子补铸的 revision-1 标题(缺省空,与 register/createPublication 的 auto-mint
  //   同语义)。register 登记时把用户项目标题带进 revision-1;日拉导入不传 → 空(标题走
  //   content_output 回退链)。
  title?: string;
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
  /**
   * 当前联合归属下，批量读取指定 output 的发布事实。T-595 后可见性已在
   * 采集边界归一，本窄读不再接受或实现第二份 visibility 条件。
   */
  listPublishedInWindow(window: {start: string; end: string}): Promise<PublicationRow[]>;
  listPublicationsByOutputs(
    outputIds: ReadonlyArray<string>,
  ): Promise<PublicationRow[]>;
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
    expectedRevisionId?: string | null,
  ): Promise<PublicationRow>;
  getCurrentRevision(
    publicationId: string,
  ): Promise<PublicationRevisionRow | null>;
  listCurrentRevisionSummariesByPublicationIds(
    publicationIds: ReadonlyArray<string>,
  ): Promise<
    Array<{
      publicationId: string;
      revisionId: string;
      title: string;
      coverAssetId: string | null;
    }>
  >;
  listRevisions(
    publicationId: string,
    page: { limit: number; offset: number },
  ): Promise<PublicationRevisionRow[]>;
  updatePublicationStatus(
    publicationId: string,
    patch: UpdateStatusPatch,
  ): Promise<PublicationRow>;
  listCollectedExternalIds(platform:string):Promise<string[]>;
  findCollectedByExternalKey(platform: string, externalId: string): Promise<PublicationRow | null>;
  findByExternalKey(
    platform: string,
    externalId: string,
  ): Promise<PublicationRow | null>;
  // [T-323] 重锚:把一条 publication 的 content_output_id 改到另一个 output(user-scoped)。
  //   只动 content_output_id + updated_at —— 绝不碰 status / external_id / hidden_at
  //   (重锚不改作品的发布事实与可见性,只换属主 output)。register 命中「imported 空壳占用
  //   的作品」时让位给用户手动项目的 output 用。返回更新后的 PublicationRow。
  reAnchorPublicationOutput(
    publicationId: string,
    newOutputId: string,
  ): Promise<PublicationRow>;
  // [T-073] 平台侧可见性:置/清 hidden_at(非空 = 抖音端「仅自己可见/已隐藏」)。
  // 只动 hidden_at + updated_at,不碰 status 状态机(hidden 与生命周期正交)。
  setHiddenAt(
    publicationId: string,
    hiddenAt: string | null,
  ): Promise<PublicationRow>;
  // [T-033] 平台侧审核状态同步(detail 导出「审核状态」列 → publication.platformStatus)。
  // 只动 platform_status + updated_at,不碰 hidden_at(两者正交,各管各的)。
  setPlatformStatus(
    publicationId: string,
    platformStatus: string | null,
  ): Promise<PublicationRow>;
  // [T-078] 封面回填候选:该平台已发布、带 external_id(可拼 iesdouyin 分享页)、
  // 未隐藏(隐藏作品分享页多半 404,别每轮浪费限流预算)、且**当前 revision 没有
  // coverAssetId**(或压根没有 revision —— 导入作品故意无 revision)的 publications。
  // 按真实发布时刻倒序(新作品优先补)。幂等的根:已有封面的不再回来。
  listMissingCoverPublications(
    platform: string,
    limit: number,
    includeExisting?: boolean,
    offset?: number,
  ): Promise<Array<PublicationRow & { coverAssetId?: string | null }>>;
}

export function createPublishingRepository(
  db: Db,
  deps: RepoDeps,
): PublishingRepository {
  const userId = deps.userId;
  // [T-332 S2] 按号隔离条件门(strict,SPEC §4.1)。语义 = eq(account_id, 当前号):
  //   切号 = 切工作区,另一个号的行在本 ctx 下一律不可见 —— 旧 lenient
  //   「当前号 OR account_id IS NULL」分支已随用户拍板 ②(清库重来,无存量 NULL 行)
  //   退役,不存在「未选号 → 全量」退化(service 层 requireAccountId 已挡住无号 ctx)。
  //   · by-id 读(getPublicationRowById)同样上号门(SPEC §4.5:strict 列表 + user 级
  //     详情会留下「列表看不见但 URL 能打开」的裂缝;跨号命中 → OwnershipError 404,
  //     与跨 user 同语义,不泄漏存在性)。
  //   · **唯一例外 findByExternalKey**(C-09 裁决):(platform, external_id) 是平台事实
  //     唯一锚,查询保持 user 级(加号过滤会让跨号行不可见 → 重复 INSERT 炸唯一索引、
  //     破幂等);命中后断言归属号与 ctx 一致,不一致按数据 bug 报错,绝不静默返回。
  const accountGate = factFilter(publications, deps);

  // Private ownership gate — a cross-user / unknown id is indistinguishable from a
  // missing one (foundation §2: 404, never reveal existence) → OwnershipError.
  // [T-332 S2] 叠加号一致性门(SPEC §4.5):跨号 by-id 与跨 user 同为 404。
  async function getPublicationRowById(
    publicationId: string,
  ): Promise<PublicationRow> {
    const rows = await db
      .select()
      .from(publications)
      .where(
        and(
          eq(publications.id, publicationId),
          eq(publications.userId, userId),
          accountGate,
        ),
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
        // [T-332 S2] 按号 stamp(strict:deps.accountId 必填,发布草稿出生即归当前号)。
        accountId: requireAccountId(deps.accountId,"publication target"),
        groupId: deps.groupId ?? null,
        groupVersion: deps.groupVersion ?? null,
        membershipVersion: deps.membershipVersion ?? null,
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
      // 数据底座(SPEC §1.3):直接落 published + external_id=aweme_id,publishedAt 用真实
      //   发布时刻(缺则 now)。
      // [B-02] 在同一事务里原子补铸 revision-1(title 缺省空)并把 current_revision_id 指向它
      //   —— contract 的 currentRevisionId 是非空 id(z.string().min(1)),旧实现落 null 后被
      //   transport 用 "" 占位伪装,会让 client 的 Zod parse 整体失败(日拉一条作品即毒化
      //   publication list/detail 响应)。原子建 revision 使 currentRevisionId 恒为真实 id,
      //   与 createPublication 的 auto-mint、register 的补铸同语义。
      const now = deps.now();
      const pubId = deps.nextId("pub");
      const revId = deps.nextId("rev");
      await db.transaction(async (tx) => {
        await tx.insert(publications).values({
          id: pubId,
          userId,
          // [T-332 S2] 采集 stamp:导入作品出生即归当前号(strict,deps.accountId 必填)。
          accountId: requireAccountId(deps.accountId,"publication target"),
        groupId: deps.groupId ?? null,
        groupVersion: deps.groupVersion ?? null,
        membershipVersion: deps.membershipVersion ?? null,
          contentOutputId: outputId,
          platform: input.platform,
          accountReference: input.accountReference,
          status: "published",
          currentRevisionId: revId, // 原子指向下面同事务铸出的 revision-1
          externalId: input.externalId,
          externalUrl: input.externalUrl ?? null,
          scheduledAt: null,
          publishedAt: input.publishedAt ?? now,
          removedAt: null,
          createdAt: now,
          updatedAt: now,
        });
        await tx.insert(publicationRevisions).values({
          id: revId,
          userId,
          publicationId: pubId,
          revisionNumber: 1,
          title: input.title ?? "",
          description: "",
          coverAssetId: null,
          category: "",
          series: "",
          platformTags: [],
          platformSettings: {},
          createdAt: now,
        });
      });
      return getPublicationRowById(pubId);
    },

    async listPublicationsByOutput(outputId, page) {
      return db
        .select()
        .from(publications)
        .where(
          and(
            eq(publications.userId, userId),
            accountGate, // [T-332 S2] strict 按号门(只见当前号)
            eq(publications.contentOutputId, outputId),
          ),
        )
        .orderBy(desc(publications.createdAt))
        .limit(page.limit)
        .offset(page.offset);
    },

    async listPublicationsForUser(page) {
      return db
        .select()
        .from(publications)
        .where(
          and(
            eq(publications.userId, userId),
            accountGate, // [T-332 S2] 发布列表/最近发布 strict 按号隔离
          ),
        )
        .orderBy(
          desc(sql`coalesce(${publications.publishedAt}, ${publications.createdAt})`),
        )
        .limit(page.limit)
        .offset(page.offset);
    },

    async listPublishedInWindow(window) {
      // SEMANTIC_BOUNDARY_ALLOW: 时间窗与归属过滤，不做选题或效果判断。
      return db.select().from(publications).where(and(
        eq(publications.userId, userId), accountGate,
        eq(publications.status, "published"), isNull(publications.hiddenAt), isNull(publications.removedAt),
        sql`${publications.publishedAt}::timestamptz >= ${window.start}::timestamptz`,
        sql`${publications.publishedAt}::timestamptz < ${window.end}::timestamptz`,
      )).orderBy(desc(sql`${publications.publishedAt}::timestamptz`));
    },

    async listPublicationsByOutputs(outputIds) {
      if (outputIds.length === 0) return [];
      return db
        .select()
        .from(publications)
        .where(
          and(
            eq(publications.userId, userId),
            accountGate,
            inArray(publications.contentOutputId, [...outputIds]),
          ),
        );
    },

    async listPublicationIdsByOutputs(outputIds) {
      if (outputIds.length === 0) return [];
      const rows = await db
        .select({ id: publications.id })
        .from(publications)
        .where(
          and(
            eq(publications.userId, userId),
            accountGate, // [T-332 S2] 项目→发布解析 strict 按号(Analytics 项目读随之隔离)
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

    async setCurrentRevision(publicationId, revisionId, expectedRevisionId) {
      await getPublicationRowById(publicationId); // ownership gate
      const changed = await db
        .update(publications)
        .set({ currentRevisionId: revisionId, updatedAt: deps.now() })
        .where(
          and(
            eq(publications.id, publicationId),
            eq(publications.userId, userId),
            accountGate,
            expectedRevisionId === undefined ? undefined : expectedRevisionId === null ? isNull(publications.currentRevisionId) : eq(publications.currentRevisionId, expectedRevisionId),
          ),
        ).returning({ id: publications.id });
      if (!changed.length) throw new ConflictError("封面更新期间作品版本已变化，请重新读取后重试");
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

    async listCurrentRevisionSummariesByPublicationIds(publicationIds) {
      if (publicationIds.length === 0) return [];
      return db
        .select({
          publicationId: publications.id,
          revisionId: publicationRevisions.id,
          title: publicationRevisions.title,
          coverAssetId: publicationRevisions.coverAssetId,
        })
        .from(publications)
        .innerJoin(
          publicationRevisions,
          eq(publications.currentRevisionId, publicationRevisions.id),
        )
        .where(
          and(
            eq(publications.userId, deps.userId),
            factFilter(publications, deps),
            inArray(publications.id, [...publicationIds]),
          ),
        );
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

    async setHiddenAt(publicationId, hiddenAt) {
      await getPublicationRowById(publicationId); // ownership gate
      await db
        .update(publications)
        .set({ hiddenAt, updatedAt: deps.now() })
        .where(
          and(
            eq(publications.id, publicationId),
            eq(publications.userId, userId),
          ),
        );
      return getPublicationRowById(publicationId);
    },

    async setPlatformStatus(publicationId, platformStatus) {
      await getPublicationRowById(publicationId); // ownership gate
      await db
        .update(publications)
        .set({ platformStatus, updatedAt: deps.now() })
        .where(
          and(
            eq(publications.id, publicationId),
            eq(publications.userId, userId),
          ),
        );
      return getPublicationRowById(publicationId);
    },

    async listMissingCoverPublications(platform, limit, includeExisting = false, offset = 0) {
      // [T-078] left join 当前 revision:currentRevisionId 为 null(导入作品)或
      // 该 revision 的 cover_asset_id 为 null 都算「缺封面」。join 键是本用户行上的
      // currentRevisionId,天然 user-scoped(revision 表不需再过滤 userId)。
      const rows = await db
        .select({ pub: publications, coverAssetId: publicationRevisions.coverAssetId })
        .from(publications)
        .leftJoin(
          publicationRevisions,
          eq(publications.currentRevisionId, publicationRevisions.id),
        )
        .where(
          and(
            eq(publications.userId, userId),
            accountGate, // [T-332 S2] 封面回填候选 strict 按号(别烧别号的限流预算)
            eq(publications.platform, platform),
            eq(publications.status, "published"),
            sql`${publications.externalId} is not null`,
            includeExisting ? undefined : or(
              isNull(publications.currentRevisionId),
              isNull(publicationRevisions.coverAssetId),
            ),
          ),
        )
        .orderBy(
          desc(
            sql`coalesce(${publications.publishedAt}, ${publications.createdAt})`,
          ),
          desc(publications.id),
        )
        .limit(limit).offset(offset);
      return rows.map((r) => ({...r.pub, coverAssetId: r.coverAssetId}));
    },

    async listCollectedExternalIds(platform){
      const rows=await db.select({externalId:publications.externalId}).from(publications).where(and(eq(publications.userId,userId),eq(publications.accountId,requireAccountId(deps.accountId,"verified collection account")),eq(publications.platform,platform),eq(publications.status,"published")));
      return rows.flatMap(row=>row.externalId?[row.externalId]:[]);
    },
    async findCollectedByExternalKey(platform, externalId) {
      const rows=await db.select().from(publications).where(and(eq(publications.userId,userId),eq(publications.accountId,requireAccountId(deps.accountId,"verified collection account")),eq(publications.platform,platform),eq(publications.externalId,externalId)));
      return rows[0]??null;
    },
    async findByExternalKey(platform, externalId) {
      const rows=await db.select().from(publications).where(and(eq(publications.userId,userId),eq(publications.platform,platform),eq(publications.externalId,externalId)));
      const row=rows[0]??null;
      if(!row)return null;
      if((deps.groupId && row.groupId!==deps.groupId)||(deps.accountId && row.accountId!==deps.accountId))throw new OwnershipError("发布记录不属于当前工作区");
      return getPublicationRowById(row.id);
    },

    async reAnchorPublicationOutput(publicationId, newOutputId) {
      // [T-323] ownership gate 后只 UPDATE content_output_id(+ updated_at)。不动
      //   status / external_id / hidden_at —— 换锚不改发布事实与可见性。
      await getPublicationRowById(publicationId);
      await db
        .update(publications)
        .set({ contentOutputId: newOutputId, updatedAt: deps.now() })
        .where(
          and(
            eq(publications.id, publicationId),
            eq(publications.userId, userId),
          ),
        );
      return getPublicationRowById(publicationId);
    },
  };
}
