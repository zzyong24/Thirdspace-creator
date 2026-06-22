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
