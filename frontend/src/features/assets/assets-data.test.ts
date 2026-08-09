/**
 * Unit tests for the Assets Center READ-side assembly (GAP-AST-1).
 *
 * Locks the 读侧做真 contract of `buildAssetsViewModelReal`:
 *   - gallery summaries come from REAL `assets.list` rows,
 *   - 用料历史 (usageHistory) is the REAL `assets.usage.list` asset edges,
 *     read per asset by id (用料反查, Option B), title resolved from projects.list,
 *   - [T-115] 存储 used/total come from REAL `settings.storage.get` (与设置页同源);
 *     a getStorage read failure degrades honestly (used 0 / no 分母), NOT to a
 *     fixture 50GB cap,
 *   - a per-asset usage read failure contributes no usage rows (never throws),
 *   - a SUCCESSFUL-but-empty assets read returns the honest empty VM (NOT seed),
 *   - an outright assets-read FAILURE returns the error tri-state (state:"error",
 *     empty placeholder VM) — it does NOT fabricate the whole fixture VM.
 *
 * The contract client is injected (a hand-rolled fake) so the test never touches
 * the real in-process backend. The server composition root is mocked so importing
 * the helper does not boot pglite.
 */

import { describe, expect, it, vi } from "vitest";

// The helper imports the server composition root for its default client param;
// mock it so importing the module does not boot pglite (every test injects a
// fake client, so the default is never actually called).
vi.mock("@/lib/contract-client.server", () => ({ client: {} }));

import { buildAssetsViewModelReal } from "./assets-data";
import type { AssetsDataClient } from "./assets-data";

// A canonical asset id that exists in the fixture asset_files so the summary
// resolves a real fileSize (so the 弱真 storage sum is non-zero).
import { canonicalDataset } from "@/fixtures/canonical";

const firstFile = canonicalDataset.assetFiles[0]!;
const firstAsset =
  canonicalDataset.assets.find((a) => a.currentFileId === firstFile.id) ??
  canonicalDataset.assets[0]!;

interface FakeData {
  readonly assets?:
    | ReadonlyArray<{
        id: string;
        currentFileId: string;
        assetType: "image" | "video" | "audio" | "document" | "subtitle";
        name: string;
        description: string;
        updatedAt: string;
      }>
    | "throw";
  readonly projects?: ReadonlyArray<{ id: string; title: string }> | "throw";
  readonly trashedAssets?: FakeData["assets"];
  // Per-assetId usage edges (用料反查); a value of "throw" simulates a failed read.
  readonly usage?: Record<
    string,
    | ReadonlyArray<{
        id: string;
        projectId: string;
        entityType: "knowledge" | "asset";
        entityId: string;
        role: string;
        stage: string;
        createdAt: string;
      }>
    | "throw"
  >;
  // [T-115] settings.storage.get 真值; "throw" simulates a failed read (→ honest
  // degrade). Omit to leave getStorage unimplemented (also → throw → degrade).
  readonly storage?:
    | { usedBytes: number; totalBytes: number }
    | "throw";
}

function fakeClient(data: FakeData): AssetsDataClient {
  return {
    async listAssets({ query }) {
      const source =
        query.status === "deleted" ? data.trashedAssets : data.assets;
      if (source === "throw") throw new Error("assets read failed");
      const rows = source ?? [];
      const start = (query.page - 1) * query.pageSize;
      return rows.slice(start, start + query.pageSize);
    },
    async listProjects({ query }) {
      if (data.projects === "throw") throw new Error("projects read failed");
      const rows = data.projects ?? [];
      const start = (query.page - 1) * query.pageSize;
      return rows.slice(start, start + query.pageSize);
    },
    // listMaterialLinks remains on the client surface but is no longer used by
    // the usage assembly (kept for interface parity); return empty.
    async listMaterialLinks() {
      return [];
    },
    async listAssetUsage({ params }) {
      const rows = data.usage?.[params.assetId];
      if (rows === "throw") throw new Error("usage read failed");
      return rows ?? [];
    },
    async getStorage() {
      if (data.storage === undefined || data.storage === "throw") {
        throw new Error("storage read failed");
      }
      return data.storage;
    },
  };
}

