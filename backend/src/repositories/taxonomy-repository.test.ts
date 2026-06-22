import { describe, it, expect, beforeEach } from "vitest";
import { createDb, type Db } from "../db";
import {
  createTaxonomyRepository,
  type TaxonomyRepository,
} from "./taxonomy-repository";

const FIXED_NOW = "2026-06-13T10:00:00+08:00";

function deterministicDeps(userId = "user-1") {
  const counters = new Map<string, number>();
  return {
    now: () => FIXED_NOW,
    nextId: (prefix: string) => {
      const n = (counters.get(prefix) ?? 0) + 1;
      counters.set(prefix, n);
      return `${prefix}-db-${n}`;
    },
    userId,
  };
}

let db: Db;
let repo: TaxonomyRepository;

beforeEach(async () => {
  ({ db } = await createDb()); // fresh in-memory pglite per test
  repo = createTaxonomyRepository(db, deterministicDeps());
});

describe("TaxonomyRepository (pglite-backed real persistence)", () => {
  it("creates a tag and reads it back from SQL", async () => {
    const created = await repo.createTag({ name: "教程", color: "#ff0000" });
    expect(created.id).toBe("tag-db-1");
    expect(created.userId).toBe("user-1");
    expect(created.name).toBe("教程");
    expect(created.color).toBe("#ff0000");
    expect(created.usageCount).toBe(0);

    const fetched = await repo.getTag("tag-db-1");
    expect(fetched.name).toBe("教程");

    const list = await repo.listTags();
    expect(list.map((t) => t.id)).toContain("tag-db-1");
  });

  it("defaults color when omitted", async () => {
    const created = await repo.createTag({ name: "默认色" });
    expect(created.color).toBe("#888888");
    expect(created.kind).toBeNull();
  });

  it("throws for a missing tag", async () => {
    await expect(repo.getTag("nope")).rejects.toThrow(/not found/);
  });

  it("is idempotent on (user, name): re-create returns the same row", async () => {
    const first = await repo.createTag({ name: "重复" });
    const second = await repo.createTag({ name: "重复" });
    expect(second.id).toBe(first.id);

    const list = await repo.listTags();
    expect(list.filter((t) => t.name === "重复")).toHaveLength(1);
  });

  it("attaches a tag to an entity and lists it for that entity", async () => {
    const tag = await repo.createTag({ name: "草稿" });
    const join = await repo.attach({
      tagId: tag.id,
      entityType: "project",
      entityId: "project-1",
    });
    expect(join.tagId).toBe(tag.id);
    expect(join.entityType).toBe("project");
    expect(join.entityId).toBe("project-1");
    expect(join.userId).toBe("user-1");

    const forEntity = await repo.listForEntity({
      entityType: "project",
      entityId: "project-1",
    });
    expect(forEntity.map((t) => t.id)).toEqual([tag.id]);

    // usageCount derived counter bumped on first attach.
    expect((await repo.getTag(tag.id)).usageCount).toBe(1);
  });

  it("attach is idempotent: re-attaching is a no-op (no duplicate, no double-count)", async () => {
    const tag = await repo.createTag({ name: "标签" });
    const first = await repo.attach({
      tagId: tag.id,
      entityType: "artifact",
      entityId: "artifact-1",
    });
    const second = await repo.attach({
      tagId: tag.id,
      entityType: "artifact",
      entityId: "artifact-1",
    });
    expect(second.id).toBe(first.id);

    const joins = await repo.listEntitiesForTag(tag.id);
    expect(joins).toHaveLength(1);
    expect((await repo.getTag(tag.id)).usageCount).toBe(1);
  });

  it("lists entities for a tag across polymorphic entity types", async () => {
    const tag = await repo.createTag({ name: "多类型" });
    await repo.attach({ tagId: tag.id, entityType: "project", entityId: "p-1" });
    await repo.attach({ tagId: tag.id, entityType: "knowledge", entityId: "k-1" });

    const joins = await repo.listEntitiesForTag(tag.id);
    expect(joins).toHaveLength(2);
    expect(joins.map((j) => j.entityType).sort()).toEqual([
      "knowledge",
      "project",
    ]);
    expect((await repo.getTag(tag.id)).usageCount).toBe(2);
  });

  it("detaches a tag and decrements usageCount", async () => {
    const tag = await repo.createTag({ name: "去除" });
    await repo.attach({ tagId: tag.id, entityType: "asset", entityId: "a-1" });
    expect((await repo.getTag(tag.id)).usageCount).toBe(1);

    await repo.detach({ tagId: tag.id, entityType: "asset", entityId: "a-1" });
    expect((await repo.getTag(tag.id)).usageCount).toBe(0);

    const forEntity = await repo.listForEntity({
      entityType: "asset",
      entityId: "a-1",
    });
    expect(forEntity).toEqual([]);
  });

  it("detach of a non-existent assignment is a no-op (no underflow)", async () => {
    const tag = await repo.createTag({ name: "空操作" });
    await repo.detach({ tagId: tag.id, entityType: "asset", entityId: "ghost" });
    expect((await repo.getTag(tag.id)).usageCount).toBe(0);
  });

  it("denies cross-user access (ownership boundary)", async () => {
    const mine = await repo.createTag({ name: "私有标签" });

    const otherRepo = createTaxonomyRepository(db, deterministicDeps("user-2"));
    await expect(otherRepo.getTag(mine.id)).rejects.toThrow(/not found/);
    await expect(
      otherRepo.attach({
        tagId: mine.id,
        entityType: "project",
        entityId: "p-1",
      }),
    ).rejects.toThrow(/not found/);
    await expect(otherRepo.listEntitiesForTag(mine.id)).rejects.toThrow(
      /not found/,
    );

    const otherList = await otherRepo.listTags();
    expect(otherList.map((t) => t.id)).not.toContain(mine.id);
  });

  it("seeds tags idempotently", async () => {
    const seedRow = {
      id: "seed-tag-1",
      userId: "user-1",
      name: "种子标签",
      color: "#123456",
      kind: null,
      usageCount: 0,
      createdAt: FIXED_NOW,
      updatedAt: FIXED_NOW,
    };
    await repo.seedTags([seedRow]);
    await repo.seedTags([seedRow]); // again — conflict ignored
    const list = await repo.listTags();
    expect(list.filter((t) => t.id === "seed-tag-1")).toHaveLength(1);
  });
});
