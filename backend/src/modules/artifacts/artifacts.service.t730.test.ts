import { afterEach, describe, expect, it } from "vitest";
import { createDb } from "@creatoros/backend";
import type { RequestContext } from "@creatoros/contract";
import { ConflictError } from "./artifacts.errors";
import { createArtifactsService } from "./artifacts.service";

const ctx: RequestContext = {
  userId: "user-t730",
  accountId: "account-t730",
  requestId: "request-t730",
  source: "user",
};

const clients: Array<{ close(): Promise<void> }> = [];

afterEach(async () => {
  await Promise.all(clients.splice(0).map((client) => client.close()));
});

describe("T-730 artifact 版本并发门", () => {
  it("拒绝旧页面用 stale currentVersionId 追加论点版本", async () => {
    const { db, client } = await createDb();
    clients.push(client);
    let sequence = 0;
    const service = createArtifactsService({
      db,
      now: () => "2026-08-09T02:30:00.000Z",
      nextId: (prefix) => `${prefix}-t730-${++sequence}`,
    });
    const artifact = await service.createArtifact(ctx, {
      projectId: "project-t730",
      title: "论点骨架",
      artifactType: "thesis_tree",
      stage: "planning",
    });
    const staleVersionId = artifact.currentVersionId!;

    await service.createVersion(ctx, artifact.id, {
      expectedCurrentVersionId: staleVersionId,
      contentData: { nodes: [], scriptBasis: { status: "adopted" } },
    });

    await expect(
      service.createVersion(ctx, artifact.id, {
        expectedCurrentVersionId: staleVersionId,
        contentData: { nodes: [], scriptBasis: { status: "inactive" } },
      }),
    ).rejects.toBeInstanceOf(ConflictError);
    await expect(service.listVersions(ctx, artifact.id)).resolves.toHaveLength(2);
  });
});
