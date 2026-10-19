import {projects,type Db as FixtureDb} from '@creatoros/backend';
async function seedOwnedProjects(db:FixtureDb){
 const rows=([["project-t730", "user-t730", "account-t730"]] as Array<[string,string,string]>).map(([id,userId,accountId])=>({id,userId,accountId,title:'真实测试父项目',brief:'',creationMode:'guided',status:'active',currentStage:'script',startedAt:new Date().toISOString(),createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()}));
 await db.insert(projects).values(rows).onConflictDoNothing();
}
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
    await seedOwnedProjects(db);
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
