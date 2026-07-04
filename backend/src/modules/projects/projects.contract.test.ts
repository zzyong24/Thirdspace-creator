import { describe, it, expect, beforeEach } from "vitest";
import {
  createDb,
  type Db,
  UnsupportedOperationError,
} from "@creatoros/backend";
import {
  ENDPOINTS,
  listEnvelope,
  successEnvelope,
  type Endpoint,
  type RequestContext,
  type Transport,
} from "@creatoros/contract";
import {
  createProjectRepository,
  type ProjectRepository,
} from "./projects.repository";
import { createProjectsService } from "./projects.service";
import { createProjectsTransport } from "./projects.transport";
import {
  projectResource,
  projectStageResource,
  contentOutputResource,
  taskResource,
  projectActivityResource,
} from "./projects.schema";

// Drive each of the 17 ops through the transport with a valid input and assert
// the envelope `data` validates against the op's contract response DTO
// (per-item for isList). A returning call == DTO conformance (foundation §5.4).

const NOW = "2026-06-13T02:00:00.000Z";
const ctx: RequestContext = { userId: "user-1", requestId: "req-1", source: "user" };
const ep = (id: string, isList = false) => ({ id, isList }) as unknown as Endpoint;

function deterministicDeps() {
  const counters = new Map<string, number>();
  return {
    now: () => NOW,
    nextId: (prefix: string) => {
      const n = (counters.get(prefix) ?? 0) + 1;
      counters.set(prefix, n);
      return `${prefix}-c-${n}`;
    },
  };
}

let db: Db;
let repo: ProjectRepository;
let transport: Transport;

beforeEach(async () => {
  ({ db } = await createDb());
  repo = createProjectRepository(db);
  const service = createProjectsService(repo, deterministicDeps());
  transport = createProjectsTransport(() => ({ service, repo }));
});

async function call(id: string, input: unknown, isList = false) {
  return transport.request(ep(id, isList), input as never, ctx);
}

