import { describe, it, expect, beforeEach } from "vitest";
import { createDb, type Db, UnsupportedOperationError } from "@creatoros/backend";
import {
  tagResource,
  entityTagResource,
  type Endpoint,
  type RequestContext,
  type Transport,
} from "@creatoros/contract";
import { createTaxonomyRepository } from "./taxonomy.repository";
import { createTaxonomyService } from "./taxonomy.service";
import { createTaxonomyTransport } from "./taxonomy.transport";

// Step 6c — drive each of the 8 transport handlers and assert the output parses
// against the Step-0 contract DTO; list ops yield the `{data,meta}` envelope;
// unknown op id → UnsupportedOperationError.

const ep = (id: string, isList = false) => ({ id, isList }) as unknown as Endpoint;

const ctx: RequestContext = {
  userId: "user-c",
  requestId: "req-c",
  source: "user",
};

const FIXED_NOW = "2026-06-13T02:00:00.000Z";

describe("taxonomy.transport (contract conformance)", () => {
  let transport: Transport;

  beforeEach(async () => {
    const { db } = await createDb();
    let n = 0;
    const repo = createTaxonomyRepository(db as Db, {
      now: () => FIXED_NOW,
      nextId: (prefix) => `${prefix}-${++n}`,
    });
    transport = createTaxonomyTransport(() => createTaxonomyService(repo));
  });

  async function call(id: string, input: unknown, isList = false) {
    return transport.request(ep(id, isList), input as never, ctx);
  }

  it("tags.create → TagResource envelope", async () => {
    const res = (await call("taxonomy.tags.create", {
      body: { name: "t1", color: "#123" },
    })) as { data: unknown; meta: { requestId: string } };
    expect(() => tagResource.parse(res.data)).not.toThrow();
    expect(res.meta.requestId).toBe("persistence");
  });

  it("tags.list → { data: TagResource[], meta } list envelope", async () => {
    await call("taxonomy.tags.create", { body: { name: "t1" } });
    const res = (await call(
      "taxonomy.tags.list",
      { query: { page: 1, pageSize: 20 } },
      true,
    )) as { data: unknown[]; meta: { total: number } };
    expect(Array.isArray(res.data)).toBe(true);
    res.data.forEach((row) => expect(() => tagResource.parse(row)).not.toThrow());
    expect(res.meta.total).toBe(res.data.length);
  });

  it("tags.patch → TagResource envelope", async () => {
    const created = (await call("taxonomy.tags.create", {
      body: { name: "t1" },
    })) as { data: { id: string } };
    const res = (await call("taxonomy.tags.patch", {
      params: { tagId: created.data.id },
      body: { name: "renamed" },
    })) as { data: unknown };
    const parsed = tagResource.parse(res.data);
    expect(parsed.name).toBe("renamed");
  });

  it("tags.delete → TagResource envelope", async () => {
    const created = (await call("taxonomy.tags.create", {
      body: { name: "t1" },
    })) as { data: { id: string } };
    const res = (await call("taxonomy.tags.delete", {
      params: { tagId: created.data.id },
    })) as { data: unknown };
    expect(() => tagResource.parse(res.data)).not.toThrow();
  });

  it("entityTags.assign → EntityTagResource[] list envelope", async () => {
    const created = (await call("taxonomy.tags.create", {
      body: { name: "t1" },
    })) as { data: { id: string } };
    const res = (await call(
      "taxonomy.entityTags.assign",
      {
        body: {
          entityType: "project",
          entityId: "p-1",
          tagIds: [created.data.id],
        },
      },
      true,
    )) as { data: unknown[]; meta: { total: number } };
    expect(res.data).toHaveLength(1);
    res.data.forEach((row) =>
      expect(() => entityTagResource.parse(row)).not.toThrow(),
    );
    expect(res.meta.total).toBe(1);
  });

  it("entityTags.listForEntity → TagResource[] list envelope", async () => {
    const created = (await call("taxonomy.tags.create", {
      body: { name: "t1" },
    })) as { data: { id: string } };
    await call(
      "taxonomy.entityTags.assign",
      {
        body: {
          entityType: "knowledge",
          entityId: "k-1",
          tagIds: [created.data.id],
        },
      },
      true,
    );
    const res = (await call(
      "taxonomy.entityTags.listForEntity",
      { query: { entityType: "knowledge", entityId: "k-1" } },
      true,
    )) as { data: unknown[] };
    expect(res.data).toHaveLength(1);
    expect(() => tagResource.parse(res.data[0])).not.toThrow();
  });

  it("entityTags.listEntitiesForTag → EntityTagResource[] list envelope", async () => {
    const created = (await call("taxonomy.tags.create", {
      body: { name: "t1" },
    })) as { data: { id: string } };
    await call(
      "taxonomy.entityTags.assign",
      {
        body: {
          entityType: "asset",
          entityId: "a-1",
          tagIds: [created.data.id],
        },
      },
      true,
    );
    const res = (await call(
      "taxonomy.entityTags.listEntitiesForTag",
      { params: { tagId: created.data.id }, query: { page: 1, pageSize: 20 } },
      true,
    )) as { data: unknown[] };
    expect(res.data).toHaveLength(1);
    expect(() => entityTagResource.parse(res.data[0])).not.toThrow();
  });

  it("entityTags.remove → idempotent no-row envelope", async () => {
    const created = (await call("taxonomy.tags.create", {
      body: { name: "t1" },
    })) as { data: { id: string } };
    await call(
      "taxonomy.entityTags.assign",
      {
        body: {
          entityType: "project",
          entityId: "p-1",
          tagIds: [created.data.id],
        },
      },
      true,
    );
    const res = (await call("taxonomy.entityTags.remove", {
      body: { entityType: "project", entityId: "p-1", tagId: created.data.id },
    })) as { data: unknown };
    expect(res.data).toBeNull();
  });

  it("unknown op id → UnsupportedOperationError", async () => {
    await expect(
      call("taxonomy.does.not.exist", { body: {} }),
    ).rejects.toBeInstanceOf(UnsupportedOperationError);
  });
});
