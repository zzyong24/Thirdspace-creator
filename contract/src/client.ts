import type { z } from "zod";
import type { Endpoint } from "./endpoints";
import type { EndpointInput, Transport } from "./transport";
import type { RequestContext } from "./request-context";
import {
  successEnvelope,
  listEnvelope,
  type ListEnvelope,
} from "./envelope";

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

/**
 * 读取列表数据时保留 contract envelope 的分页真相。
 *
 * `createClient` 为普通业务调用只返回 data；需要展示真实 total/分页进度的页面必须走
 * 这个入口，不能再用当前页 `data.length` 冒充库中总量。
 */
export async function requestListWithMeta<E extends Endpoint>(
  transport: Transport,
  endpoint: E,
  input: EndpointInput<E>,
  ctx?: RequestContext,
): Promise<ListEnvelope<z.infer<E["response"]>>> {
  const raw = await transport.request(endpoint, input, ctx);
  return listEnvelope(endpoint.response).parse(raw) as ListEnvelope<
    z.infer<E["response"]>
  >;
}

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
