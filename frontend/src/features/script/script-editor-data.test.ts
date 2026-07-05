/**
 * Unit tests for SEAM-02 — 脚本"大纲"区读策划的结构方案 (`loadPlanningOutline`).
 *
 * Locks the read-side contract:
 *   - when the project has a `content_outline` artifact whose current version carries
 *     `contentData.sections`, the outline rows come from THOSE 段落 (label = heading),
 *     i.e. the script page's 大纲 comes from 策划's structure plan (SEAM-02),
 *   - degrades to null (caller keeps the script-derived outline) when there is no project
 *     id, no content_outline artifact, no current version, or no sections.
 *
 * The contract client is injected (hand-rolled fake); the server composition root is
 * mocked so importing the helper never boots pglite.
 */

import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/contract-client.server", () => ({
  client: {
    getArtifact: vi.fn(),
    listArtifactVersions: vi.fn(),
    listArtifacts: vi.fn(),
  },
}));

import { loadPlanningOutline, loadThesisSkeleton } from "./script-editor-data";
import type { ScriptDataClient } from "./script-editor-data";

interface FakeData {
  readonly artifacts?: ReadonlyArray<{ id: string; artifactType: string }>;
  readonly currentVersionId?: string;
  readonly versions?: ReadonlyArray<{
    id: string;
    versionNumber: number;
    contentData?: Record<string, unknown>;
  }>;
}

// A fake ScriptDataClient: lists artifacts, exposes the outline artifact's
// currentVersionId, and returns its versions (so loadPlanningOutline can pick current).
function makeClient(data: FakeData): ScriptDataClient {
  return {
    async listArtifacts() {
      return data.artifacts ?? [];
    },
    async getArtifact() {
      return { currentVersionId: data.currentVersionId };
    },
    async listArtifactVersions() {
      return data.versions ?? [];
    },
  };
}

const OUTLINE_VERSION = {
  id: "av-outline-1",
  versionNumber: 1,
  contentData: {
    structureType: "问题-解决",
    opening: "反差开场",
    sections: [
      { label: "钩子", intent: "前3秒抓住开发者" },
      { label: "痛点", intent: "本地栈太难搭" },
      { label: "价值", intent: "三步搞定" },
    ],
    ending: "总结",
    cta: "点赞关注",
  },
};

