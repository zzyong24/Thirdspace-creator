import {requireWorkspace,assertWritableWorkspace} from "../../workspace-scope";
import type { RequestContext } from "@creatoros/contract";
import type { Db } from "@creatoros/backend";
import {
  createTrendSourcesRepository,
  type TrendSourcesRepository,
  type RepoDeps,
} from "./trend-sources.repository";
import {
  toTrendSourceDto,
  type TrendSourceResource,
} from "./trend-sources.schema";
import { ValidationError, requireAccountId } from "./trend-sources.errors";

// [T-235b → T-332 S2] TrendSources service(foundation §5.3,照 benchmark 先例)—— 每个公开
// 方法 (ctx, …),构 repo bound to ctx.userId + ctx.accountId 使 scoping 结构化。每个入口经
// requireAccountId 断言:未选号 = 引导态,读写一律 AccountRequiredError(SPEC §4.2)。
// 信源 CRUD(list/create/toggle/remove)+ 抓取用只读口(listEnabledSources 投影)。
//
// URL 归一/派生(登记时一次算好,抓取端零猜测):
//   - sourceType 显式传入优先;缺省按 URL 派生:feed 特征(.xml/.rss/.atom 结尾或路径含
//     /feed|/rss|/atom)→ rss,其余 → web。
//   - domain = URL hostname(web 型查 .auth/web/<domain> 登录态用)。
//   - name 缺省 = domain(展示兜底,不留空)。

export interface ServiceDeps {
  db: Db;
  now: () => string;
  nextId: (prefix: string) => string;
}

export interface CreateTrendSourceInput {
  url: string;
  name?: string | null;
  note?: string | null;
  sourceType?: "web" | "rss";
  enabled?: boolean;
}

/** 抓取用投影(信号采集器只需 URL/类型/域名/展示名)。 */
export interface EnabledTrendSource {
  id: string;
  accountId: string | null;
  name: string;
  url: string;
  sourceType: "web" | "rss";
  domain: string;
  note: string | null;
}

export interface TrendSourcesService {
  listSources(
    ctx: RequestContext,
    query: { page: number; pageSize: number },
  ): Promise<{ rows: TrendSourceResource[]; total: number }>;
  createSource(
    ctx: RequestContext,
    input: CreateTrendSourceInput,
  ): Promise<TrendSourceResource>;
  toggleSource(
    ctx: RequestContext,
    sourceId: string,
    enabled: boolean,
  ): Promise<TrendSourceResource>;
  removeSource(
    ctx: RequestContext,
    sourceId: string,
  ): Promise<TrendSourceResource>;
  /** 抓取用:列该 ctx(含号)enabled 的信源(投影)。 */
  listEnabledSources(ctx: RequestContext): Promise<EnabledTrendSource[]>;
}

/** URL → hostname(非法 URL 抛 ValidationError,登记时就挡住,不让脏 URL 进抓取端)。 */
export function trendSourceDomain(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    throw new ValidationError(
      `ValidationError: url 不是合法的 http(s) 链接:「${url.slice(0, 120)}」`,
    );
  }
}

/** 按 URL 派生信源类型:feed 特征 → rss,其余 → web(显式传入时不走这里)。纯函数可单测。 */
export function deriveSourceType(url: string): "web" | "rss" {
  let path = "";
  try {
    const u = new URL(url);
    path = u.pathname.toLowerCase();
  } catch {
    return "web"; // 非法 URL 由 trendSourceDomain 先挡;这里防御性兜底
  }
  if (/\.(xml|rss|atom)$/.test(path)) return "rss";
  if (/(^|\/)(feed|rss|atom)(\/|$)/.test(path)) return "rss";
  return "web";
}

function guardCreate(input: CreateTrendSourceInput): void {
  const url = (input.url ?? "").trim();
  if (!url) {
    throw new ValidationError("ValidationError: url must be non-empty");
  }
  if (!/^https?:\/\//i.test(url)) {
    throw new ValidationError(
      `ValidationError: 只支持 http/https 信源链接(收到「${url.slice(0, 120)}」)`,
    );
  }
}

export function createTrendSourcesService(
  deps: ServiceDeps,
): TrendSourcesService {
  const { db, now, nextId } = deps;

  function repoFor(ctx: RequestContext, op: string): TrendSourcesRepository {
    const repoDeps: RepoDeps = {
      now,
      nextId,
      userId: ctx.userId,
      // [T-332 S2] 未选号 → AccountRequiredError(读写同门,§4.2)。
      groupId:ctx.groupId??null,
      accountId: (requireWorkspace(ctx),ctx.groupId?null:requireAccountId(ctx.accountId,op)),
    };
    return createTrendSourcesRepository(db, repoDeps);
  }

  return {
    async listSources(ctx, query) {
      const { rows, total } = await repoFor(ctx, "trendSources.listSources").listSources({
        limit: query.pageSize,
        offset: (query.page - 1) * query.pageSize,
      });
      return { rows: rows.map(toTrendSourceDto), total };
    },

    async createSource(ctx, input) {
      await assertWritableWorkspace(db,ctx);
      guardCreate(input);
      const url = input.url.trim();
      const domain = trendSourceDomain(url);
      const sourceType = input.sourceType ?? deriveSourceType(url);
      // [T-332 S2] 号由 repo deps stamp(§4.6 防绕过),不再经 input 传递。
      const row = await repoFor(ctx, "trendSources.createSource").createSource({
        url,
        name: (input.name ?? "").trim() || domain, // 展示兜底:缺名用 domain
        sourceType,
        domain,
        note: input.note ?? null,
        enabled: input.enabled,
      });
      return toTrendSourceDto(row);
    },

    async toggleSource(ctx, sourceId, enabled) {
      await assertWritableWorkspace(db,ctx);
      const row = await repoFor(ctx, "trendSources.toggleSource").setSourceEnabled(
        sourceId,
        enabled,
      );
      return toTrendSourceDto(row);
    },

    async removeSource(ctx, sourceId) {
      await assertWritableWorkspace(db,ctx);
      const row = await repoFor(ctx, "trendSources.removeSource").removeSource(sourceId);
      return toTrendSourceDto(row);
    },

    async listEnabledSources(ctx) {
      const rows = await repoFor(ctx, "trendSources.listEnabledSources").listEnabledSources();
      return rows.map((r) => ({
        id: r.id,
        accountId: r.accountId ?? null,
        name: r.name,
        url: r.url,
        sourceType: r.sourceType === "rss" ? ("rss" as const) : ("web" as const),
        domain: r.domain,
        note: r.note ?? null,
      }));
    },
  };
}
