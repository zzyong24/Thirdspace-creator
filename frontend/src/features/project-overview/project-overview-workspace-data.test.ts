/**
 * Unit tests for the Project Overview READ-side assembly (GAP-OVW-1).
 *
 * Locks the degradation contract of `buildProjectOverviewWorkspaceViewModel`:
 *   - a REAL project derives its stage stepper from `currentStage` + `progressPct`
 *     (current = in_progress, before = completed, after = pending — never all
 *     pending),
 *   - 资产概览 shows real derivable counts (素材/知识/产出/已发布/动态),
 *   - 最近文件 lists the project's linked assets resolved via `assets.get`,
 *   - 发布状态 lists each output's real publications,
 *   - a section whose read throws degrades to EMPTY (the card owns its empty state),
 *   - an unknown / unreadable project falls back to the fixture VM entirely.
 *
 * The contract client is injected (a hand-rolled fake), so the test never touches
 * the real in-process backend. The server composition root is mocked so importing
 * the helper does not boot pglite.
 */

import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/contract-client.server", () => ({
  client: {
    getProject: vi.fn(),
    listOutputs: vi.fn(),
    listStages: vi.fn(),
    listActivity: vi.fn(),
    listMaterialLinks: vi.fn(),
    getAsset: vi.fn(),
    listPublications: vi.fn(),
  },
}));

import { buildProjectOverviewWorkspaceViewModel } from "./project-overview-workspace-data";
import type { ProjectOverviewDataClient } from "./project-overview-workspace-data";

interface FakeData {
  readonly project?:
    | {
        id: string;
        title: string;
        contentCategory: string;
        creationMode: string;
        status: string;
        currentStage: string;
        progressPct: number;
        startedAt: string;
        targetCompletedAt: string | null;
      }
    | "throw";
  readonly outputs?:
    | ReadonlyArray<{
        id: string;
        title: string;
        contentType: string;
        status: string;
      }>
    | "throw";
  readonly stages?:
    | ReadonlyArray<{
        stage: string;
        status: string;
        progressPct: number;
      }>
    | "throw";
  readonly activity?: ReadonlyArray<{
    id: string;
    eventType: string;
    occurredAt: string;
  }>;
  readonly links?:
    | ReadonlyArray<{
        id: string;
        entityType: "knowledge" | "asset";
        entityId: string;
        createdAt: string;
      }>
    | "throw";
  readonly assets?: Record<
    string,
    {
      id: string;
      assetType: "image" | "video" | "audio" | "document" | "subtitle";
      name: string;
      updatedAt: string;
    }
  >;
  // Per-outputId publication rows. `"throw"` simulates a failed read.
  readonly publications?:
    | Record<
        string,
        ReadonlyArray<{
          id: string;
          platform: string;
          status: string;
          publishedAt: string | null;
        }>
      >
    | "throw";
}

function fakeClient(data: FakeData): ProjectOverviewDataClient {
  return {
    async getProject({ params }) {
      if (data.project === "throw" || data.project === undefined) {
        throw new Error("404");
      }
      if (params.projectId !== data.project.id) throw new Error("404");
      return data.project;
    },
    async listOutputs() {
      if (data.outputs === "throw") throw new Error("500");
      return data.outputs ?? [];
    },
    async listStages() {
      if (data.stages === "throw") throw new Error("500");
      return data.stages ?? [];
    },
    async listActivity() {
      return data.activity ?? [];
    },
    async listMaterialLinks() {
      if (data.links === "throw") throw new Error("500");
      return data.links ?? [];
    },
    async getAsset({ params }) {
      const asset = data.assets?.[params.assetId];
      if (!asset) throw new Error("404");
      return asset;
    },
    async listPublications({ params }) {
      if (data.publications === "throw") throw new Error("500");
      return data.publications?.[params.outputId] ?? [];
    },
  };
}

const REAL_PROJECT = {
  id: "project-real-xyz",
  title: "真实项目",
  contentCategory: "知识科普",
  creationMode: "guided",
  status: "active",
  currentStage: "script",
  progressPct: 42,
  startedAt: "2026-06-01T08:00:00.000Z",
  targetCompletedAt: null,
};

