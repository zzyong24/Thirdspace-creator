import type { z } from "zod";
import type { Endpoint } from "./endpoints";

export type EndpointInput<E extends Endpoint> = {
  params: E["params"] extends z.ZodTypeAny ? z.infer<E["params"]> : undefined;
  query: E["query"] extends z.ZodTypeAny ? z.infer<E["query"]> : undefined;
  body: E["body"] extends z.ZodTypeAny ? z.infer<E["body"]> : undefined;
};

export interface Transport {
  request<E extends Endpoint>(
    endpoint: E,
    input: EndpointInput<E>,
  ): Promise<unknown>;
}
