import "server-only";
import { ENDPOINTS, listEnvelope, successEnvelope, type Transport, type RequestContext } from "@creatoros/contract";

const PENDING_REUSE_MS = 15_000;
const MAX_ENTRIES = 128;
const MAX_BYTES = 16 * 1024 * 1024;
const MAX_ENTRY_BYTES = 2 * 1024 * 1024;
const reads = new Set<string>([
  ENDPOINTS.listProjects.id, ENDPOINTS.listCandidates.id,
  ENDPOINTS.listOutputs.id,
  ENDPOINTS.listPublications.id, ENDPOINTS.listPublicationRevisions.id,
  ENDPOINTS.getPublicationAnalytics.id, ENDPOINTS.getDailyReport.id,
]);
interface Entry {
  userId: string;
  promise: Promise<unknown>;
  pendingUntil: number;
  settled: boolean;
  expiresAt?: number;
  revision: string;
  bytes: number;
}
interface State { entries: Map<string, Entry>; bytes: number }
// Next 的页面/API 可能在不同 bundle 中加载本模块，但同进程必须共享失效源。
const root = globalThis as typeof globalThis & { __creatorosPageReadsV2?: State };
const state = root.__creatorosPageReadsV2 ??= { entries: new Map(), bytes: 0 };
function remove(key: string) {
  const entry = state.entries.get(key);
  if (entry) { state.bytes -= entry.bytes; state.entries.delete(key); }
}
function trim() {
  while (state.entries.size > MAX_ENTRIES || state.bytes > MAX_BYTES) {
    const key = state.entries.keys().next().value;
    if (key === undefined) break;
    remove(key);
  }
}
function invalidate(userId?: string) {
  for (const [key, entry] of state.entries) {
    if (!userId || entry.userId === userId) remove(key);
  }
}
/** 仅已验证 session 的展示页面显式启用；不是业务服务或 Agent 的真值缓存。 */
export function withPageReadCache(transport: Transport, readRevision: () => Promise<string>): Transport {
  return { async request(endpoint, input, ctx) {
    if (!ctx?.userId || !ctx.accountId || ctx.source !== "user" || endpoint.method !== "GET" || !reads.has(endpoint.id)) {
      return transport.request(endpoint, input, ctx);
    }
    // 日报必须使用已解析的北京时间日期，默认昨天不跨日复用。
    if (endpoint.id === ENDPOINTS.getDailyReport.id) {
      const q=input.query as {date?:string;startDate?:string;endDate?:string}|undefined;
      if (!q?.date && !(q?.startDate && q?.endDate)) return transport.request(endpoint,input,ctx);
    }
    // 护栏排序按当前时间衰减偏好；总览也有跨域来源，均保持实时读取。
    if (endpoint.id === ENDPOINTS.listCandidates.id && (input.query as {sort?: string} | undefined)?.sort === "guardrail") return transport.request(endpoint, input, ctx);
    return readCachedPageValue({
      ctx, key: ["endpoint", endpoint.id, input], readRevision,
      read: () => transport.request(endpoint, input, ctx),
      isCacheable: value => (endpoint.isList ? listEnvelope(endpoint.response) : successEnvelope(endpoint.response)).safeParse(value).success,
      maxAgeMs: endpoint.id === ENDPOINTS.getDailyReport.id ? 30_000 : undefined,
    });
  }};
}
/** 共用有界展示缓存；页面投影无需虚构业务 endpoint，写入仍统一失效。 */
export async function readCachedPageValue<T>(options: {
  ctx: RequestContext; key: readonly unknown[];
  readRevision: () => Promise<string>; read: () => Promise<T>;
  isCacheable: (value: T) => boolean; maxAgeMs?: number;
}): Promise<T> {
  const { ctx } = options;
  if (!ctx.userId || !ctx.accountId || ctx.source !== "user") return options.read();
  let revision: string;
  try { revision = await options.readRevision(); }
  catch { return options.read(); }
  const key = JSON.stringify([ctx.userId, ctx.accountId, ctx.source, ...options.key]);
  const existing = state.entries.get(key);
  if (existing && existing.revision === revision && ((existing.settled && (existing.expiresAt === undefined || existing.expiresAt > Date.now())) || (!existing.settled && existing.pendingUntil > Date.now()))) {
    state.entries.delete(key); state.entries.set(key, existing);
    return structuredClone(await existing.promise) as T;
  }
  if (existing) remove(key);
  // 同步登记 Promise；在途复用也有时限，挂起请求不能永久占住之后的刷新。
  // 失效/淘汰/过期替换后，旧回执不能回填。
  const entry: Entry = { userId: ctx.userId, promise: Promise.resolve(undefined), pendingUntil: Date.now() + PENDING_REUSE_MS, settled: false, revision, bytes: 0 };
  entry.promise = Promise.resolve().then(() => options.read()).then(async value => {
    let currentRevision: string | undefined;
    try { currentRevision = await options.readRevision(); } catch { /* 版本不可用只禁止回填，不丢已有读取结果。 */ }
    if (state.entries.get(key) === entry) {
      const valid = options.isCacheable(value as T);
      const bytes = (JSON.stringify(value)?.length ?? 0) * 2;
      if (currentRevision !== revision || !valid || bytes > MAX_ENTRY_BYTES) remove(key);
      else { entry.bytes = bytes; entry.settled = true;
        // 组合展示允许短 TTL 兜底，不能替代业务版本失效。
        if (options.maxAgeMs !== undefined) entry.expiresAt = Date.now() + options.maxAgeMs; state.bytes += bytes; trim(); }
    }
    return value;
  }).catch(error => {
    if (state.entries.get(key) === entry) remove(key);
    throw error;
  });
  state.entries.set(key, entry); trim();
  return structuredClone(await entry.promise) as T;
}
/** 公共写入口前后失效，写失败/响应丢失也不能留下旧展示缓存。 */
export function withPageReadInvalidation(transport: Transport): Transport {
  return { async request(endpoint, input, ctx) {
    if (endpoint.method === "GET") return transport.request(endpoint, input, ctx);
    invalidate(ctx?.userId);
    try { return await transport.request(endpoint, input, ctx); }
    finally { invalidate(ctx?.userId); }
  }};
}
