import type { Endpoint, Transport } from "@creatoros/contract";
import { getStore } from "./index";
import { projectsHandlers } from "./handlers/projects";
import { pagesHandlers } from "./handlers/pages";

export type Handler = (input: {
  params: unknown;
  query: unknown;
  body: unknown;
  store: ReturnType<typeof getStore>;
}) => unknown;

// id → handler. Returns `{ data, meta }` envelopes (lists include page meta).
const HANDLERS: Record<string, Handler> = {
  ...projectsHandlers,
  ...pagesHandlers,
};

export const mockTransport: Transport = {
  async request(endpoint: Endpoint, input) {
    const handler = HANDLERS[endpoint.id];
    if (!handler) {
      throw new Error(`MockBackend: operation not implemented: ${endpoint.id}`);
    }
    const data = handler({ ...input, store: getStore() });
    if (endpoint.isList) {
      const arr = data as unknown[];
      return {
        data: arr,
        meta: { requestId: "mock", page: 1, pageSize: 20, total: arr.length },
      };
    }
    return { data, meta: { requestId: "mock" } };
  },
};
