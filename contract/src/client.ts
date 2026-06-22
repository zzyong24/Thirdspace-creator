import type { z } from "zod";
import type { Endpoint } from "./endpoints";
import type { EndpointInput, Transport } from "./transport";
import type { RequestContext } from "./request-context";
import { successEnvelope, listEnvelope } from "./envelope";

type EndpointMap = Record<string, Endpoint>;

type ClientMethod<E extends Endpoint> = (
  input: EndpointInput<E>,
) => Promise<
  E extends Endpoint<
    z.ZodTypeAny | undefined,
    z.ZodTypeAny | undefined,
    z.ZodTypeAny | undefined,
    infer R
  >
    ? z.infer<R>
    : never
>;

export type Client<M extends EndpointMap> = {
  [K in keyof M]: ClientMethod<M[K]>;
};

export function createClient<M extends EndpointMap>(
  endpoints: M,
  transport: Transport,
  ctx?: RequestContext,
): Client<M> {
  const client = {} as Record<string, unknown>;
  for (const key of Object.keys(endpoints)) {
    const endpoint = endpoints[key]!;
    client[key] = async (input: EndpointInput<Endpoint>) => {
      // `ctx` is bound at client-construction (server composition root): the
      // browser client omits it; a server-bound client (createServerClient)
      // passes the request's RequestContext so reads stay user-scoped.
      const raw = await transport.request(endpoint, input, ctx);
      const envelope = endpoint.isList
        ? listEnvelope(endpoint.response)
        : successEnvelope(endpoint.response);
      const parsed = envelope.parse(raw) as { data: unknown };
      return parsed.data;
    };
  }
  return client as Client<M>;
}