describe("buildAssetsViewModelReal (GAP-AST-1 读侧做真)", () => {
  it("超过 200 条素材和 100 个项目时完整分页加载", async () => {
    const assets = Array.from({ length: 205 }, (_, index) => ({
      id: `asset-page-${index}`,
      currentFileId: firstFile.id,
      assetType: "image" as const,
      name: `素材 ${index}`,
      description: "",
      updatedAt: `2026-06-01T00:00:${String(index % 60).padStart(2, "0")}.000Z`,
    }));
    const projects = Array.from({ length: 105 }, (_, index) => ({
      id: `project-page-${index}`,
      title: `项目 ${index}`,
    }));
    const trashedAssets = Array.from({ length: 203 }, (_, index) => ({
      ...assets[index % assets.length]!,
      id: `trashed-page-${index}`,
      name: `回收站素材 ${index}`,
    }));
    const result = await buildAssetsViewModelReal(
      fakeClient({ assets, trashedAssets, projects }),
    );
    expect(result.viewModel.assets).toHaveLength(205);
    expect(result.viewModel.trashedAssets).toHaveLength(203);
    expect(result.projects).toHaveLength(105);
  });

  it("分页接口重复返回同一页时按 ID 无新增退出，不死循环", async () => {
    let activeCalls = 0;
    const repeated = Array.from({ length: 200 }, (_, index) => ({
      id: `asset-repeat-${index}`,
      currentFileId: firstFile.id,
      assetType: "image" as const,
      name: `重复页 ${index}`,
      description: "",
      updatedAt: "2026-06-01T00:00:00.000Z",
    }));
    const client = fakeClient({ assets: repeated });
    const result = await buildAssetsViewModelReal({
      ...client,
      async listAssets(input) {
        if (input.query.status === "deleted") return [];
        activeCalls += 1;
        return repeated;
      },
    });
    expect(result.viewModel.assets).toHaveLength(200);
    expect(activeCalls).toBe(2);
  });
  it("maps REAL assets.list rows to gallery summaries", async () => {
    const { viewModel } = await buildAssetsViewModelReal(
      fakeClient({
        assets: [
          {
            id: firstAsset.id,
            currentFileId: firstFile.id,
            assetType: "image",
            name: "真实素材",
            description: "desc",
            updatedAt: "2026-06-01T00:00:00.000Z",
          },
        ],
        projects: [],
      }),
    );
    expect(viewModel.assets).toHaveLength(1);
    expect(viewModel.assets[0]!.name).toBe("真实素材");
  });

  it("assembles 用料历史 from assets.usage.list edges (title resolved from projects)", async () => {
    const { viewModel } = await buildAssetsViewModelReal(
      fakeClient({
        assets: [
          {
            id: firstAsset.id,
            currentFileId: firstFile.id,
            assetType: "image",
            name: "素材甲",
            description: "d",
            updatedAt: "2026-06-01T00:00:00.000Z",
          },
        ],
        projects: [{ id: "proj-1", title: "项目甲" }],
        usage: {
          [firstAsset.id]: [
            {
              id: "link-asset-1",
              projectId: "proj-1",
              entityType: "asset",
              entityId: firstAsset.id,
              role: "clip",
              stage: "production",
              createdAt: "2026-06-10T00:00:00.000Z",
            },
          ],
        },
      }),
    );
    expect(viewModel.usageHistory).toHaveLength(1);
    const row = viewModel.usageHistory[0]!;
    expect(row.assetId).toBe(firstAsset.id);
    expect(row.projectTitle).toBe("项目甲");
    expect(row.dateLabel).toBe("2026-06-10");
  });

  it("[T-115] storage used/total come from settings.storage.get (真实源, 不再自算 Σ)", async () => {
    // Real disk: 已用 0.1 GB / 494.4 GB(用户实录真值)。这两个值必须直接来自 getStorage,
    // 与设置页完全一致 —— NOT the 弱真 Σ of read rows, NOT the fixture 50GB cap.
    const usedBytes = 107_374_182; // ~0.1 GiB
    const totalBytes = 530_000_000_000; // ~494 GiB 磁盘容量
    const { viewModel } = await buildAssetsViewModelReal(
      fakeClient({
        assets: [
          {
            id: firstAsset.id,
            currentFileId: firstFile.id,
            assetType: "image",
            name: "n",
            description: "d",
            updatedAt: "2026-06-01T00:00:00.000Z",
          },
        ],
        projects: [],
        storage: { usedBytes, totalBytes },
      }),
    );
    expect(viewModel.storage.usedBytes).toBe(usedBytes);
    expect(viewModel.storage.totalBytes).toBe(totalBytes);
    // 真实磁盘容量 → totalLabel 有值(带分母),不再是 fixture "50 GB"。
    expect(viewModel.storage.totalLabel).not.toBe("");
    expect(viewModel.storage.totalLabel).not.toBe("50 GB");
    // used ≠ Σ read rows' fileSizeBytes(证明不是前端自算)。
    expect(viewModel.storage.usedBytes).not.toBe(firstFile.fileSize);
  });

  it("[T-115] a getStorage read failure degrades honestly (used 0 / no 分母, 不回退 50GB cap)", async () => {
    const { viewModel } = await buildAssetsViewModelReal(
      fakeClient({
        assets: [
          {
            id: firstAsset.id,
            currentFileId: firstFile.id,
            assetType: "image",
            name: "n",
            description: "d",
            updatedAt: "2026-06-01T00:00:00.000Z",
          },
        ],
        projects: [],
        storage: "throw",
      }),
    );
    expect(viewModel.storage.usedBytes).toBe(0);
    expect(viewModel.storage.totalBytes).toBe(0);
    // 诚实降级:无分母 label,绝不回退 fixture 50GB 假 cap。
    expect(viewModel.storage.totalLabel).toBe("");
  });

  it("[T-115] totalBytes 0 (磁盘容量未知) → totalLabel 空串, 只显已用不摆假分母", async () => {
    const { viewModel } = await buildAssetsViewModelReal(
      fakeClient({
        assets: [],
        projects: [],
        storage: { usedBytes: 5_000_000, totalBytes: 0 },
      }),
    );
    expect(viewModel.storage.usedBytes).toBe(5_000_000);
    expect(viewModel.storage.totalBytes).toBe(0);
    expect(viewModel.storage.totalLabel).toBe("");
  });

  it("a per-asset usage read failure contributes no usage rows (never throws)", async () => {
    const { viewModel } = await buildAssetsViewModelReal(
      fakeClient({
        assets: [
          {
            id: firstAsset.id,
            currentFileId: firstFile.id,
            assetType: "image",
            name: "OK 素材",
            description: "d",
            updatedAt: "2026-06-01T00:00:00.000Z",
          },
          {
            id: "asset-bad",
            currentFileId: firstFile.id,
            assetType: "image",
            name: "BAD 素材",
            description: "d",
            updatedAt: "2026-06-01T00:00:00.000Z",
          },
        ],
        projects: [{ id: "proj-ok", title: "OK" }],
        usage: {
          [firstAsset.id]: [
            {
              id: "l1",
              projectId: "proj-ok",
              entityType: "asset",
              entityId: firstAsset.id,
              role: "clip",
              stage: "production",
              createdAt: "2026-06-05T00:00:00.000Z",
            },
          ],
          "asset-bad": "throw",
        },
      }),
    );
    expect(viewModel.usageHistory).toHaveLength(1);
    expect(viewModel.usageHistory[0]!.assetId).toBe(firstAsset.id);
  });

  it("returns honest EMPTY (not seed) when the assets read succeeds with no rows", async () => {
    const { state, viewModel, projects } = await buildAssetsViewModelReal(
      fakeClient({ assets: [], projects: [] }),
    );
    // A fresh empty account reads its OWN emptiness, NOT user-zyongzhu's seed.
    expect(state).toBe("ready");
    expect(viewModel.assets).toEqual([]);
    expect(viewModel.usageHistory).toEqual([]);
    expect(viewModel.storage.usedBytes).toBe(0);
    expect(projects).toEqual([]);
  });

  it("returns the ERROR tri-state (no fabricated fixture VM) when the assets read throws", async () => {
    const { state, error, viewModel, projects } = await buildAssetsViewModelReal(
      fakeClient({ assets: "throw" }),
    );
    // Honest error: NO fabricated gallery rows, an error payload for the page.
    expect(state).toBe("error");
    expect(error?.code).toBe("assets_read_failed");
    expect(viewModel.assets).toEqual([]);
    expect(viewModel.usageHistory).toEqual([]);
    expect(projects).toEqual([]);
  });
});
