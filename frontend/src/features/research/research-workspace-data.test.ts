/**
 * Unit tests for the Research Workspace READ-side assembly (Task #90).
 *
 * Locks the degradation contract of `buildResearchWorkspaceViewModel`:
 *   - a REAL project resolves `idea` from its title + brief (never "未找到项目"),
 *   - the project's gathered knowledge links map to `sources` (+ `notes` for
 *     note-typed items),
 *   - an unknown / unreadable project falls back to the fixture VM entirely.
 *
 * The contract client is injected (a hand-rolled fake), so the test never
 * touches the real in-process backend. The server composition root is mocked so
 * importing the helper does not boot pglite.
 */

import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/contract-client.server", () => ({
  client: {
    getProject: vi.fn(),
    listMaterialLinks: vi.fn(),
    getKnowledge: vi.fn(),
    listKnowledgeRevisions: vi.fn(),
  },
}));

import { buildResearchWorkspaceViewModel } from "./research-workspace-data";
import type { ResearchDataClient } from "./research-workspace-data";

interface FakeData {
  readonly project?: { id: string; title: string; brief: string } | "throw";
  readonly links?: ReadonlyArray<{
    entityType: "knowledge" | "asset";
    entityId: string;
    role?: string;
    stage?: string;
  }>;
  readonly knowledge?: Record<
    string,
    {
      id: string;
      title: string;
      knowledgeType:
        | "note"
        | "reference"
        | "inspiration"
        | "snippet"
        | "transcript";
      createdAt: string;
    }
  >;
  // Per-knowledgeId revision rows for knowledge.revisions.list (newest-first).
  // An id with `"throw"` simulates a failed read (→ note falls back to title).
  readonly revisions?: Record<
    string,
    ReadonlyArray<{ revisionNumber: number; content: string }> | "throw"
  >;
}

function fakeClient(data: FakeData): ResearchDataClient {
  return {
    async getProject({ params }) {
      if (data.project === "throw" || data.project === undefined) {
        throw new Error("404");
      }
      if (params.projectId !== data.project.id) {
        throw new Error("404");
      }
      return data.project;
    },
    async listMaterialLinks() {
      return (data.links ?? []).map((link) => ({
        role: "",
        stage: "",
        ...link,
      }));
    },
    async getKnowledge({ params }) {
      const item = data.knowledge?.[params.knowledgeId];
      if (!item) throw new Error("404");
      return item;
    },
    async listKnowledgeRevisions({ params }) {
      const revs = data.revisions?.[params.knowledgeId];
      if (revs === "throw") throw new Error("500");
      // Default: no revisions → note falls back to the item title.
      return revs ?? [];
    },
  };
}

describe("buildResearchWorkspaceViewModel", () => {
  it("derives idea from a real project's title + brief", async () => {
    const vm = await buildResearchWorkspaceViewModel(
      "project-p-24",
      fakeClient({
        project: { id: "project-p-24", title: "我的新项目", brief: "一句话立意" },
      }),
    );
    expect(vm.idea.title).toBe("我的新项目");
    expect(vm.idea.summary).toBe("一句话立意");
    expect(vm.projectId).toBe("project-p-24");
    expect(vm.scenario).toBe("default");
  });

  it("uses a placeholder summary when a real project has no brief", async () => {
    const vm = await buildResearchWorkspaceViewModel(
      "project-p-24",
      fakeClient({
        project: { id: "project-p-24", title: "无立意项目", brief: "" },
      }),
    );
    expect(vm.idea.title).toBe("无立意项目");
    expect(vm.idea.summary).toContain("暂无项目立意");
  });

  it("maps gathered knowledge links into sources and note items into notes", async () => {
    const vm = await buildResearchWorkspaceViewModel(
      "project-p-24",
      fakeClient({
        project: { id: "project-p-24", title: "新项目", brief: "b" },
        links: [
          { entityType: "knowledge", entityId: "k-1" },
          { entityType: "knowledge", entityId: "k-2" },
          // asset links are ignored by the research read path
          { entityType: "asset", entityId: "a-1" },
        ],
        knowledge: {
          "k-1": {
            id: "k-1",
            title: "Arc 调研报告",
            knowledgeType: "reference",
            createdAt: "2026-06-01T00:00:00+08:00",
          },
          "k-2": {
            id: "k-2",
            title: "本地优先栈笔记",
            knowledgeType: "note",
            createdAt: "2026-06-02T00:00:00+08:00",
          },
        },
        // The note's real body lives in its current revision (head = #2).
        revisions: {
          "k-2": [
            { revisionNumber: 2, content: "本地优先栈的取舍与边界条件" },
            { revisionNumber: 1, content: "初稿" },
          ],
        },
      }),
    );
    // Both knowledge links become sources; the asset link does not.
    expect(vm.sources).toHaveLength(2);
    expect(vm.sources.map((s) => s.title)).toEqual([
      "Arc 调研报告",
      "本地优先栈笔记",
    ]);
    expect(vm.sources[0]?.id).toBe("source-k-1");
    // Only the note-typed item becomes a research note; its content is the HEAD
    // revision body (not the title).
    expect(vm.notes).toHaveLength(1);
    expect(vm.notes[0]).toMatchObject({
      content: "本地优先栈的取舍与边界条件",
      knowledgeId: "k-2",
    });
  });

  it("falls back to the note title when the revision read fails", async () => {
    const vm = await buildResearchWorkspaceViewModel(
      "project-p-24",
      fakeClient({
        project: { id: "project-p-24", title: "新项目", brief: "b" },
        links: [{ entityType: "knowledge", entityId: "k-2" }],
        knowledge: {
          "k-2": {
            id: "k-2",
            title: "本地优先栈笔记",
            knowledgeType: "note",
            createdAt: "2026-06-02T00:00:00+08:00",
          },
        },
        // Revision read throws → the note NEVER renders blank, falls back to title.
        revisions: { "k-2": "throw" },
      }),
    );
    expect(vm.notes).toHaveLength(1);
    expect(vm.notes[0]).toMatchObject({
      content: "本地优先栈笔记",
      knowledgeId: "k-2",
    });
  });

  it("leaves sources/notes empty for a real project with no gathered material", async () => {
    const vm = await buildResearchWorkspaceViewModel(
      "project-p-24",
      fakeClient({
        project: { id: "project-p-24", title: "空项目", brief: "b" },
        links: [],
      }),
    );
    expect(vm.sources).toEqual([]);
    expect(vm.notes).toEqual([]);
    // Real (non-fixture) project → fake-data fields render empty, not faked.
    expect(vm.trendCards).toEqual([]);
    expect(vm.relatedTags).toEqual([]);
    expect(vm.evidence).toEqual([]);
    // The static type-tab taxonomy still renders.
    expect(vm.sourceTabs.length).toBeGreaterThan(0);
  });

  it("falls back to the fixture VM entirely when the project read throws", async () => {
    const vm = await buildResearchWorkspaceViewModel(
      "totally-unknown-id",
      fakeClient({ project: "throw" }),
    );
    // The fixture builder renders "未找到项目" for ids absent from canonical —
    // this preserves the OLD behavior for unknown ids.
    expect(vm.idea.title).toBe("未找到项目");
    expect(vm.scenario).toBe("empty");
  });
});
