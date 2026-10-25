"use client";

/**
 * 素材签名预览 URL 共享缓存(T-061,修 Bug-6)。
 *
 * 网格缩略图(AssetThumbnail)与详情真预览(AssetLivePreview)都要经
 * assets.downloadUrl 换签名 URL(local-fs = token 门 blob route)。模块级
 * Promise 缓存让同一素材整个页面只换一次 —— 24 张网格卡 + 详情栏共 1 次/素材,
 * 不是 2 次。换取失败缓存 null(诚实降级占位 glyph),不无限重试打爆 dispatch。
 *
 * [Bug-6 T-019] **TTL 强制 ≤ token TTL**:local-fs 默认 expiresInMs=15min,签名 URL 15 分钟
 * 后服务端验签 reject → 浏览器 <img onError> → 卡片回退到占位。**但 module-scope Promise
 * 缓存永不过期**,用户看一会儿图就全消失(就是「先用能看,过会儿全不显示」的根因)。
 * 修法:存 `{url, expiresAt}`,过期自动 invalidate + 重换。`invalidateAssetPreviewUrl`
 * 也终于有 caller 调了(组件 onError 时),避免「失败的 URL 永远卡死」的二次病。
 */

import { client } from "@/lib/contract-client";
import { readCurrentAccountId, readCurrentGroupId } from "@/lib/http-transport";

const CACHE_TTL_MS = 10 * 60 * 1000; // 小于签名URL的15分钟有效期。
const MAX_CACHE_ENTRIES = 256;
const MAX_REQUESTS = 4;
const MAX_THUMBNAIL_REQUESTS = 3;

type PreviewPriority = "thumbnail" | "active";
type PreviewJob = {
  key: string;
  assetId: string;
  phase: "queued" | "running" | "settled";
  consumers: Map<symbol, PreviewPriority>;
  legacyConsumer: boolean;
  promise: Promise<string | null>;
  resolve: (url: string | null) => void;
};
export interface AssetPreviewLease {
  readonly promise: Promise<string | null>;
  release(): void;
}
interface CacheEntry { url: string | null; expiresAt: number; }
const cache = new Map<string, CacheEntry>();
// Map插入顺序保同级FIFO；不同素材共享有限名额，同素材仍共用原Promise。
const inflight = new Map<string, PreviewJob>();
let running = 0, runningThumbnails = 0, pumpScheduled = false;
let expiryTimer: ReturnType<typeof setTimeout> | undefined;
function previewKey(assetId: string) {
  return JSON.stringify([readCurrentGroupId(), readCurrentAccountId(), assetId]);
}
function sweepCache() {
  clearTimeout(expiryTimer);
  const now = Date.now();
  for (const [key, entry] of cache) if (entry.expiresAt <= now) cache.delete(key);
  while (cache.size > MAX_CACHE_ENTRIES) cache.delete(cache.keys().next().value!);
  const nextExpiry = Math.min(...[...cache.values()].map(entry => entry.expiresAt));
  expiryTimer = Number.isFinite(nextExpiry) ? setTimeout(sweepCache, Math.max(0, nextExpiry - now)) : undefined;
}
function hasConsumers(job: PreviewJob) { return job.legacyConsumer || job.consumers.size > 0; }
function isActive(job: PreviewJob) { return job.legacyConsumer || [...job.consumers.values()].includes("active"); }
function current(job: PreviewJob) { return inflight.get(job.key) === job && previewKey(job.assetId) === job.key; }
function cancelQueued(job: PreviewJob) {
  if (job.phase !== "queued") return;
  if (inflight.get(job.key) === job) inflight.delete(job.key);
  job.phase = "settled";
  job.resolve(null); // 取消不是失败，不写短TTL缓存或触发自动重试。
}
function schedulePump() {
  if (pumpScheduled) return;
  pumpScheduled = true;
  void Promise.resolve().then(() => { pumpScheduled = false; pump(); });
}
async function read(job: PreviewJob): Promise<string | null> {
  let url: string | null = null, failed = false;
  try {
    // 在真正调用SDK的同一同步段核范围，不把旧队列用新账号请求头发出去。
    if (!current(job) || !hasConsumers(job)) return null;
    const dto = await client.getDownloadUrl({params: {assetId: job.assetId},query: undefined,body: undefined});
    url = dto.url ?? null;
  } catch { failed = true; }
  if (!current(job) || !hasConsumers(job)) return null;
  cache.set(job.key, {url,expiresAt: Date.now() + (failed ? 30_000 : CACHE_TTL_MS)});
  sweepCache();
  return url;
}
function pump() {
  for (const job of inflight.values()) {
    if (job.phase === "queued" && (!current(job) || !hasConsumers(job))) cancelQueued(job);
  }
  while (running < MAX_REQUESTS) {
    const queued = [...inflight.values()].filter(job => job.phase === "queued");
    const job = queued.find(isActive) ?? (runningThumbnails < MAX_THUMBNAIL_REQUESTS ? queued[0] : undefined);
    if (!job) return;
    const thumbnail = !isActive(job);
    job.phase = "running"; running++;
    if (thumbnail) runningThumbnails++;
    const finish = (url: string | null) => {
      // release/invalidate不能提前释放物理在途名额，只在SDK实际settle时扣减。
      running--;
      if (thumbnail) runningThumbnails--;
      if (inflight.get(job.key) === job) inflight.delete(job.key);
      job.phase = "settled"; job.resolve(url); schedulePump();
    };
    void read(job).then(finish, () => finish(null));
  }
}
function lookup(assetId: string): {promise: Promise<string | null>;job?: PreviewJob} {
  sweepCache();
  const key = previewKey(assetId), hit = cache.get(key);
  if (hit && Date.now() < hit.expiresAt) {
    cache.delete(key); cache.set(key, hit);
    return {promise: Promise.resolve(hit.url)};
  }
  if (hit) cache.delete(key);
  const existing = inflight.get(key);
  if (existing) return {promise: existing.promise,job: existing};
  let resolve!: PreviewJob["resolve"];
  const promise = new Promise<string | null>(done => { resolve = done; });
  const job: PreviewJob = {key,assetId,phase:"queued",consumers:new Map(),legacyConsumer:false,promise,resolve};
  inflight.set(key,job);
  return {promise,job};
}

/** 旧单次调用保原签名和Promise共享；默认主动预览，不被缩略图占满名额。 */
export function resolveAssetPreviewUrl(assetId: string): Promise<string | null> {
  const {promise,job} = lookup(assetId);
  if (job) { job.legacyConsumer = true; schedulePump(); }
  return promise;
}

/** effect持有独立订阅；最后释放只撤未发请求，不伪造网络abort。 */
export function acquireAssetPreviewUrl(assetId: string, {priority}: {priority: PreviewPriority}): AssetPreviewLease {
  const {promise,job} = lookup(assetId), token = Symbol();
  if (job) { job.consumers.set(token,priority); schedulePump(); }
  let released = false;
  return {promise,release() {
    if (released) return;
    released = true;
    if (!job) return;
    job.consumers.delete(token);
    if (!hasConsumers(job)) cancelQueued(job);
    schedulePump();
  }};
}

/** 文件内容变更后失效；旧请求继续占真实名额，但结果不能回填。 */
export function invalidateAssetPreviewUrl(assetId: string): void {
  const key = previewKey(assetId);
  cache.delete(key);
  const job = inflight.get(key);
  if (job) {
    cancelQueued(job);
    if (inflight.get(key) === job) inflight.delete(key);
  }
  sweepCache(); schedulePump();
}
