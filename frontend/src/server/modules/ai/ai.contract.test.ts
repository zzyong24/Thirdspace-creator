import { describe, it, expect, beforeEach } from "vitest";
import { createDb, type Db } from "@creatoros/backend";
import {
  ENDPOINTS,
  type Endpoint,
  type RequestContext,
  type Transport,
} from "@creatoros/contract";
import { createAiService } from "./ai.service";
import { createAiTransport } from "./ai.transport";

// AI contract test (Step 4) — for EACH of the six op ids, drive the transport with a
// seeded ctx + valid input and assert the op's contract response DTO .parse(envelope.data)
// succeeds (the output validates against the wire shape). The list op validates
// element-wise; meta matches the envelope. Mirrors the learnings contract test.

const NOW = "2026-06-21T00:00:00.000Z";
const ctx: RequestContext = { userId: "user-a", requestId: "r1", source: "user" };

const ep = (id: string) => ({ id }) as unknown as Endpoint;
async function call(
  transport: Transport,
  id: string,
  input: unknown,
  rctx?: RequestContext,
): Promise<{ data: unknown; meta?: unknown }> {
  const res = await transport.request(ep(id), input as never, rctx);
  return res as { data: unknown; meta?: unknown };
}

function makeTransport(db: Db) {
  let seq = 0;
  const service = createAiService({
    db,
    now: () => NOW,
    nextId: (prefix: string) => `${prefix}-${++seq}`,
    artifacts: { createVersion: async () => ({}) },
    knowledge: { createKnowledge: async () => ({ id: "k-new" }) },
  });
  return createAiTransport(() => service);
}

describe("ai contract (each op validates against its DTO)", () => {
  let db: Db;
  beforeEach(async () => {
    ({ db } = await createDb());
  });

  it("ai.conversations.create → aiConversationResource", async () => {
    const transport = makeTransport(db);
    const env = await call(
      transport,
      "ai.conversations.create",
      { body: { title: "Copilot" } },
      ctx,
    );
    const parsed = ENDPOINTS.createConversation.response.parse(env.data);
    expect(parsed.title).toBe("Copilot");
    expect(parsed.userId).toBe("user-a");
  });

  it("ai.conversations.list → aiConversationResource[] (each item validates)", async () => {
    const transport = makeTransport(db);
    await call(transport, "ai.conversations.create", { body: { title: "C" } }, ctx);
    const env = await call(
      transport,
      "ai.conversations.list",
      { query: { page: 1, pageSize: 20 } },
      ctx,
    );
    const items = (env.data as unknown[]) ?? [];
    expect(items.length).toBeGreaterThan(0);
    for (const item of items) ENDPOINTS.listConversations.response.parse(item);
    expect((env.meta as { requestId?: string }).requestId).toBe("r1");
  });

  it("ai.conversations.messages.create → aiMessageResource", async () => {
    const transport = makeTransport(db);
    const conv = await call(
      transport,
      "ai.conversations.create",
      { body: { title: "C" } },
      ctx,
    );
    const convId = (conv.data as { id: string }).id;
    const env = await call(
      transport,
      "ai.conversations.messages.create",
      { params: { conversationId: convId }, body: { content: "改写开场" } },
      ctx,
    );
    const parsed = ENDPOINTS.createMessage.response.parse(env.data);
    expect(parsed.role).toBe("user");
    expect(parsed.content).toBe("改写开场");
  });

  it("ai.tasks.create → aiTaskResource (queued)", async () => {
    const transport = makeTransport(db);
    const env = await call(
      transport,
      "ai.tasks.create",
      { body: { taskType: "script.rewrite", inputData: { artifactId: "artifact-1" } } },
      ctx,
    );
    const parsed = ENDPOINTS.createAITask.response.parse(env.data);
    expect(parsed.status).toBe("queued");
    expect(parsed.taskType).toBe("script.rewrite");
  });

  it("ai.tasks.confirm → aiTaskResource (succeeded)", async () => {
    // This case needs a service handle to seed a candidate (recordCandidate) before the
    // transport confirm, so build the service + transport directly here.
    let seq = 100;
    const service = createAiService({
      db,
      now: () => NOW,
      nextId: (prefix: string) => `${prefix}-${++seq}`,
      artifacts: { createVersion: async () => ({}) },
      knowledge: { createKnowledge: async () => ({ id: "k-new" }) },
    });
    const t = await service.createTask(ctx, {
      taskType: "script.rewrite",
      inputData: { artifactId: "artifact-1", idempotencyKey: "k-confirm" },
    });
    await service.recordCandidate(ctx, t.id, {
      resultType: "artifact_version",
      artifactId: "artifact-1",
      resultData: { body: "改写稿" },
    });
    const directTransport = createAiTransport(() => service);
    const env = await call(
      directTransport,
      "ai.tasks.confirm",
      { params: { taskId: t.id } },
      ctx,
    );
    const parsed = ENDPOINTS.confirmTask.response.parse(env.data);
    expect(parsed.status).toBe("succeeded");
  });

  it("ai.tasks.cancel → aiTaskResource (cancelled)", async () => {
    const transport = makeTransport(db);
    const created = await call(
      transport,
      "ai.tasks.create",
      { body: { taskType: "script.rewrite", inputData: { artifactId: "a" } } },
      ctx,
    );
    const taskId = (created.data as { id: string }).id;
    const env = await call(
      transport,
      "ai.tasks.cancel",
      { params: { taskId } },
      ctx,
    );
    const parsed = ENDPOINTS.cancelTask.response.parse(env.data);
    expect(parsed.status).toBe("cancelled");
  });

  it("no ctx → AuthenticationError", async () => {
    const transport = makeTransport(db);
    await expect(
      call(transport, "ai.conversations.list", { query: { page: 1, pageSize: 20 } }),
    ).rejects.toThrow();
  });
});
