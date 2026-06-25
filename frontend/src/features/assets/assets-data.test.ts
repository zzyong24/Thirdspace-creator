/**
 * Unit tests for the Assets Center READ-side assembly (GAP-AST-1).
 *
 * Locks the 读侧做真 contract of `buildAssetsViewModelReal`:
 *   - gallery summaries come from REAL `assets.list` rows,
 *   - 用料历史 (usageHistory) is the REAL `assets.usage.list` asset edges,
 *     read per asset by id (用料反查, Option B), title resolved from projects.list,
 *   - 存储「已用」is the弱真 Σ of the read rows' real fileSizeBytes,
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
}

function fakeClient(data: FakeData): AssetsDataClient {
  return {
    async listAssets() {
      if (data.assets === "throw") throw new Error("assets read failed");
      return data.assets ?? [];
    },
    async listProjects() {
      if (data.projects === "throw") throw new Error("projects read failed");
      return data.projects ?? [];
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
  };
}

describe("buildAssetsViewModelReal (GAP-AST-1 读侧做真)", () => {
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

  it("storage 已用 is the 弱真 sum of the read rows' real fileSizeBytes", async () => {
    const { viewModel } = await buildAssetsViewModelReal(
      fakeClient({
        assets: [
          {
            id: firstAsset.id,
            currentFileId: firstFile.id,
            assetType: firstFile.mimeType.startsWith("image/")
              ? "image"
              : "document",
            name: "n",
            description: "d",
            updatedAt: "2026-06-01T00:00:00.000Z",
          },
        ],
        projects: [],
      }),
    );
    expect(viewModel.storage.usedBytes).toBe(firstFile.fileSize);
    expect(viewModel.storage.usedBytes).toBeGreaterThan(0);
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
