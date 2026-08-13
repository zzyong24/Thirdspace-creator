import { describe, it, expect, beforeEach } from "vitest";
import { createDb, type Db } from "@creatoros/backend";
import type { RequestContext } from "@creatoros/contract";
import {
  createMaterialLinksService,
  type MaterialLinksService,
} from "./material-links.service";
import { OwnershipError, ValidationError } from "./material-links.errors";

// Step 3 (service, fake now/nextId, pglite db) — create→list visibility, cross-project
// isolation, delete, cross-user delete 404-class, and the entityType validation guard.
// Mirrors the realized platform-account service test.

const NOW = "2026-06-22T00:00:00.000Z";
const ctxA: RequestContext = { userId: "user-a", requestId: "r1", source: "user" };
const ctxB: RequestContext = { userId: "user-b", requestId: "r2", source: "user" };

function makeService(db: Db): MaterialLinksService {
  let seq = 0;
  return createMaterialLinksService({
    db,
    now: () => NOW,
    nextId: (prefix: string) => `${prefix}-${++seq}`,
  });
}

describe("material-links service", () => {
  let db: Db;
  let svc: MaterialLinksService;
  beforeEach(async () => {
    ({ db } = await createDb());
    svc = makeService(db);
  });

  it("create → list sees the link (defaults role/stage/addedByType)", async () => {
    const link = await svc.create(ctxA, {
      projectId: "proj-1",
      entityType: "knowledge",
      entityId: "k-1",
    });
    expect(link).toMatchObject({
      projectId: "proj-1",
      entityType: "knowledge",
      entityId: "k-1",
      role: "reference",
      stage: "research",
      addedByType: "user",
      contentOutputId: null,
    });

    const listed = await svc.list(ctxA, {
      projectId: "proj-1",
      page: 1,
      pageSize: 100,
    });
    expect(listed.total).toBe(1);
    expect(listed.rows[0]?.id).toBe(link.id);
  });

  it("同一项目/实体/角色/阶段重复保存返回同一条 link", async () => {
    const first = await svc.create(ctxA, {
      projectId: "proj-1",
      entityType: "asset",
      entityId: "asset-web-1",
      role: "reference",
      stage: "script",
      addedByType: "ai",
    });
    const retry = await svc.create(ctxA, {
      projectId: "proj-1",
      entityType: "asset",
      entityId: "asset-web-1",
      role: "reference",
      stage: "script",
      addedByType: "ai",
    });
    expect(retry.id).toBe(first.id);
    expect((await svc.list(ctxA, { projectId: "proj-1", page: 1, pageSize: 100 })).total).toBe(1);
  });

  // [T-146 切片 b] priority 自动派生(用户裁决②:二元自动,用户上传 = 最高)。规则在
  // SERVICE 层(本仓枚举一律 service 校验,不加 DB CHECK):addedByType='user'(含默认)→ high;
  // addedByType='ai'(AI 找的二手素材)→ normal。显式传 priority 覆盖派生(逃生口)。
  it("derives priority=high for user-added links (default addedByType)", async () => {
    const link = await svc.create(ctxA, {
      projectId: "proj-1",
      entityType: "asset",
      entityId: "a-1",
    });
    expect(link.priority).toBe("high");
  });

  it("derives priority=high when addedByType explicitly 'user'", async () => {
    const link = await svc.create(ctxA, {
      projectId: "proj-1",
      entityType: "asset",
      entityId: "a-1",
      addedByType: "user",
    });
    expect(link.priority).toBe("high");
  });

  it("derives priority=normal for AI-found links (addedByType='ai')", async () => {
    const link = await svc.create(ctxA, {
      projectId: "proj-1",
      entityType: "asset",
      entityId: "a-1",
      addedByType: "ai",
    });
    expect(link.priority).toBe("normal");
  });

  it("an explicit priority overrides the addedByType derivation", async () => {
    const link = await svc.create(ctxA, {
      projectId: "proj-1",
      entityType: "asset",
      entityId: "a-1",
      addedByType: "ai",
      priority: "high",
    });
    expect(link.priority).toBe("high");
  });

  it("rejects an unknown priority with ValidationError", async () => {
    await expect(
      svc.create(ctxA, {
        projectId: "proj-1",
        entityType: "asset",
        entityId: "a-1",
        priority: "urgent" as unknown as "high",
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("is cross-project isolated (a link on project B not returned for project A)", async () => {
    await svc.create(ctxA, {
      projectId: "proj-a",
      entityType: "asset",
      entityId: "a-1",
    });
    await svc.create(ctxA, {
      projectId: "proj-b",
      entityType: "asset",
      entityId: "a-2",
    });

    const a = await svc.list(ctxA, {
      projectId: "proj-a",
      page: 1,
      pageSize: 100,
    });
    expect(a.total).toBe(1);
    expect(a.rows[0]?.entityId).toBe("a-1");
  });

  it("delete removes the link", async () => {
    const link = await svc.create(ctxA, {
      projectId: "proj-1",
      entityType: "knowledge",
      entityId: "k-1",
    });
    const deleted = await svc.delete(ctxA, link.id);
    expect(deleted.id).toBe(link.id);

    const listed = await svc.list(ctxA, {
      projectId: "proj-1",
      page: 1,
      pageSize: 100,
    });
    expect(listed.total).toBe(0);
  });

  it("cross-user delete → OwnershipError (404-class)", async () => {
    const link = await svc.create(ctxA, {
      projectId: "proj-1",
      entityType: "knowledge",
      entityId: "k-1",
    });
    await expect(svc.delete(ctxB, link.id)).rejects.toBeInstanceOf(
      OwnershipError,
    );
    // The link is untouched for its owner.
    const listed = await svc.list(ctxA, {
      projectId: "proj-1",
      page: 1,
      pageSize: 100,
    });
    expect(listed.total).toBe(1);
  });

  it("rejects an unknown entityType with ValidationError", async () => {
    await expect(
      svc.create(ctxA, {
        projectId: "proj-1",
        entityType: "video" as unknown as "knowledge",
        entityId: "x-1",
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("list is user-scoped (B never sees A's project links)", async () => {
    await svc.create(ctxA, {
      projectId: "shared-proj",
      entityType: "knowledge",
      entityId: "k-1",
    });
    const b = await svc.list(ctxB, {
      projectId: "shared-proj",
      page: 1,
      pageSize: 100,
    });
    expect(b.total).toBe(0);
  });
});
