import { describe, it, expect, beforeEach } from "vitest";
import { createDb, type Db } from "@creatoros/backend";
import {
  ENDPOINTS,
  type Endpoint,
  type RequestContext,
  type Transport,
} from "@creatoros/contract";
import { createLearningsService } from "./learnings.service";
import { createLearningsTransport } from "./learnings.transport";

// Learnings contract test (Step 4) — for EACH of the four op ids, drive the transport
// with a seeded ctx + valid input and assert the op's contract response DTO
// .parse(envelope.data) succeeds (the output validates against the wire shape).
// Mirrors the reviews contract test.

const NOW = "2026-06-21T00:00:00.000Z";
const ctx: RequestContext = { userId: "user-a", requestId: "r1", source: "user" };

const ep = (id: string) => ({ id }) as unknown as Endpoint;
async function call(
  transport: Transport,
  id: string,
  input: unknown,
  rctx?: RequestContext,
): Promise<{ data: unknown }> {
  const res = await transport.request(ep(id), input as never, rctx);
  return res as { data: unknown };
}

function makeTransport(db: Db) {
  let seq = 0;
  const service = createLearningsService({
    db,
    now: () => NOW,
    nextId: (prefix: string) => `${prefix}-${++seq}`,
    projects: {
      assertOwnsProject: async () => {},
      recordActivity: async () => {},
    },
  });
  return createLearningsTransport(() => service);
}

describe("learnings contract (each op validates against its DTO)", () => {
  let db: Db;
  beforeEach(async () => {
    ({ db } = await createDb());
  });

  it("learnings.list → learningResource[] (each item validates)", async () => {
    const transport = makeTransport(db);
    await call(transport, "learnings.create", {
      body: { title: "钩子前置", insight: "" },
    }, ctx);
    const env = await call(transport, "learnings.list", {
      query: { limit: 20, offset: 0 },
    }, ctx);
    const items = (env.data as unknown[]) ?? [];
    expect(items.length).toBeGreaterThan(0);
    for (const item of items) {
      const parsed = ENDPOINTS.listLearnings.response.parse(item);
      expect(parsed.validationStatus).toBe("candidate");
    }
  });

  it("learnings.create → learningResource (candidate)", async () => {
    const transport = makeTransport(db);
    const env = await call(transport, "learnings.create", {
      body: { title: "脚本结构", insight: "三段式" },
    }, ctx);
    const parsed = ENDPOINTS.createLearning.response.parse(env.data);
    expect(parsed.validationStatus).toBe("candidate");
    expect(parsed.confidenceScore).toBe(0);
  });

  it("learnings.applications.create → learningApplicationResource (evaluatedAt null)", async () => {
    const transport = makeTransport(db);
    const created = await call(transport, "learnings.create", {
      body: { title: "L", insight: "" },
    }, ctx);
    const id = (created.data as { id: string }).id;
    const env = await call(transport, "learnings.applications.create", {
      params: { learningId: id },
      body: { projectId: "project-1", applicationNote: "" },
    }, ctx);
    const parsed = ENDPOINTS.createLearningApplication.response.parse(env.data);
    expect(parsed.evaluatedAt).toBeNull();
    expect(parsed.outcome).toEqual({});
  });

  it("learnings.evaluate → learningResource (validated, confidence int)", async () => {
    const transport = makeTransport(db);
    const created = await call(transport, "learnings.create", {
      body: { title: "L", insight: "" },
    }, ctx);
    const id = (created.data as { id: string }).id;
    const env = await call(transport, "learnings.evaluate", {
      params: { learningId: id },
      body: { validationStatus: "validated" },
    }, ctx);
    const parsed = ENDPOINTS.evaluateLearning.response.parse(env.data);
    expect(parsed.validationStatus).toBe("validated");
    expect(Number.isInteger(parsed.confidenceScore)).toBe(true);
  });

  it("no ctx → AuthenticationError", async () => {
    const transport = makeTransport(db);
    await expect(
      call(transport, "learnings.list", { query: { limit: 20, offset: 0 } }),
    ).rejects.toThrow();
  });
});
