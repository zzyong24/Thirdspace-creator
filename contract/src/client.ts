import type { z } from "zod";
import type { Endpoint } from "./endpoints";
import type { EndpointInput, Transport } from "./transport";
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
): Client<M> {
  const client = {} as Record<string, unknown>;
  for (const key of Object.keys(endpoints)) {
    const endpoint = endpoints[key]!;
    client[key] = async (input: EndpointInput<Endpoint>) => {
      const raw = await transport.request(endpoint, input);
      const envelope = endpoint.isList
        ? listEnvelope(endpoint.response)
        : successEnvelope(endpoint.response);
      const parsed = envelope.parse(raw) as { data: unknown };
      return parsed.data;
    };
  }
  return client as Client<M>;
}
