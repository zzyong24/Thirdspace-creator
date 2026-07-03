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

// E1 — drive each of the 7 ops through the transport against a seeded pglite db
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

describe("knowledge.transport — 7-op contract conformance", () => {
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
    // [T-079a] 战绩投影缺省真值:未被用料链引用 → 0/false;sourceNote 缺省 null。
    expect(parsedList.data[0]!.sourceNote).toBeNull();
    expect(parsedList.data[0]!.usedCount).toBe(0);
    expect(parsedList.data[0]!.usedInPublished).toBe(false);
  });

  // [T-079a] 四原子 create + sourceNote 透传(SPEC 2026-07-03 §1)。
  it("knowledge.create with atom type + sourceNote → 契约往返", async () => {
    const created = await call("knowledge.create", {
      body: {
        title: "92% 的开发者在工作中会用到 AI 编码工具",
        knowledgeType: "evidence",
        content: "",
        sourceNote: "Stack Overflow Developer Survey 2024",
      },
    });
    const parsed = successEnvelope(knowledgeItemResource).parse(created);
    expect(parsed.data.knowledgeType).toBe("evidence");
    expect(parsed.data.sourceNote).toBe("Stack Overflow Developer Survey 2024");
    expect(parsed.data.usedCount).toBe(0);
    expect(parsed.data.usedInPublished).toBe(false);
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

  it("knowledge.revisions.list → KnowledgeRevisionResource[] (head first, content readable)", async () => {
    const created = await call("knowledge.create", { body: { title: "笔记", content: "v1" } });
    const knowledgeId = (created as { data: { id: string } }).data.id;
    await call("knowledge.revisions.create", {
      params: { knowledgeId },
      body: { content: "v2" },
    });

    const list = await call("knowledge.revisions.list", { params: { knowledgeId } }, true);
    const parsed = listEnvelope(knowledgeRevisionResource).parse(list);
    // Newest-first: rows[0] is the head revision (#2) carrying the current content.
    expect(parsed.data.length).toBe(2);
    expect(parsed.data[0]!.revisionNumber).toBe(2);
    expect(parsed.data[0]!.content).toBe("v2");
  });

  it("knowledge.relations.list → KnowledgeRelationResource[] (numeric strength)", async () => {
    const a = await call("knowledge.create", { body: { title: "A" } });
    const b = await call("knowledge.create", { body: { title: "B" } });
    const aId = (a as { data: { id: string } }).data.id;
    const bId = (b as { data: { id: string } }).data.id;
    await call("knowledge.relations.create", {
      params: { knowledgeId: aId },
      body: { targetKnowledgeId: bId, relationType: "supports" },
    });

    const list = await call("knowledge.relations.list", { params: { knowledgeId: aId } }, true);
    const parsed = listEnvelope(knowledgeRelationResource).parse(list);
    expect(parsed.data.length).toBe(1);
    expect(typeof parsed.data[0]!.strength).toBe("number");
    expect(parsed.data[0]!.targetKnowledgeId).toBe(bId);
  });

  it("empty relations.list still satisfies the list envelope (pageSize ≥ 1)", async () => {
    const a = await call("knowledge.create", { body: { title: "lonely" } });
    const aId = (a as { data: { id: string } }).data.id;
    const list = await call("knowledge.relations.list", { params: { knowledgeId: aId } }, true);
    const parsed = listEnvelope(knowledgeRelationResource).parse(list);
    expect(parsed.data).toEqual([]);
    expect(parsed.meta.total).toBe(0);
  });

  it("covers all 7 op ids + unknown → UnsupportedOperationError", async () => {
    const ids = Object.values(ENDPOINTS)
      .filter((e) =>
        [
          "knowledge.list",
          "knowledge.create",
          "knowledge.get",
          "knowledge.revisions.create",
          "knowledge.revisions.list",
          "knowledge.relations.create",
          "knowledge.relations.list",
        ].includes(e.id),
      )
      .map((e) => e.id);
    expect(ids).toHaveLength(7);

    await expect(
      transport.request(ep("knowledge.nope"), {} as never, ctx),
    ).rejects.toBeInstanceOf(UnsupportedOperationError);
  });
});
