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
import { requireAccountId } from "./topic-attribution.errors";

// [T-235d → T-332 S2] TopicAttribution service(foundation §5.3,照 trend-sources 先例)——
// 每个公开方法 (ctx, …),构 repo bound to ctx.userId + ctx.accountId 使 scoping 结构化。
// 每个入口经 requireAccountId 断言:未选号 = 引导态,读写一律 AccountRequiredError(SPEC §4.2)。
// 薄层:读侧 list(契约 op topics.attributions.list)+ runner 写侧(hasAttribution 幂等锚 +
// saveAttribution upsert)。[gate-F1]:零 learnings 依赖 —— 选题维度资产独立沉淀。

export interface ServiceDeps {
  db: Db;
  now: () => string;
  nextId: (prefix: string) => string;
}

/** runner 写侧入参(accountId 由 repo deps stamp,不在这里传,§4.6)。 */
export type SaveTopicAttributionInput = CreateTopicAttributionInput;

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

  function repoFor(ctx: RequestContext, op: string): TopicAttributionRepository {
    const repoDeps: RepoDeps = {
      now,
      nextId,
      userId: ctx.userId,
      // [T-332 S2] 未选号 → AccountRequiredError(读写同门,§4.2)。
      accountId: requireAccountId(ctx.accountId, op),
    };
    return createTopicAttributionRepository(db, repoDeps);
  }

  return {
    async listAttributions(ctx, query) {
      const { rows, total } = await repoFor(
        ctx,
        "topicAttribution.listAttributions",
      ).listAttributions({
        limit: query.pageSize,
        offset: (query.page - 1) * query.pageSize,
        publicationId: query.publicationId,
      });
      return { rows: rows.map(toTopicAttributionDto), total };
    },

    async hasAttribution(ctx, publicationId) {
      return repoFor(ctx, "topicAttribution.hasAttribution").hasAttribution(
        publicationId,
      );
    },

    async saveAttribution(ctx, input) {
      // [T-332 S2] 号由 repo deps stamp(归因 runner ctx 账号由任务链派生,ISO-06)。
      const row = await repoFor(
        ctx,
        "topicAttribution.saveAttribution",
      ).createAttribution(input);
      return toTopicAttributionDto(row);
    },
  };
}
