import type { CollectionRunResource, RequestContext } from "@creatoros/contract";

const PERIOD_MS = 6 * 60 * 60 * 1000;
const RETRY_AFTER_ERROR_MS = 60 * 60 * 1000;
const RESUMABLE = new Set(["queued", "running", "partial"]);

type Account = { id: string; platform: string; status: string };
type Ports = {
  recoveryOnly?:boolean;
  listAccounts(ctx: RequestContext, query: { limit: number; offset: number }): Promise<{ rows: Account[] }>;
  latestRun(ctx: RequestContext, accountId: string, capability: CollectionRunResource["capability"]): Promise<CollectionRunResource | null>;
  start(ctx: RequestContext, input: { accountId: string; capability: "workCatalog"; clientRequestId: string }): Promise<CollectionRunResource>;
  resume(ctx: RequestContext, run: CollectionRunResource): void;
  onError(accountId: string, error: unknown): void;
  now(): string;
};

/** 复用持久采集运行表的幂等键与租约；每个账号独立判断，不让一号失败阻塞其他号。 */
export function createPeriodicPlatformCollection(ports: Ports) {
  const retryAfter = new Map<string, number>();
  let running = false;
  return async function tick(ctx: RequestContext): Promise<void> {
    if (running) return;
    running = true;
    try {
      const nowMs = Date.parse(ports.now());
      if (!Number.isFinite(nowMs)) return;
      for (let offset = 0; ; offset += 100) {
        const { rows } = await ports.listAccounts(ctx, { limit: 100, offset });
        for (const account of rows) {
          if (account.status !== "active" || !["xiaohongshu", "kuaishou"].includes(account.platform)) continue;
          if ((retryAfter.get(account.id) ?? 0) > nowMs) continue;
          const scoped = { ...ctx, accountId: account.id };
          try {
            if(ports.recoveryOnly){
              const capabilities:CollectionRunResource['capability'][]=account.platform==='kuaishou'?['workCatalog','workMetrics','accountOverview']:['workCatalog','workMetrics'];
              for(const capability of capabilities){const original=await ports.latestRun(scoped,account.id,capability);if(original&&RESUMABLE.has(original.status))ports.resume(scoped,original);}
              continue;
            }
            const latest = await ports.latestRun(scoped, account.id, "workCatalog");
            if (latest && RESUMABLE.has(latest.status)) {
              ports.resume(scoped, latest);
              continue;
            }
            if (latest?.status === "needsAuth") continue;
            if (latest && nowMs - Date.parse(latest.startedAt) < PERIOD_MS) continue;
            const run = await ports.start(scoped, {
              accountId: account.id,
              capability: "workCatalog",
              clientRequestId: `periodic-${Math.floor(nowMs / PERIOD_MS)}`,
            });
            ports.resume(scoped, run);
          } catch (error) {
            retryAfter.set(account.id, nowMs + RETRY_AFTER_ERROR_MS);
            ports.onError(account.id, error);
          }
        }
        if (rows.length < 100) break;
      }
    } finally {
      running = false;
    }
  };
}
