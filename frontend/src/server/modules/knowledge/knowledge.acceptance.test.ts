import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createDb, type Db } from "@creatoros/backend";
import type { RequestContext } from "@creatoros/contract";
import { createKnowledgeRepository } from "./knowledge.repository";
import { createKnowledgeService } from "./knowledge.service";
import { OwnershipError } from "./knowledge.errors";

// G1/G2 — SPEC §22 + foundation §5.6 acceptance for the Knowledge module.

const HERE = dirname(fileURLToPath(import.meta.url));

const NOW = "2026-06-21T00:00:00.000Z";
function deterministicDeps() {
  const counters = new Map<string, number>();
  return {
    now: () => NOW,
    nextId: (prefix: string) => {
      const n = (counters.get(prefix) ?? 0) + 1;
      counters.set(prefix, n);
      return `${prefix}-${n}`;
    },
  };
}
const ctxA: RequestContext = { userId: "user-a", requestId: "ra", source: "user" };
const ctxB: RequestContext = { userId: "user-b", requestId: "rb", source: "user" };

describe("G1 — module-structure acceptance", () => {
  it("has the foundation §5 layout files", () => {
    const required = [
      "knowledge.db-schema.ts",
      "knowledge.repository.ts",
      "knowledge.service.ts",
      "knowledge.schema.ts",
      "knowledge.transport.ts",
      "knowledge.errors.ts",
      "index.ts",
      "knowledge.repository.integration.test.ts",
      "knowledge.service.test.ts",
      "knowledge.contract.test.ts",
    ];
    for (const file of required) {
      expect(existsSync(join(HERE, file)), `missing ${file}`).toBe(true);
    }
  });

  it("has NO cross-module repository import in knowledge.repository.ts", () => {
    const src = readFileSync(join(HERE, "knowledge.repository.ts"), "utf8");
    // The repo may import from identity ONLY via the errors module (OwnershipError),
    // which it imports from ./knowledge.errors — not directly from another module's
    // internals. Assert no `modules/<other>` import appears in the repo file.
    const crossModule = /from\s+["']@\/server\/modules\/(?!knowledge)/.test(src);
    expect(crossModule).toBe(false);
  });
});

describe("G2 — domain acceptance (SPEC §22)", () => {
  let db: Db;
  let service: ReturnType<typeof createKnowledgeService>;
  let repo: ReturnType<typeof createKnowledgeRepository>;

  beforeEach(async () => {
    ({ db } = await createDb());
    repo = createKnowledgeRepository(db, deterministicDeps());
    service = createKnowledgeService(repo);
  });

  it("KnowledgeRevision is append-only/immutable (rev #1 byte-identical after rev #2)", async () => {
    const item = await service.createKnowledge(ctxA, { title: "T", content: "v1" });
    const firstRevId = item.currentRevisionId;
    const before = await repo.getRevision(ctxA.userId, firstRevId);
    await service.createRevision(ctxA, item.id, { content: "v2" });
    const after = await repo.getRevision(ctxA.userId, firstRevId);
    expect(after).toEqual(before);
  });

  it("Knowledge exists & is reusable outside a Project (createKnowledge needs no projectId)", async () => {
    const item = await service.createKnowledge(ctxA, { title: "独立条目" });
    // No projectId in the create surface or the row — the project linkage lives in
    // a separate ProjectKnowledge join (out of this module's op surface).
    expect(item).not.toHaveProperty("projectId");
    expect(item.status).toBe("active");
  });

  it("multi-tenant smoke: user A cannot list/get/revise/relate user B's knowledge", async () => {
    const a = await service.createKnowledge(ctxA, { title: "A 的" });
    const b = await service.createKnowledge(ctxB, { title: "B 的" });

    const aList = await service.listKnowledge(ctxA);
    expect(aList.every((row) => row.userId === ctxA.userId)).toBe(true);
    expect(aList.some((row) => row.id === b.id)).toBe(false);

    await expect(service.getKnowledge(ctxA, b.id)).rejects.toBeInstanceOf(
      OwnershipError,
    );
    await expect(
      service.createRevision(ctxA, b.id, { content: "x" }),
    ).rejects.toBeInstanceOf(OwnershipError);
    await expect(
      service.createRelation(ctxA, a.id, {
        targetKnowledgeId: b.id,
        relationType: "references",
      }),
    ).rejects.toBeInstanceOf(OwnershipError);
  });
});
