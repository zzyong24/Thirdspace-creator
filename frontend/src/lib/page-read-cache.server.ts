import "server-only";
import { ENDPOINTS, listEnvelope, successEnvelope, type Transport } from "@creatoros/contract";

const CACHE_TTL_MS = 15_000;
const MAX_ENTRIES = 128;
const MAX_BYTES = 16 * 1024 * 1024;
const MAX_ENTRY_BYTES = 2 * 1024 * 1024;
const reads = new Set<string>([
  ENDPOINTS.listProjects.id, ENDPOINTS.listCandidates.id,
  ENDPOINTS.overviewTopics.id, ENDPOINTS.listOutputs.id,
  ENDPOINTS.listPublications.id, ENDPOINTS.listPublicationRevisions.id,
  ENDPOINTS.getPublicationAnalytics.id,
]);
interface Entry {
  userId: string;
  promise: Promise<unknown>;
  expiresAt: number;
  bytes: number;
}
interface State { entries: Map<string, Entry>; bytes: number }
// Next 的页面/API 可能在不同 bundle 中加载本模块，但同进程必须共享失效源。
const root = globalThis as typeof globalThis & { __creatorosPageReadsV1?: State };
const state = root.__creatorosPageReadsV1 ??= { entries: new Map(), bytes: 0 };
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
/** 仅两个已验证 session 的列表页面显式启用；不是业务服务或 Agent 的真值缓存。 */
export function withPageReadCache(transport: Transport): Transport {
  return { async request(endpoint, input, ctx) {
    if (!ctx?.userId || !ctx.accountId || ctx.source !== "user" || endpoint.method !== "GET" || !reads.has(endpoint.id)) {
      return transport.request(endpoint, input, ctx);
    }
    const key = JSON.stringify([ctx.userId, ctx.accountId, ctx.source, endpoint.id, input]);
    const existing = state.entries.get(key);
    if (existing && existing.expiresAt > Date.now()) {
      state.entries.delete(key); state.entries.set(key, existing);
      return structuredClone(await existing.promise);
    }
    if (existing) remove(key);
    // 同步登记 Promise；在途复用也有时限，挂起请求不能永久占住之后的刷新。
    // 失效/淘汰/过期替换后，旧回执不能回填。
    const entry: Entry = { userId: ctx.userId, promise: Promise.resolve(undefined), expiresAt: Date.now() + CACHE_TTL_MS, bytes: 0 };
    entry.promise = Promise.resolve().then(() => transport.request(endpoint, input, ctx)).then(value => {
      if (state.entries.get(key) === entry) {
        const valid = (endpoint.isList ? listEnvelope(endpoint.response) : successEnvelope(endpoint.response)).safeParse(value).success;
        const bytes = (JSON.stringify(value)?.length ?? 0) * 2;
        if (!valid || bytes > MAX_ENTRY_BYTES) remove(key);
        else { entry.bytes = bytes; entry.expiresAt = Date.now() + CACHE_TTL_MS; state.bytes += bytes; trim(); }
      }
      return value;
    }).catch(error => {
      if (state.entries.get(key) === entry) remove(key);
      throw error;
    });
    state.entries.set(key, entry); trim();
    return structuredClone(await entry.promise);
  }};
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
