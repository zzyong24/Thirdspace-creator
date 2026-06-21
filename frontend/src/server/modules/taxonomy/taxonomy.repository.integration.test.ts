import { describe, it, expect, beforeEach } from "vitest";
import { createDb, type Db } from "@creatoros/backend";
import type { RequestContext } from "@creatoros/contract";
import {
  createTaxonomyRepository,
  type TaxonomyRepository,
} from "./taxonomy.repository";

// Step 6b — pglite-backed repository integration tests. Asserts:
//   - tag + entity_tag round-trip;
//   - unique-constraint rejection for (userId,name) and (tagId,entityType,entityId);
//   - MULTI-TENANT isolation: user A's methods never see user B's rows;
//     findTag(ctxB, tagA.id) === undefined.
// Deterministic deps (fixed clock + counter id generator) keep ids stable.

const FIXED_NOW = "2026-06-13T02:00:00.000Z";

function makeDeps() {
  let n = 0;
  return {
    now: () => FIXED_NOW,
    nextId: (prefix: string) => `${prefix}-${++n}`,
  };
}

const ctxA: RequestContext = {
  userId: "user-a",
  requestId: "req-a",
  source: "user",
};
const ctxB: RequestContext = {
  userId: "user-b",
  requestId: "req-b",
  source: "user",
};

describe("taxonomy.repository (pglite)", () => {
  let db: Db;
  let repo: TaxonomyRepository;

  beforeEach(async () => {
    ({ db } = await createDb());
    repo = createTaxonomyRepository(db, makeDeps());
  });

  it("round-trips a tag and an entity_tag", async () => {
    const tag = await repo.insertTag(ctxA, { name: "运营", color: "#abc" });
    expect(tag.id).toBe("tag-1");
    expect(tag.userId).toBe("user-a");
    expect(tag.name).toBe("运营");
    expect(tag.color).toBe("#abc");
    expect(tag.usageCount).toBe(0);
    expect(tag.createdAt).toBe(FIXED_NOW);

    const found = await repo.findTag(ctxA, tag.id);
    expect(found?.id).toBe(tag.id);

    const et = await repo.insertEntityTag(ctxA, {
      tagId: tag.id,
      entityType: "project",
      entityId: "project-1",
    });
    expect(et.userId).toBe("user-a");
    expect(et.tagId).toBe(tag.id);
    expect(et.entityType).toBe("project");
    expect(et.entityId).toBe("project-1");

    const list = await repo.listTags(ctxA, {});
    expect(list.map((t) => t.id)).toEqual([tag.id]);
  });

  it("rejects a duplicate (userId,name) via the unique index", async () => {
    await repo.insertTag(ctxA, { name: "dup", color: "#111" });
    await expect(
      repo.insertTag(ctxA, { name: "dup", color: "#222" }),
    ).rejects.toThrow();
  });

  it("treats re-assign of (tag,entityType,entityId) as idempotent (one row)", async () => {
    const tag = await repo.insertTag(ctxA, { name: "x", color: "#1" });
    const first = await repo.insertEntityTag(ctxA, {
      tagId: tag.id,
      entityType: "knowledge",
      entityId: "k-1",
    });
    const second = await repo.insertEntityTag(ctxA, {
      tagId: tag.id,
      entityType: "knowledge",
      entityId: "k-1",
    });
    expect(second.id).toBe(first.id);
    const rows = await repo.listEntityTagsForTag(ctxA, tag.id, {});
    expect(rows).toHaveLength(1);
  });

  it("is multi-tenant: A's methods never see B's rows", async () => {
    const tagA = await repo.insertTag(ctxA, { name: "a-tag", color: "#1" });
    const tagB = await repo.insertTag(ctxB, { name: "b-tag", color: "#2" });

    const aList = await repo.listTags(ctxA, {});
    expect(aList.map((t) => t.id)).toEqual([tagA.id]);

    const bList = await repo.listTags(ctxB, {});
    expect(bList.map((t) => t.id)).toEqual([tagB.id]);

    // Cross-user findTag returns undefined (service maps to 404).
    expect(await repo.findTag(ctxB, tagA.id)).toBeUndefined();
    expect(await repo.findTag(ctxA, tagB.id)).toBeUndefined();
  });

  it("scopes entity-tag queries per user", async () => {
    const tagA = await repo.insertTag(ctxA, { name: "shared-name-a", color: "#1" });
    await repo.insertEntityTag(ctxA, {
      tagId: tagA.id,
      entityType: "project",
      entityId: "p-1",
    });
    // B references the same entityId but has no assignment of its own.
    const bForEntity = await repo.listTagsForEntity(ctxB, {
      entityType: "project",
      entityId: "p-1",
    });
    expect(bForEntity).toHaveLength(0);

    const aForEntity = await repo.listTagsForEntity(ctxA, {
      entityType: "project",
      entityId: "p-1",
    });
    expect(aForEntity.map((t) => t.id)).toEqual([tagA.id]);
  });

  it("deletes a tag and its entity_tags scoped to the user", async () => {
    const tag = await repo.insertTag(ctxA, { name: "del", color: "#1" });
    await repo.insertEntityTag(ctxA, {
      tagId: tag.id,
      entityType: "asset",
      entityId: "as-1",
    });
    await repo.deleteEntityTagsForTag(ctxA, tag.id);
    const deleted = await repo.deleteTag(ctxA, tag.id);
    expect(deleted?.id).toBe(tag.id);
    expect(await repo.findTag(ctxA, tag.id)).toBeUndefined();
    expect(await repo.listEntityTagsForTag(ctxA, tag.id, {})).toHaveLength(0);
  });
});