describe("loadPlanningOutline (SEAM-02)", () => {
  it("reads outline rows from the content_outline artifact's current version sections", async () => {
    const client = makeClient({
      artifacts: [
        { id: "art-thesis", artifactType: "thesis_tree" },
        { id: "art-outline", artifactType: "content_outline" },
      ],
      currentVersionId: "av-outline-1",
      versions: [OUTLINE_VERSION],
    });
    const outline = await loadPlanningOutline("project-x", client);
    expect(outline).not.toBeNull();
    expect(outline).toHaveLength(3);
    expect(outline![0]).toMatchObject({ heading: "钩子", position: 0 });
    expect(outline![1]!.heading).toBe("痛点");
    expect(outline![2]!.heading).toBe("价值");
    // Stable, outline-scoped ids (not the script-section ids).
    expect(outline![0]!.id).toContain("planning-outline-art-outline");
  });

  it("falls back to label-less intent as heading, skips empty 段落", async () => {
    const client = makeClient({
      artifacts: [{ id: "art-outline", artifactType: "content_outline" }],
      currentVersionId: "av-1",
      versions: [
        {
          id: "av-1",
          versionNumber: 1,
          contentData: {
            sections: [
              { label: "", intent: "只有意图" },
              { label: "", intent: "" }, // dropped
              { label: "结尾", intent: "" },
            ],
          },
        },
      ],
    });
    const outline = await loadPlanningOutline("project-x", client);
    expect(outline).toHaveLength(2);
    expect(outline![0]!.heading).toBe("只有意图");
    expect(outline![1]!.heading).toBe("结尾");
  });

  it("returns null when there is no project id", async () => {
    const client = makeClient({});
    expect(await loadPlanningOutline(null, client)).toBeNull();
  });

  it("returns null when the project has no content_outline artifact", async () => {
    const client = makeClient({
      artifacts: [{ id: "art-thesis", artifactType: "thesis_tree" }],
    });
    expect(await loadPlanningOutline("project-x", client)).toBeNull();
  });

  it("returns null when the outline artifact has no sections", async () => {
    const client = makeClient({
      artifacts: [{ id: "art-outline", artifactType: "content_outline" }],
      currentVersionId: "av-1",
      versions: [
        { id: "av-1", versionNumber: 1, contentData: { sections: [] } },
      ],
    });
    expect(await loadPlanningOutline("project-x", client)).toBeNull();
  });

  it("returns null on a read failure (degrades, never throws)", async () => {
    const client: ScriptDataClient = {
      async getArtifact() {
        return {};
      },
      async listArtifactVersions() {
        return [];
      },
      async listArtifacts() {
        throw new Error("boom");
      },
    };
    expect(await loadPlanningOutline("project-x", client)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// [T-127] loadThesisSkeleton — 稿面「论点骨架」面板读 thesis_tree 当前版本 nodes
// ---------------------------------------------------------------------------

const THESIS_VERSION = {
  id: "av-thesis-1",
  versionNumber: 1,
  contentData: {
    nodes: [
      { column: "core", title: "核心论点", summary: "一句话主张" },
      { column: "support", title: "支撑A", summary: "论据一" },
      { column: "evidence", title: "证据X", summary: "数据来源" },
      { column: "counter", title: "反驳", summary: "对立观点回应" },
    ],
  },
};

describe("loadThesisSkeleton (T-127)", () => {
  it("读 thesis_tree 当前版本的 nodes(core/support/evidence/counter)", async () => {
    const client = makeClient({
      artifacts: [
        { id: "art-thesis", artifactType: "thesis_tree" },
        { id: "art-outline", artifactType: "content_outline" },
      ],
      currentVersionId: "av-thesis-1",
      versions: [THESIS_VERSION],
    });
    const result = await loadThesisSkeleton("project-x", client);
    expect(result).not.toBeNull();
    expect(result!.artifactId).toBe("art-thesis");
    const nodes = result!.nodes;
    expect(nodes).toHaveLength(4);
    expect(nodes[0]).toMatchObject({ column: "core", title: "核心论点" });
    expect(nodes.map((n) => n.column)).toEqual([
      "core",
      "support",
      "evidence",
      "counter",
    ]);
  });

  it("过滤非法 column 与空(title/summary 都空)节点", async () => {
    const client = makeClient({
      artifacts: [{ id: "art-thesis", artifactType: "thesis_tree" }],
      currentVersionId: "av-1",
      versions: [
        {
          id: "av-1",
          versionNumber: 1,
          contentData: {
            nodes: [
              { column: "core", title: "有效", summary: "" },
              { column: "bogus", title: "非法列", summary: "x" },
              { column: "support", title: "", summary: "" },
            ],
          },
        },
      ],
    });
    const result = await loadThesisSkeleton("project-x", client);
    expect(result!.nodes).toHaveLength(1);
    expect(result!.nodes[0]).toMatchObject({ column: "core", title: "有效" });
  });

  it("读回节点 materialRefs(挂载素材,规整 {id,title};无字段 → [])", async () => {
    const client = makeClient({
      artifacts: [{ id: "art-thesis", artifactType: "thesis_tree" }],
      currentVersionId: "av-1",
      versions: [
        {
          id: "av-1",
          versionNumber: 1,
          contentData: {
            nodes: [
              {
                column: "core",
                title: "核心",
                summary: "",
                materialRefs: [
                  { id: "kn-1", title: "案例" },
                  { id: "", title: "无 id 丢弃" },
                ],
              },
              { column: "support", title: "无 refs", summary: "" },
            ],
          },
        },
      ],
    });
    const result = await loadThesisSkeleton("project-x", client);
    expect(result!.nodes[0]!.materialRefs).toEqual([{ id: "kn-1", title: "案例" }]);
    expect(result!.nodes[1]!.materialRefs).toEqual([]);
  });

  it("无 projectId → null", async () => {
    expect(await loadThesisSkeleton(null, makeClient({}))).toBeNull();
  });

  it("项目无 thesis_tree artifact → null(诚实空态)", async () => {
    const client = makeClient({
      artifacts: [{ id: "art-outline", artifactType: "content_outline" }],
    });
    expect(await loadThesisSkeleton("project-x", client)).toBeNull();
  });

  it("有 artifact 但无版本 → null", async () => {
    const client = makeClient({
      artifacts: [{ id: "art-thesis", artifactType: "thesis_tree" }],
      versions: [],
    });
    expect(await loadThesisSkeleton("project-x", client)).toBeNull();
  });

  it("全部节点无效 → null(不渲染空面板)", async () => {
    const client = makeClient({
      artifacts: [{ id: "art-thesis", artifactType: "thesis_tree" }],
      currentVersionId: "av-1",
      versions: [
        {
          id: "av-1",
          versionNumber: 1,
          contentData: { nodes: [{ column: "nope", title: "", summary: "" }] },
        },
      ],
    });
    expect(await loadThesisSkeleton("project-x", client)).toBeNull();
  });

  it("读失败 → null(优雅降级,不抛)", async () => {
    const client: ScriptDataClient = {
      async getArtifact() {
        return {};
      },
      async listArtifactVersions() {
        return [];
      },
      async listArtifacts() {
        throw new Error("boom");
      },
    };
    expect(await loadThesisSkeleton("project-x", client)).toBeNull();
  });
});