describe("buildProjectOverviewWorkspaceViewModel (GAP-OVW-1)", () => {
  it("renders the stage stepper from the real projects.stages.list rows", async () => {
    const vm = await buildProjectOverviewWorkspaceViewModel(
      REAL_PROJECT.id,
      fakeClient({
        project: REAL_PROJECT,
        // Real per-stage rows DIFFER from the currentStage derivation: research is
        // only in_progress (not completed) and script is skipped — proving the op
        // wins over the derivation.
        stages: [
          { stage: "research", status: "in_progress", progressPct: 30 },
          { stage: "planning", status: "completed", progressPct: 100 },
          { stage: "script", status: "skipped", progressPct: 0 },
          { stage: "production", status: "pending", progressPct: 0 },
          { stage: "publishing", status: "pending", progressPct: 0 },
          { stage: "review", status: "pending", progressPct: 0 },
        ],
      }),
    );

    const byStage = Object.fromEntries(vm.stages.map((s) => [s.stage, s]));
    expect(byStage.research.status).toBe("in_progress");
    expect(byStage.research.progressPct).toBe(30);
    expect(byStage.script.status).toBe("skipped");
    // All six canonical stages render in order.
    expect(vm.stages.map((s) => s.stage)).toEqual([
      "research",
      "planning",
      "script",
      "production",
      "publishing",
      "review",
    ]);
  });

  it("derives the stage stepper from currentStage + progressPct when no stage rows exist", async () => {
    const vm = await buildProjectOverviewWorkspaceViewModel(
      REAL_PROJECT.id,
      // stages default to [] → fall back to the currentStage derivation.
      fakeClient({ project: REAL_PROJECT }),
    );

    const byStage = Object.fromEntries(vm.stages.map((s) => [s.stage, s]));
    // research/planning are before "script" → completed.
    expect(byStage.research.status).toBe("completed");
    expect(byStage.research.progressPct).toBe(100);
    expect(byStage.planning.status).toBe("completed");
    // current stage carries the real progress.
    expect(byStage.script.status).toBe("in_progress");
    expect(byStage.script.progressPct).toBe(42);
    // production/publishing/review are after → pending.
    expect(byStage.production.status).toBe("pending");
    expect(byStage.review.status).toBe("pending");
  });

  it("builds real asset-overview counts from material-links + outputs + publications", async () => {
    const vm = await buildProjectOverviewWorkspaceViewModel(
      REAL_PROJECT.id,
      fakeClient({
        project: REAL_PROJECT,
        outputs: [
          { id: "out-1", title: "一稿", contentType: "video", status: "draft" },
        ],
        links: [
          { id: "l1", entityType: "asset", entityId: "a1", createdAt: "2026-06-02T00:00:00.000Z" },
          { id: "l2", entityType: "asset", entityId: "a2", createdAt: "2026-06-03T00:00:00.000Z" },
          { id: "l3", entityType: "knowledge", entityId: "k1", createdAt: "2026-06-02T00:00:00.000Z" },
        ],
        assets: {
          a1: { id: "a1", assetType: "video", name: "镜头A", updatedAt: "2026-06-04T00:00:00.000Z" },
          a2: { id: "a2", assetType: "document", name: "分镜表", updatedAt: "2026-06-05T00:00:00.000Z" },
        },
        publications: {
          "out-1": [
            { id: "p1", platform: "douyin", status: "published", publishedAt: "2026-06-06T00:00:00.000Z" },
          ],
        },
      }),
    );

    const stat = (id: string) => vm.assetStats.find((s) => s.id === id);
    expect(stat("stat-assets")?.value).toBe("2");
    expect(stat("stat-knowledge")?.value).toBe("1");
    expect(stat("stat-outputs")?.value).toBe("1");
    expect(stat("stat-published")?.value).toBe("1");
  });

  it("lists recent files from linked assets, newest first", async () => {
    const vm = await buildProjectOverviewWorkspaceViewModel(
      REAL_PROJECT.id,
      fakeClient({
        project: REAL_PROJECT,
        links: [
          { id: "l1", entityType: "asset", entityId: "a1", createdAt: "2026-06-02T00:00:00.000Z" },
          { id: "l2", entityType: "asset", entityId: "a2", createdAt: "2026-06-03T00:00:00.000Z" },
        ],
        assets: {
          a1: { id: "a1", assetType: "video", name: "镜头A", updatedAt: "2026-06-04T00:00:00.000Z" },
          a2: { id: "a2", assetType: "document", name: "分镜表", updatedAt: "2026-06-05T00:00:00.000Z" },
        },
      }),
    );

    expect(vm.recentFiles.map((f) => f.name)).toEqual(["分镜表", "镜头A"]);
    expect(vm.recentFiles[0].fileKind).toBe("document");
    expect(vm.recentFiles[1].fileKind).toBe("shot");
  });

  it("lists real publishing rows per output", async () => {
    const vm = await buildProjectOverviewWorkspaceViewModel(
      REAL_PROJECT.id,
      fakeClient({
        project: REAL_PROJECT,
        outputs: [
          { id: "out-1", title: "一稿", contentType: "video", status: "draft" },
        ],
        publications: {
          "out-1": [
            { id: "p1", platform: "douyin", status: "published", publishedAt: "2026-06-06T00:00:00.000Z" },
            { id: "p2", platform: "bilibili", status: "scheduled", publishedAt: null },
          ],
        },
      }),
    );

    expect(vm.publishing).toHaveLength(2);
    expect(vm.publishing[0].platform).toBe("douyin");
    expect(vm.publishing[0].status).toBe("published");
  });

  it("degrades a failed material-links read to EMPTY (cards own the empty state)", async () => {
    const vm = await buildProjectOverviewWorkspaceViewModel(
      REAL_PROJECT.id,
      fakeClient({ project: REAL_PROJECT, links: "throw" }),
    );

    expect(vm.assetStats).toEqual([]);
    expect(vm.recentFiles).toEqual([]);
    // The stepper still derives (current stage exists) even when other reads fail.
    expect(vm.stages.find((s) => s.stage === "script")?.status).toBe(
      "in_progress",
    );
  });

  it("falls back to the fixture VM when the project read throws", async () => {
    const vm = await buildProjectOverviewWorkspaceViewModel(
      "project-unknown",
      fakeClient({ project: "throw" }),
    );
    // Whatever the fixture builder returns for an unknown id — the helper must not
    // throw and must return a project-overview VM.
    expect(vm.kind).toBe("project-overview");
  });
});
