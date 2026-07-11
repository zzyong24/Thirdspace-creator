import type { RequestContext } from "@creatoros/contract";
import type { Db } from "@creatoros/backend";
import {
  createTopicAttributionRepository,
  type TopicAttributionRepository,
  type RepoDeps,
  type CreateTopicAttributionInput,
} from "./topic-attribution.repository";
import {
  toTopicAttributionDto,
  type TopicAttributionResource,
} from "./topic-attribution.schema";

// [T-235d] TopicAttribution service(foundation §5.3,照 trend-sources 先例)—— 每个公开方法
// (ctx, …),构 repo bound to ctx.userId 使 scoping 结构化。account_id 从 ctx.accountId stamp。
// 薄层:读侧 list(契约 op topics.attributions.list)+ runner 写侧(hasAttribution 幂等锚 +
// saveAttribution upsert)。[gate-F1]:零 learnings 依赖 —— 选题维度资产独立沉淀。

export interface ServiceDeps {
  db: Db;
  now: () => string;
  nextId: (prefix: string) => string;
}

/** runner 写侧入参(accountId 由 service 从 ctx stamp,不在这里传)。 */
export type SaveTopicAttributionInput = Omit<
  CreateTopicAttributionInput,
  "accountId"
>;

export interface TopicAttributionService {
  listAttributions(
    ctx: RequestContext,
    query: { page: number; pageSize: number; publicationId?: string },
  ): Promise<{ rows: TopicAttributionResource[]; total: number }>;
  /** 幂等锚:该发布作品是否已有归因(runner skip 判据)。 */
  hasAttribution(ctx: RequestContext, publicationId: string): Promise<boolean>;
  /** 归因落库(upsert:同作品重跑覆盖更新)。返回 DTO(含 id,供实验候选 card.attributionId 溯源)。 */
  saveAttribution(
    ctx: RequestContext,
    input: SaveTopicAttributionInput,
  ): Promise<TopicAttributionResource>;
}

export function createTopicAttributionService(
  deps: ServiceDeps,
): TopicAttributionService {
  const { db, now, nextId } = deps;

  function repoFor(ctx: RequestContext): TopicAttributionRepository {
    const repoDeps: RepoDeps = { now, nextId, userId: ctx.userId };
    return createTopicAttributionRepository(db, repoDeps);
  }

  return {
    async listAttributions(ctx, query) {
      const { rows, total } = await repoFor(ctx).listAttributions(
        ctx.accountId ?? null,
        {
          limit: query.pageSize,
          offset: (query.page - 1) * query.pageSize,
          publicationId: query.publicationId,
        },
      );
      return { rows: rows.map(toTopicAttributionDto), total };
    },

    async hasAttribution(ctx, publicationId) {
      return repoFor(ctx).hasAttribution(publicationId);
    },

    async saveAttribution(ctx, input) {
      const row = await repoFor(ctx).createAttribution({
        ...input,
        accountId: ctx.accountId ?? null,
      });
      return toTopicAttributionDto(row);
    },
  };
}
