import "server-only";
import { withPageReadCache } from "./page-read-cache.server";
import {
  ENDPOINTS,
  createClient,
  requestListWithMeta,
  type Endpoint,
  type EndpointInput,
  type RequestContext,
  type Transport,
} from "@creatoros/contract";
import { compositeTransport, readPageRevision } from "@/server/persistence-client";
import { resolveSession } from "./session.server";
import { AuthenticationError } from "@creatoros/backend/modules/identity";

// Server-only composition root (server components, route handlers). Runs the
// composite transport in-process: only registered real backend services. The `server-only`
// guard keeps persistence out of any client bundle. Server reads
// and the /api/v1 route share this same store, so island writes persist.

// Task 8: the transport signature gained a `ctx` parameter. A server-bound
// client carries the request's RequestContext so persisted reads stay
// user-scoped. The RSC/layout (Task 11) derives ctx from the session cookie and
// calls `createServerClient(ctx)`.
/** 页面慢读只记操作名与耗时，避免下一次卡顿没有可定位记录。 */
function withPageTiming(transport:Transport):Transport {
  return {async request(endpoint,input,ctx){
    const started=performance.now();
    try{return await transport.request(endpoint,input,ctx);}
    finally {
      const durationMs=Math.round(performance.now()-started);
      if(endpoint.method==="GET"&&durationMs>=200)console.info(`[page-read] operation=${endpoint.id} durationMs=${durationMs}`);
    }
  }};
}
const pageTransport=withPageTiming(compositeTransport);

export function createServerClient(ctx: RequestContext) {
  return createClient(ENDPOINTS, pageTransport, ctx);
}

/** 仅展示页在 resolveSession 校验当前账号后使用，不供 AI 或写操作读取真值。 */
export function createCachedPageClient(ctx: RequestContext) {
  return createClient(ENDPOINTS, withPageTiming(withPageReadCache(compositeTransport, readPageRevision)), ctx);
}

export function requestServerListWithMeta<E extends Endpoint>(
  ctx: RequestContext,
  endpoint: E,
  input: EndpointInput<E>,
) {
  return requestListWithMeta(pageTransport, endpoint, input, ctx);
}

// 旧调用者保留同一client接口，但身份在每次请求时从实际session解析，不跨请求缓存。
export const client = createClient(ENDPOINTS, {
  async request(endpoint, input) {
    const session = await resolveSession();
    if (!session) throw new AuthenticationError();
    return pageTransport.request(endpoint, input, session.ctx);
  },
});
