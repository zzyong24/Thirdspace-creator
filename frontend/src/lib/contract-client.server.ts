import "server-only";
import {
  ENDPOINTS,
  createClient,
  requestListWithMeta,
  type Endpoint,
  type EndpointInput,
  type RequestContext,
} from "@creatoros/contract";
import { compositeTransport } from "@/server/persistence-client";
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
export function createServerClient(ctx: RequestContext) {
  return createClient(ENDPOINTS, compositeTransport, ctx);
}

export function requestServerListWithMeta<E extends Endpoint>(
  ctx: RequestContext,
  endpoint: E,
  input: EndpointInput<E>,
) {
  return requestListWithMeta(compositeTransport, endpoint, input, ctx);
}

// 旧调用者保留同一client接口，但身份在每次请求时从实际session解析，不跨请求缓存。
export const client = createClient(ENDPOINTS, {
  async request(endpoint, input) {
    const session = await resolveSession();
    if (!session) throw new AuthenticationError();
    return compositeTransport.request(endpoint, input, session.ctx);
  },
});
