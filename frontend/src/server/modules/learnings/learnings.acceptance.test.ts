import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createDb, type Db } from "@creatoros/backend";
import type { RequestContext } from "@creatoros/contract";
import {
  createLearningsService,
  type LearningsService,
  type LearningsProjectsPort,
} from "./learnings.service";
import { OwnershipError } from "./learnings.errors";
import { LEARNINGS_OP_IDS } from "./learnings.transport";

// SPEC §22 + foundation §5.6 acceptance for the Learnings module (plan Step 6).
// Asserts the structural invariants the plan's acceptance checklist calls out:
//   - foundation §5 module layout present (service + repository + schema + errors +
//     transport + index + db-schema + the test trio);
//   - NO cross-module repository import (Projects reached only via the injected port,
//     satisfied at the composition root by the public service);
//   - every repository query is user-scoped (a multi-tenant smoke: A cannot read B's
//     learning);
//   - a Learning is reusable + exists independently of a Project (reviewId nullable,
//     applied to many projects via LearningApplication);
//   - the DTO is built by an explicit mapper (the application DTO never leaks user_id);
//   - the four owned ops are registered;
//   - the bridge/feed reads (promoteReviewInsight / getSuggestions) are on the public
//     service.

const HERE = dirname(fileURLToPath(import.meta.url));
const NOW = "2026-06-21T00:00:00.000Z";
const ctxA: RequestContext = { userId: "user-a", requestId: "ra", source: "user" };
const ctxB: RequestContext = { userId: "user-b", requestId: "rb", source: "user" };

const noopProjects: LearningsProjectsPort = {
  assertOwnsProject: async () => {},
  recordActivity: async () => {},
};

function makeService(db: Db, tag = "a"): LearningsService {
  let seq = 0;
  return createLearningsService({
    db,
    now: () => NOW,
    nextId: (prefix: string) => `${prefix}-${tag}-${++seq}`,
    projects: noopProjects,
  });
}

describe("learnings acceptance (SPEC §22)", () => {
  let db: Db;
  beforeEach(async () => {
    ({ db } = await createDb());
  });

  it("has the foundation §5 module layout files", () => {
    for (const f of [
      "learnings.service.ts",
      "learnings.repository.ts",
      "learnings.schema.ts",
      "learnings.errors.ts",
      "learnings.transport.ts",
      "index.ts",
      "learnings.db-schema.ts",
      "learnings.service.test.ts",
      "learnings.repository.integration.test.ts",
      "learnings.contract.test.ts",
    ]) {
      expect(existsSync(join(HERE, f)), `${f} present`).toBe(true);
    }
  });

  it("imports NO peer module's repository (cross-module access only via injected ports)", () => {
    for (const f of [
      "learnings.service.ts",
      "learnings.repository.ts",
      "learnings.transport.ts",
    ]) {
      const src = readFileSync(join(HERE, f), "utf8");
      expect(
        /from\s+["'][^"']*modules\/(?!learnings)[^"']*\.repository["']/.test(src),
      ).toBe(false);
      expect(/from\s+["']@\/server\/modules\/projects["']/.test(src)).toBe(false);
      expect(/from\s+["']@\/server\/modules\/reviews["']/.test(src)).toBe(false);
    }
  });

  it("user scope: A cannot read B's learning (OwnershipError → 404)", async () => {
    const serviceB = makeService(db, "b");
    const learning = await serviceB.createLearning(ctxB, { title: "B's" });
    const serviceA = makeService(db, "a");
    await expect(
      serviceA.evaluateLearning(ctxA, learning.id, {
        validationStatus: "validated",
      }),
    ).rejects.toBeInstanceOf(OwnershipError);
    const listA = await serviceA.listLearnings(ctxA, { limit: 50, offset: 0 });
    expect(listA.total).toBe(0);
  });

  it("a Learning exists independently of a Project and is reusable across many", async () => {
    const service = makeService(db);
    const learning = await service.createLearning(ctx0(), { title: "reusable" });
    expect(learning.reviewId).toBeNull(); // born without a Review
    // Applied to two different projects via LearningApplication.
    const a = await service.applyLearning(ctx0(), learning.id, {
      projectId: "project-1",
    });
    const b = await service.applyLearning(ctx0(), learning.id, {
      projectId: "project-2",
    });
    expect(a.projectId).toBe("project-1");
    expect(b.projectId).toBe("project-2");
    expect(a.learningId).toBe(learning.id);
    expect(b.learningId).toBe(learning.id);
  });

  it("the application DTO never leaks user_id (built explicitly, not the Drizzle row)", async () => {
    const service = makeService(db);
    const learning = await service.createLearning(ctx0(), { title: "L" });
    const app = await service.applyLearning(ctx0(), learning.id, {
      projectId: "project-1",
    });
    expect(Object.keys(app)).not.toContain("userId");
  });

  it("exposes the Reviews bridge + Wave-4 feed on the public service", async () => {
    const service = makeService(db);
    expect(typeof service.promoteReviewInsight).toBe("function");
    expect(typeof service.getSuggestions).toBe("function");
  });

  it("registers the owned ops into the module op-id list", () => {
    expect([...LEARNINGS_OP_IDS].sort()).toEqual([
      "learnings.applications.create",
      "learnings.create",
      "learnings.evaluate",
      "learnings.get",
      "learnings.list",
    ]);
  });
});

function ctx0(): RequestContext {
  return { userId: "user-a", requestId: "r0", source: "user" };
}
