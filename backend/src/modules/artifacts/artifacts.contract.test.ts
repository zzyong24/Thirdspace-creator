import {projects,type Db as FixtureDb} from '@creatoros/backend';
async function seedOwnedProjects(db:FixtureDb){
 const rows=([["project-1", "user-1", "acct-1"]] as Array<[string,string,string]>).map(([id,userId,accountId])=>({id,userId,accountId,title:'真实测试父项目',brief:'',creationMode:'guided',status:'active',currentStage:'script',startedAt:new Date().toISOString(),createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()}));
 await db.insert(projects).values(rows).onConflictDoNothing();
}
import { describe, it, expect, beforeEach } from "vitest";
import { createDb, type Db } from "@creatoros/backend";
import {
  successEnvelope,
  listEnvelope,
  type Endpoint,
  type RequestContext,
  type Transport,
} from "@creatoros/contract";
import { createArtifactsService } from "./artifacts.service";
import { createArtifactsTransport } from "./artifacts.transport";
import {
  artifactResource,
  artifactVersionResource,
  artifactRelationResource,
} from "./artifacts.schema";

// Step 4 — drive each of the 8 ops through the transport against a real pglite db
// and assert the envelope `data` validates against the op's contract response DTO
// (foundation §5.4). Confirms currentVersionId/contentOutputId nullability,
// integer versionNumber, record contentData, enum coercion, and the list meta
// envelope (requestId + page/pageSize/total).

// [T-332 S2] strict 门下 ctx 必带号。
const ctx: RequestContext = {
  userId: "user-1",
  requestId: "req-1",
  source: "user",
  accountId: "acct-1",
};
const ep = (id: string, isList = false) =>
  ({ id, isList }) as unknown as Endpoint;

let db: Db;
let transport: Transport;

beforeEach(async () => {
  ({ db } = await createDb());
  await seedOwnedProjects(db);
  let seq = 0;
  const service = createArtifactsService({
    db,
    now: () => "2026-06-21T04:00:00.000Z",
    nextId: (prefix: string) => `${prefix}-${++seq}`,
  });
  transport = createArtifactsTransport(() => service);
});

async function call(id: string, input: unknown, isList = false) {
  return transport.request(ep(id, isList), input as never, ctx);
}

async function makeArtifact(title = "脚本"): Promise<string> {
  const res = await call("artifacts.create", {
    params: { projectId: "project-1" },
    body: { title, artifactType: "master_script", stage: "script" },
  });
  return (res as { data: { id: string } }).data.id;
}

describe("artifacts.transport — 8-op contract conformance", () => {
  it("artifacts.create / get → artifactResource", async () => {
    const created = await call("artifacts.create", {
      params: { projectId: "project-1" },
      body: { title: "主脚本", artifactType: "master_script", stage: "script" },
    });
    const parsed = successEnvelope(artifactResource).parse(created);
    expect(parsed.data.status).toBe("drafting");
    expect(parsed.data.currentVersionId).toBeTruthy();
    expect(parsed.data.contentOutputId).toBeNull();

    const got = await call("artifacts.get", {
      params: { artifactId: parsed.data.id },
    });
    expect(() => successEnvelope(artifactResource).parse(got)).not.toThrow();
  });

  it("artifacts.list → artifactResource[] + list meta", async () => {
    await makeArtifact("A1");
    const list = await call(
      "artifacts.list",
      { params: { projectId: "project-1" }, query: { page: 1, pageSize: 50 } },
      true,
    );
    const parsed = listEnvelope(artifactResource).parse(list);
    expect(parsed.data.length).toBe(1);
    expect(parsed.meta.total).toBe(1);
    expect(parsed.meta.requestId).toBe("req-1");
  });

  it("artifacts.versions.create / list → artifactVersionResource", async () => {
    const artifactId = await makeArtifact();
    const created = await call("artifacts.versions.create", {
      params: { artifactId },
      body: { contentText: "第二版", changeSummary: "edit" },
    });
    const parsed = successEnvelope(artifactVersionResource).parse(created);
    expect(parsed.data.versionNumber).toBe(2);
    expect(parsed.data.createdByType).toBe("user");

    const list = await call(
      "artifacts.versions.list",
      { params: { artifactId }, query: { page: 1, pageSize: 50 } },
      true,
    );
    const parsedList = listEnvelope(artifactVersionResource).parse(list);
    expect(parsedList.data.length).toBe(2);
  });

  it("artifacts.restore → artifactResource (selected immutable version becomes current)", async () => {
    const artifactId = await makeArtifact();
    const got = await call("artifacts.get", { params: { artifactId } });
    const v1Id = (got as { data: { currentVersionId: string } }).data
      .currentVersionId;
    await call("artifacts.versions.create", {
      params: { artifactId },
      body: { contentText: "第二版", changeSummary: "edit" },
    });
    const restored = await call("artifacts.restore", {
      params: { artifactId },
      body: { versionId: v1Id },
    });
    const parsed = successEnvelope(artifactResource).parse(restored);
    expect(parsed.data.currentVersionId).toBe(v1Id);
  });

  it("artifacts.scriptPatches.apply → artifactVersionResource", async () => {
    const artifactId = await makeArtifact();
    const source = await call("artifacts.versions.create", {
      params: { artifactId },
      body: {
        contentText: "原文一\n\n原文二",
        contentData: {
          sections: [
            { id: "section-1", body: "原文一" },
            { id: "section-2", body: "原文二" },
          ],
        },
        changeSummary: "结构化稿面",
      },
    });
    const sourceVersionId = (source as { data: { id: string } }).data.id;

    const patched = await call("artifacts.scriptPatches.apply", {
      params: { artifactId },
      body: {
        expectedVersionId: sourceVersionId,
        sectionId: "section-2",
        expectedOriginalText: "原文二",
        replacementText: "新原文二",
        changeSummary: "只改第二段",
      },
    });
    const parsed = successEnvelope(artifactVersionResource).parse(patched);
    expect(parsed.data.contentData?.sections).toEqual([
      { id: "section-1", body: "原文一" },
      { id: "section-2", body: "新原文二" },
    ]);
  });

  it("artifacts.relations.create → artifactRelationResource", async () => {
    const source = await makeArtifact("源");
    const target = await makeArtifact("目标");
    const rel = await call("artifacts.relations.create", {
      params: { artifactId: source },
      body: { targetArtifactId: target, relationType: "references" },
    });
    const parsed = successEnvelope(artifactRelationResource).parse(rel);
    expect(parsed.data.relationType).toBe("references");
    expect(parsed.data.sourceArtifactId).toBe(source);
  });
});
