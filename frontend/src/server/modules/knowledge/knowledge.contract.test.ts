import { describe, it, expect, beforeEach } from "vitest";
import {
  createDb,
  type Db,
  UnsupportedOperationError,
} from "@creatoros/backend";
import {
  ENDPOINTS,
  listEnvelope,
  successEnvelope,
  type Endpoint,
  type RequestContext,
  type Transport,
} from "@creatoros/contract";
import { createKnowledgeRepository } from "./knowledge.repository";
import { createKnowledgeService } from "./knowledge.service";
import { createKnowledgeTransport } from "./knowledge.transport";
import {
  knowledgeItemResource,
  knowledgeRevisionResource,
  knowledgeRelationResource,
} from "./knowledge.schema";

// E1 — drive each of the 5 ops through the transport against a seeded pglite db
// and assert the envelope `data` validates against the op's contract response DTO
// (foundation §5.4). Confirms `strength` is numeric, `sourceMetadata`/
// `structuredData` are records, and nullable `sourceUrl`/`archivedAt` serialize.

const NOW = "2026-06-21T02:00:00.000Z";
const ctx: RequestContext = { userId: "user-1", requestId: "req-1", source: "user" };
const ep = (id: string, isList = false) => ({ id, isList }) as unknown as Endpoint;

function deterministicDeps() {
  const counters = new Map<string, number>();
  return {
    now: () => NOW,
    nextId: (prefix: string) => {
      const n = (counters.get(prefix) ?? 0) + 1;
      counters.set(prefix, n);
      return `${prefix}-c-${n}`;
    },
  };
}

let db: Db;
let transport: Transport;

beforeEach(async () => {
  ({ db } = await createDb());
  const repo = createKnowledgeRepository(db, deterministicDeps());
  const service = createKnowledgeService(repo);
  transport = createKnowledgeTransport(() => service);
});

async function call(id: string, input: unknown, isList = false) {
  return transport.request(ep(id, isList), input as never, ctx);
}

describe("knowledge.transport — 5-op contract conformance", () => {
  it("knowledge.create / list / get → KnowledgeItemResource", async () => {
    const created = await call("knowledge.create", {
      body: { title: "笔记", knowledgeType: "note", content: "v1" },
    });
    expect(() =>
      successEnvelope(knowledgeItemResource).parse(created),
    ).not.toThrow();
    const knowledgeId = (created as { data: { id: string } }).data.id;

    const list = await call("knowledge.list", { query: { page: 1, pageSize: 50 } }, true);
    const parsedList = listEnvelope(knowledgeItemResource).parse(list);
    expect(parsedList.data.length).toBe(1);
    // nullable sourceUrl/archivedAt serialize as null.
    expect(parsedList.data[0]!.sourceUrl).toBeNull();
    expect(parsedList.data[0]!.archivedAt).toBeNull();

    const got = await call("knowledge.get", { params: { knowledgeId } });
    expect(() => successEnvelope(knowledgeItemResource).parse(got)).not.toThrow();
  });

  it("knowledge.revisions.create → KnowledgeRevisionResource", async () => {
    const created = await call("knowledge.create", { body: { title: "笔记", content: "v1" } });
    const knowledgeId = (created as { data: { id: string } }).data.id;

    const rev = await call("knowledge.revisions.create", {
      params: { knowledgeId },
      body: { content: "v2" },
    });
    const parsed = successEnvelope(knowledgeRevisionResource).parse(rev);
    expect(parsed.data.revisionNumber).toBe(2);
    expect(parsed.data.structuredData).toEqual({});
  });

  it("knowledge.relations.create → KnowledgeRelationResource (numeric strength)", async () => {
    const a = await call("knowledge.create", { body: { title: "A" } });
    const b = await call("knowledge.create", { body: { title: "B" } });
    const aId = (a as { data: { id: string } }).data.id;
    const bId = (b as { data: { id: string } }).data.id;

    const rel = await call("knowledge.relations.create", {
      params: { knowledgeId: aId },
      body: { targetKnowledgeId: bId, relationType: "supports" },
    });
    const parsed = successEnvelope(knowledgeRelationResource).parse(rel);
    expect(typeof parsed.data.strength).toBe("number");
    expect(parsed.data.relationType).toBe("supports");
    expect(parsed.data.createdByType).toBe("user");
  });

  it("covers all 5 op ids + unknown → UnsupportedOperationError", async () => {
    const ids = Object.values(ENDPOINTS)
      .filter((e) =>
        [
          "knowledge.list",
          "knowledge.create",
          "knowledge.get",
          "knowledge.revisions.create",
          "knowledge.relations.create",
        ].includes(e.id),
      )
      .map((e) => e.id);
    expect(ids).toHaveLength(5);

    await expect(
      transport.request(ep("knowledge.nope"), {} as never, ctx),
    ).rejects.toBeInstanceOf(UnsupportedOperationError);
  });
});
