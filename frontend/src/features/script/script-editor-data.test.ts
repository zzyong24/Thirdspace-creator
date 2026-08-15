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

import {
  loadPlanningOutline,
  loadScriptEditorSections,
  resolveScriptArtifactIdFromDb,
} from "./script-editor-data";
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



// ── [T-387b] 凝固分镜 visual 读回(loadScriptEditorSections)────────────────────

describe("loadScriptEditorSections — T-387b visual 读回", () => {
  it("段带 visual → 规整读回;无 visual 的段不带字段(旧稿零回归)", async () => {
    const client = makeClient({
      currentVersionId: "av-1",
      versions: [
        {
          id: "av-1",
          versionNumber: 1,
          contentData: {
            sections: [
              {
                heading: "1. 钩子",
                body: "口播：x",
                visual: {
                  description: " 产品特写 ",
                  assetRefs: ["asset-1", ""],
                  missing: ["对比图表"],
                },
              },
              { heading: "2. 正文", body: "b" },
            ],
          },
        },
      ],
    });
    const sections = await loadScriptEditorSections("art-1", client);
    expect(sections![0]!.visual).toEqual({
      description: "产品特写",
      assetRefs: ["asset-1"],
      missing: ["对比图表"],
    });
    expect(sections![1]!.visual).toBeUndefined();
  });

  it("visual 三段全空(空壳)→ 不带字段", async () => {
    const client = makeClient({
      currentVersionId: "av-1",
      versions: [
        {
          id: "av-1",
          versionNumber: 1,
          contentData: {
            sections: [
              {
                heading: "h",
                body: "b",
                visual: { description: "", assetRefs: [], missing: [] },
              },
            ],
          },
        },
      ],
    });
    const sections = await loadScriptEditorSections("art-1", client);
    expect(sections![0]!.visual).toBeUndefined();
  });
});

describe("resolveScriptArtifactIdFromDb — 空壳脚本兼容", () => {
  it("空 output_script 不遮住有正文的 master_script", async () => {
    const client: ScriptDataClient = {
      async listArtifacts() {
        return [
          { id: "output-empty", artifactType: "output_script", stage: "script" },
          { id: "master-full", artifactType: "master_script", stage: "script" },
        ];
      },
      async getArtifact({ params }) {
        return {
          currentVersionId:
            params.artifactId === "output-empty" ? "output-v1" : "master-v2",
        };
      },
      async listArtifactVersions({ params }) {
        return params.artifactId === "output-empty"
          ? [
              {
                id: "output-v1",
                versionNumber: 1,
                contentText: "",
                contentData: {},
              },
            ]
          : [
              {
                id: "master-v2",
                versionNumber: 2,
                contentText: "这份母稿正文必须在桌面项目页回显。",
                contentData: {},
              },
            ];
      },
    };

    await expect(
      resolveScriptArtifactIdFromDb("project-real", client),
    ).resolves.toBe("master-full");
  });

  it("所有候选都为空时仍返回 output_script，保留正式写入目标", async () => {
    const client: ScriptDataClient = {
      async listArtifacts() {
        return [
          { id: "output-empty", artifactType: "output_script", stage: "script" },
          { id: "master-empty", artifactType: "master_script", stage: "script" },
        ];
      },
      async getArtifact({ params }) {
        return { currentVersionId: `${params.artifactId}-v1` };
      },
      async listArtifactVersions({ params }) {
        return [
          {
            id: `${params.artifactId}-v1`,
            versionNumber: 1,
            contentText: "",
            contentData: {},
          },
        ];
      },
    };

    await expect(
      resolveScriptArtifactIdFromDb("project-empty", client),
    ).resolves.toBe("output-empty");
  });
});
