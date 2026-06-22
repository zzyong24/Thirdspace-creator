import { describe, it, expect, beforeEach } from "vitest";
import { createDb, type Db } from "@creatoros/backend";
import {
  tagResource,
  entityTagResource,
  type RequestContext,
} from "@creatoros/contract";
import { createTaxonomyRepository } from "./taxonomy.repository";
import {
  createTaxonomyService,
  type TaxonomyService,
} from "./taxonomy.service";
import {
  TagNotFoundError,
  DuplicateTagError,
  InvalidEntityRefError,
} from "./taxonomy.errors";

// Step 6a — service unit tests (pglite-backed via the real repository, so the
// DB unique constraints drive DuplicateTagError). Deterministic ids/clock.

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

describe("taxonomy.service", () => {
  let db: Db;
  let service: TaxonomyService;

  beforeEach(async () => {
    ({ db } = await createDb());
    const repo = createTaxonomyRepository(db, makeDeps());
    service = createTaxonomyService(repo);
  });

  it("createTag returns a contract-valid TagResource", async () => {
    const tag = await service.createTag(ctxA, { name: "运营", color: "#abc" });
    expect(() => tagResource.parse(tag)).not.toThrow();
    expect(tag.name).toBe("运营");
    expect(tag.userId).toBe("user-a");
    expect(tag.usageCount).toBe(0);
  });

  it("createTag trims and rejects a blank name", async () => {
    await expect(
      service.createTag(ctxA, { name: "   " }),
    ).rejects.toBeInstanceOf(InvalidEntityRefError);
  });

  it("createTag duplicate name → DuplicateTagError (409)", async () => {
    await service.createTag(ctxA, { name: "dup" });
    await expect(
      service.createTag(ctxA, { name: "dup" }),
    ).rejects.toBeInstanceOf(DuplicateTagError);
  });

  it("renameTag of a foreign/unknown tag → TagNotFoundError (404)", async () => {
    const tag = await service.createTag(ctxA, { name: "mine" });
    await expect(
      service.renameTag(ctxB, tag.id, { name: "hijack" }),
    ).rejects.toBeInstanceOf(TagNotFoundError);
  });

  it("assignTags with a bad entityType → InvalidEntityRefError (400)", async () => {
    const tag = await service.createTag(ctxA, { name: "t" });
    await expect(
      service.assignTags(ctxA, {
        entityType: "nonsense" as never,
        entityId: "x-1",
        tagIds: [tag.id],
      }),
    ).rejects.toBeInstanceOf(InvalidEntityRefError);
  });

  it("assignTags of a foreign tagId → TagNotFoundError (404)", async () => {
    const tagB = await service.createTag(ctxB, { name: "b-tag" });
    await expect(
      service.assignTags(ctxA, {
        entityType: "project",
        entityId: "p-1",
        tagIds: [tagB.id],
      }),
    ).rejects.toBeInstanceOf(TagNotFoundError);
  });

  it("assignTags returns contract-valid EntityTagResource[] and is idempotent", async () => {
    const tag = await service.createTag(ctxA, { name: "t" });
    const first = await service.assignTags(ctxA, {
      entityType: "project",
      entityId: "p-1",
      tagIds: [tag.id],
    });
    expect(first).toHaveLength(1);
    expect(() => entityTagResource.parse(first[0])).not.toThrow();

    const again = await service.assignTags(ctxA, {
      entityType: "project",
      entityId: "p-1",
      tagIds: [tag.id],
    });
    expect(again).toHaveLength(1);
    expect(again[0]!.id).toBe(first[0]!.id);
  });

  it("assignTags bumps usageCount; removeTag decrements it", async () => {
    const tag = await service.createTag(ctxA, { name: "t" });
    await service.assignTags(ctxA, {
      entityType: "project",
      entityId: "p-1",
      tagIds: [tag.id],
    });
    let tags = await service.listTags(ctxA, {});
    expect(tags.find((t) => t.id === tag.id)?.usageCount).toBe(1);

    await service.removeTag(ctxA, {
      entityType: "project",
      entityId: "p-1",
      tagId: tag.id,
    });
    tags = await service.listTags(ctxA, {});
    expect(tags.find((t) => t.id === tag.id)?.usageCount).toBe(0);
  });

  it("removeTag of an already-absent assignment is a no-op (idempotent, no 404)", async () => {
    const tag = await service.createTag(ctxA, { name: "t" });
    await expect(
      service.removeTag(ctxA, {
        entityType: "project",
        entityId: "never-tagged",
        tagId: tag.id,
      }),
    ).resolves.toBeUndefined();
  });

  it("deleteTag removes the tag AND its entity_tags (cascade)", async () => {
    const tag = await service.createTag(ctxA, { name: "t" });
    await service.assignTags(ctxA, {
      entityType: "knowledge",
      entityId: "k-1",
      tagIds: [tag.id],
    });
    const deleted = await service.deleteTag(ctxA, tag.id);
    expect(deleted.id).toBe(tag.id);

    const tags = await service.listTags(ctxA, {});
    expect(tags.find((t) => t.id === tag.id)).toBeUndefined();
    // The cascade leaves no entity_tags pointing at the deleted tag.
    await expect(
      service.listEntitiesForTag(ctxA, tag.id, {}),
    ).rejects.toBeInstanceOf(TagNotFoundError);
  });

  it("deleteTag of a foreign tag → TagNotFoundError (404)", async () => {
    const tag = await service.createTag(ctxA, { name: "t" });
    await expect(service.deleteTag(ctxB, tag.id)).rejects.toBeInstanceOf(
      TagNotFoundError,
    );
  });

  it("listEntitiesForTag gates ownership (foreign tag → 404)", async () => {
    const tag = await service.createTag(ctxA, { name: "t" });
    await expect(
      service.listEntitiesForTag(ctxB, tag.id, {}),
    ).rejects.toBeInstanceOf(TagNotFoundError);
  });

  it("REUSABILITY: one tag assigns to both a project and a knowledge entity (SPEC §22)", async () => {
    const tag = await service.createTag(ctxA, { name: "复用" });
    await service.assignTags(ctxA, {
      entityType: "project",
      entityId: "p-1",
      tagIds: [tag.id],
    });
    await service.assignTags(ctxA, {
      entityType: "knowledge",
      entityId: "k-9",
      tagIds: [tag.id],
    });
    const forProject = await service.listTagsForEntity(ctxA, {
      entityType: "project",
      entityId: "p-1",
    });
    const forKnowledge = await service.listTagsForEntity(ctxA, {
      entityType: "knowledge",
      entityId: "k-9",
    });
    expect(forProject.map((t) => t.id)).toEqual([tag.id]);
    expect(forKnowledge.map((t) => t.id)).toEqual([tag.id]);

    const entities = await service.listEntitiesForTag(ctxA, tag.id, {});
    expect(entities.map((e) => `${e.entityType}:${e.entityId}`).sort()).toEqual([
      "knowledge:k-9",
      "project:p-1",
    ]);
  });
});
