import type { z } from "zod";
import type { Endpoint } from "./endpoints";
import type { RequestContext } from "./request-context";

export type EndpointInput<E extends Endpoint> = {
  params: E["params"] extends z.ZodTypeAny ? z.infer<E["params"]> : undefined;
  query: E["query"] extends z.ZodTypeAny ? z.infer<E["query"]> : undefined;
  body: E["body"] extends z.ZodTypeAny ? z.infer<E["body"]> : undefined;
};

export interface Transport {
  // `ctx` is OPTIONAL on the contract type so the browser-side typed client
  // (which has no RequestContext — it just POSTs to /api/v1/dispatch, where the
  // server derives ctx from the session cookie) still compiles. Server-side
  // transports (the composite + persistence) treat a missing ctx as
  // unauthenticated for persisted (owned) ops and throw AuthenticationError.
  request<E extends Endpoint>(
    endpoint: E,
    input: EndpointInput<E>,
    ctx?: RequestContext,
  ): Promise<unknown>;
}