describe("projects.transport — 17-op contract conformance", () => {
  it("projects.create / list / get → ProjectResource", async () => {
    const created = await call("projects.create", {
      body: { title: "深度解析", brief: "拆解", targetPlatforms: ["bilibili"] },
    });
    expect(() =>
      successEnvelope(projectResource).parse(created),
    ).not.toThrow();
    const projectId = (created as { data: { id: string } }).data.id;

    const list = await call(
      "projects.list",
      { query: { page: 1, pageSize: 50 } },
      true,
    );
    const parsedList = listEnvelope(projectResource).parse(list);
    expect(parsedList.data.length).toBe(1);

    const got = await call("projects.get", { params: { projectId } });
    expect(() => successEnvelope(projectResource).parse(got)).not.toThrow();
  });

  it("projects.patch / archive / stage.transition → ProjectResource", async () => {
    const created = await call("projects.create", { body: { title: "T" } });
    const projectId = (created as { data: { id: string } }).data.id;

    const patched = await call("projects.patch", {
      params: { projectId },
      body: { title: "改名", starred: true },
    });
    expect(() => successEnvelope(projectResource).parse(patched)).not.toThrow();

    const transitioned = await call("projects.stage.transition", {
      params: { projectId, stage: "research" },
      body: {},
    });
    expect(() =>
      successEnvelope(projectResource).parse(transitioned),
    ).not.toThrow();

    const archived = await call("projects.archive", { params: { projectId } });
    expect(() => successEnvelope(projectResource).parse(archived)).not.toThrow();
  });

  it("outputs: create / list / get / patch / stage.transition → ContentOutputResource", async () => {
    const created = await call("projects.create", { body: { title: "T" } });
    const projectId = (created as { data: { id: string } }).data.id;

    const out = await call("projects.outputs.create", {
      params: { projectId },
      body: { title: "主视频", contentRole: "conversion" },
    });
    expect(() => successEnvelope(contentOutputResource).parse(out)).not.toThrow();
    const outputId = (out as { data: { id: string } }).data.id;

    const list = await call(
      "projects.outputs.list",
      { params: { projectId } },
      true,
    );
    const parsed = listEnvelope(contentOutputResource).parse(list);
    expect(parsed.data.length).toBe(1);
    expect(parsed.data[0]!.contentRole).toBe("conversion");

    const got = await call("outputs.get", { params: { outputId } });
    expect(() => successEnvelope(contentOutputResource).parse(got)).not.toThrow();

    const patched = await call("outputs.patch", {
      params: { outputId },
      body: { title: "改", primaryAssetId: null },
    });
    expect(() =>
      successEnvelope(contentOutputResource).parse(patched),
    ).not.toThrow();

    const transitioned = await call("outputs.stage.transition", {
      params: { outputId, stage: "script" },
      body: {},
    });
    expect(() =>
      successEnvelope(contentOutputResource).parse(transitioned),
    ).not.toThrow();
  });

  it("tasks: list / create / patch → TaskResource", async () => {
    const created = await call("projects.create", { body: { title: "T" } });
    const projectId = (created as { data: { id: string } }).data.id;

    const task = await call("projects.tasks.create", {
      params: { projectId },
      body: { title: "写大纲", stage: "script" },
    });
    expect(() => successEnvelope(taskResource).parse(task)).not.toThrow();
    const taskId = (task as { data: { id: string } }).data.id;

    const list = await call(
      "projects.tasks.list",
      { params: { projectId } },
      true,
    );
    const parsed = listEnvelope(taskResource).parse(list);
    expect(parsed.data.length).toBe(1);

    const patched = await call("tasks.patch", {
      params: { taskId },
      body: { status: "done" },
    });
    expect(() => successEnvelope(taskResource).parse(patched)).not.toThrow();
  });

  it("projects.activity.list → ProjectActivityResource[]", async () => {
    const created = await call("projects.create", { body: { title: "T" } });
    const projectId = (created as { data: { id: string } }).data.id;

    const list = await call(
      "projects.activity.list",
      { params: { projectId } },
      true,
    );
    const parsed = listEnvelope(projectActivityResource).parse(list);
    expect(parsed.data.length).toBeGreaterThanOrEqual(1);
    expect(parsed.data[0]!.eventType).toBe("project_created");
  });

  it("projects.stages.list → ProjectStageResource[]", async () => {
    const created = await call("projects.create", { body: { title: "T" } });
    const projectId = (created as { data: { id: string } }).data.id;

    const list = await call(
      "projects.stages.list",
      { params: { projectId } },
      true,
    );
    const parsed = listEnvelope(projectStageResource).parse(list);
    // createProject seeds the 7-stage pipeline (brief + 6, 立项 Brief 地基).
    expect(parsed.data.length).toBe(7);
  });

  it("covers all 17 op ids + unknown → UnsupportedOperationError", async () => {
    const ids = Object.values(ENDPOINTS)
      .filter((e) =>
        [
          "projects.list",
          "projects.create",
          "projects.get",
          "projects.patch",
          "projects.archive",
          // T-102 物理删除(additive)。
          "projects.delete",
          "projects.stage.transition",
          "projects.outputs.create",
          "projects.outputs.list",
          "projects.stages.list",
          "outputs.get",
          "outputs.patch",
          "outputs.stage.transition",
          "projects.tasks.list",
          "projects.tasks.create",
          "tasks.patch",
          "projects.activity.list",
        ].includes(e.id),
      )
      .map((e) => e.id);
    expect(ids).toHaveLength(17);

    await expect(
      transport.request(ep("projects.nope"), {} as never, ctx),
    ).rejects.toBeInstanceOf(UnsupportedOperationError);
  });

  // T-102 物理删除:删除返回删除前的 ProjectResource 快照,且删后 get → 404(OwnershipError)。
  it("projects.delete → ProjectResource + 删后 get 404", async () => {
    const created = await call("projects.create", { body: { title: "待删" } });
    const projectId = (created as { data: { id: string } }).data.id;

    const deleted = await call("projects.delete", { params: { projectId } });
    expect(() => successEnvelope(projectResource).parse(deleted)).not.toThrow();
    expect((deleted as { data: { id: string } }).data.id).toBe(projectId);

    // 删后再读该项目 → OwnershipError(404,不泄露存在性)。
    await expect(
      call("projects.get", { params: { projectId } }),
    ).rejects.toMatchObject({ name: "OwnershipError" });
  });
});
