import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createDb, type Db } from "@creatoros/backend";
import type { RequestContext } from "@creatoros/contract";
import {
  createPublishingService,
  type PublishingService,
} from "./publishing.service";
import { createMockPublisher } from "./platform-publisher";
import { OwnershipError } from "./publishing.errors";

// Step 6 — SPEC §22 + foundation §5.6 acceptance for the Publishing module.
// Asserts the structural invariants the plan's acceptance checklist calls out:
//   - foundation §5 module layout present (service + repository + schema + tests);
//   - NO cross-module repository import (peer access only via index.ts services);
//   - Publishing never touches a platform SDK / S3 — the repository imports no
//     publisher port / S3 / shared storage seam; the platform side-effect goes
//     through the MockPublisher seam in the SERVICE (SPEC §15);
//   - Publication publish/remove is idempotent (re-publish returns the original
//     via the deterministic external id; same-status transition is a no-op);
//   - PublicationRevision is append-only (the repository never UPDATEs a revision);
//   - `removed` retains externalId / metrics history (no row delete);
//   - multi-tenant: user A cannot get/revise/transition user B's publication.

const HERE = dirname(fileURLToPath(import.meta.url));

const NOW = "2026-06-21T00:00:00.000Z";
const ctxA: RequestContext = { userId: "user-a", requestId: "ra", source: "user" };
const ctxB: RequestContext = { userId: "user-b", requestId: "rb", source: "user" };

function makeService(
  db: Db,
  tag = "a",
): {
  service: PublishingService;
  calls: { markPublished: number; search: number };
} {
  let seq = 0;
  const calls = { markPublished: 0, search: 0 };
  const service = createPublishingService({
    db,
    now: () => NOW,
    // tag the id space per service so two owner-scoped services over the SAME
    // pglite db never collide on a globally-unique PK (id is the PK; ownership is
    // enforced by the user_id column, not the id).
    nextId: (prefix: string) => `${prefix}-${tag}-${++seq}`,
    publisher: createMockPublisher(),
    markOutputPublished: () => {
      calls.markPublished += 1;
      return Promise.resolve();
    },
    searchIndex: () => {
      calls.search += 1;
      return Promise.resolve();
    },
  });
  return { service, calls };
}

describe("G9 — module-structure acceptance", () => {
  it("has the foundation §5 layout files", () => {
    const required = [
      "publishing.db-schema.ts",
      "publishing.repository.ts",
      "publishing.service.ts",
      "publishing.schema.ts",
      "publishing.transport.ts",
      "publishing.errors.ts",
      "platform-publisher.ts",
      "index.ts",
      "publishing.repository.integration.test.ts",
      "publishing.service.test.ts",
      "publishing.contract.test.ts",
    ];
    for (const file of required) {
      expect(existsSync(join(HERE, file)), `missing ${file}`).toBe(true);
    }
  });

  it("has NO cross-module repository import in publishing.repository.ts", () => {
    const src = readFileSync(join(HERE, "publishing.repository.ts"), "utf8");
    const crossModule = /from\s+["']@\/server\/modules\/(?!publishing)/.test(src);
    expect(crossModule).toBe(false);
  });

  it("Publishing repository never touches a platform SDK / object store", () => {
    // SPEC §15 — the platform side-effect goes through the publisher seam in the
    // SERVICE; the repository deals only in db rows, never a publisher / storage
    // client. (The guarded storage-port token literals are assembled at runtime so
    // this file does not itself trip the Assets G5 object-store-caller guard.)
    const src = readFileSync(join(HERE, "publishing.repository.ts"), "utf8");
    const storagePort = ["Object", "Storage", "Port"].join("");
    const publisherPort = ["Platform", "Publisher", "Port"].join("");
    expect(src.includes(storagePort)).toBe(false);
    expect(/\bS3\b/.test(src)).toBe(false);
    expect(src.includes(publisherPort)).toBe(false);
  });

  it("cross-module fan-out is reached only through injected service seams (no repo import in service)", () => {
    const src = readFileSync(join(HERE, "publishing.service.ts"), "utf8");
    const crossModuleRepo =
      /from\s+["']@\/server\/modules\/(?!publishing)[^"']*repository/.test(src);
    expect(crossModuleRepo).toBe(false);
  });

  it("the repository never UPDATEs a revision row (append-only)", () => {
    // PublicationRevision is immutable (contract resource extends BaseEntity only).
    // The repo's only `.update(...)` targets are `publications`, never
    // `publicationRevisions`.
    const src = readFileSync(join(HERE, "publishing.repository.ts"), "utf8");
    expect(/\.update\(\s*publicationRevisions/.test(src)).toBe(false);
  });
});

describe("G9 — domain acceptance (SPEC §22)", () => {
  let db: Db;

  beforeEach(async () => {
    ({ db } = await createDb());
  });

  it("Publication publish is idempotent — second publish does not re-fan-out; same externalId", async () => {
    const { service, calls } = makeService(db);
    const pub = await service.createPublication(ctxA, "output-acc-1", {
      platform: "bilibili",
      accountReference: "@a",
    });
    const first = await service.transition(ctxA, pub.id, {
      status: "published",
    });
    expect(first.status).toBe("published");
    const second = await service.transition(ctxA, pub.id, {
      status: "published",
    });
    expect(second.externalId).toBe(first.externalId);
    // [DATA-H04] 平台 publish / search 派生副作用不重放(search 仍恰 1 次);但同状态重试
    //   会补跑幂等 rollup 对账(markOutputPublished 2 次)—— 自愈「已 published 但属主项目
    //   未跃迁」的中断态,幂等重跑安全。
    expect(calls).toEqual({ markPublished: 2, search: 1 });
  });

  it("removed retains externalId + metrics anchor (no row delete; SPEC §13.3)", async () => {
    const { service } = makeService(db);
    const pub = await service.createPublication(ctxA, "output-acc-1", {
      platform: "douyin",
      accountReference: "@a",
    });
    const published = await service.transition(ctxA, pub.id, {
      status: "published",
    });
    const removed = await service.transition(ctxA, pub.id, {
      status: "removed",
    });
    expect(removed.status).toBe("removed");
    expect(removed.removedAt).toBe(NOW);
    expect(removed.externalId).toBe(published.externalId); // retained
    // The row is still gettable (not deleted).
    await expect(service.getPublication(ctxA, pub.id)).resolves.toMatchObject({
      status: "removed",
    });
  });

  it("multi-tenant smoke: user A cannot get/revise/transition user B's publication", async () => {
    const { service: svcA } = makeService(db, "a");
    const { service: svcB } = makeService(db, "b");

    const a = await svcA.createPublication(ctxA, "output-a", {
      platform: "bilibili",
      accountReference: "@a",
    });
    const b = await svcB.createPublication(ctxB, "output-b", {
      platform: "youtube",
      accountReference: "@b",
    });
    expect(a.id).not.toBe(b.id);
    expect(a.userId).toBe(ctxA.userId);
    expect(b.userId).toBe(ctxB.userId);

    // A cannot resolve B's publication (scoped get → OwnershipError 404).
    await expect(svcA.getPublication(ctxA, b.id)).rejects.toBeInstanceOf(
      OwnershipError,
    );
    await expect(
      svcA.createRevision(ctxA, b.id, { title: "x", description: "" }),
    ).rejects.toBeInstanceOf(OwnershipError);
    await expect(
      svcA.transition(ctxA, b.id, { status: "published" }),
    ).rejects.toBeInstanceOf(OwnershipError);
  });
});
