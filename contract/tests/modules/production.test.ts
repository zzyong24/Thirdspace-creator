import { describe, it, expect } from "vitest";
import { productionResource } from "../../src/resources/production";
import { productionOperations } from "../../src/operations/production";

describe("production contract", () => {
  it("parses a Production resource", () => {
    const p = productionResource.parse({
      id: "production-ainativebrowser-main",
      contentOutputId: "output-ainativebrowser-main",
      productionMode: "studio",
      status: "drafting",
      recordingConfig: { resolution: "1080p", fps: 30 },
      subtitleConfig: { language: "zh-CN" },
      startedAt: null,
      completedAt: null,
      updatedAt: "2026-06-13T02:00:00.000Z",
    });
    expect(p.productionMode).toBe("studio");
    expect(p.status).toBe("drafting");
  });

  it("rejects an unknown production status", () => {
    expect(() =>
      productionResource.parse({
        id: "p",
        contentOutputId: "o",
        productionMode: "studio",
        status: "published", // not a ProductionStatus member
        recordingConfig: {},
        subtitleConfig: {},
        startedAt: null,
        completedAt: null,
        updatedAt: "2026-06-13T02:00:00.000Z",
      }),
    ).toThrow();
  });

  it("registers the production get + segment-create endpoints with FR ids", () => {
    expect(productionOperations.getOutputProduction.method).toBe("GET");
    expect(productionOperations.getOutputProduction.path).toBe(
      "/outputs/:outputId/production",
    );
    expect(productionOperations.createProductionSegment.method).toBe("POST");
    expect(productionOperations.createProductionSegment.path).toBe(
      "/productions/:productionId/segments",
    );
    expect(
      productionOperations.getOutputProduction.fr.length,
    ).toBeGreaterThan(0);
  });

  // [T-366b] 素材包统一导出 op:POST + materialExportResource 返回形状。
  it("registers productions.exports.materials and parses its resource", () => {
    expect(productionOperations.exportProductionMaterials.method).toBe("POST");
    expect(productionOperations.exportProductionMaterials.path).toBe(
      "/productions/:productionId/exports/materials",
    );
    const parsed =
      productionOperations.exportProductionMaterials.response.parse({
        assetId: null,
        downloadUrl: "http://localhost/blob/zip?token=t",
        fileName: "素材包-demo.zip",
        fileCount: 5,
        totalBytes: 1234,
        hasDecisions: false,
      });
    expect(parsed).toMatchObject({
      assetId: null,
      fileCount: 5,
      hasDecisions: false,
    });
    expect(
      productionOperations.exportProductionMaterials.response.parse({
        ...parsed,
        assetId: "asset-legacy-zip",
      }).assetId,
    ).toBe("asset-legacy-zip");
    // 空 downloadUrl 不合法(诚实:没有下载通道就是失败,不返回空壳)。
    expect(() =>
      productionOperations.exportProductionMaterials.response.parse({
        assetId: "a",
        downloadUrl: "",
        fileName: "x.zip",
        fileCount: 0,
        totalBytes: 0,
        hasDecisions: false,
      }),
    ).toThrow();
  });

  it("确认剪辑方案保留同源 B-roll inventory 快照", () => {
    const parsed = productionOperations.confirmProductionEditingPlan.body.parse({
      expectedRevision: 0,
      plan: {
        sourceTaskId: "task-1",
        confirmedAt: "2026-08-10T17:00:00.000Z",
        decisions: { scenes: [] },
        renderProps: { delivery: { width: 1920, height: 1080 } },
        inventory: [
          {
            assetId: "asset-1",
            label: "项目录屏",
            kind: "video",
            description: "",
          },
        ],
      },
    });

    expect(parsed.plan.inventory).toEqual([
      expect.objectContaining({ assetId: "asset-1", label: "项目录屏" }),
    ]);
  });

  it("[T-881] 当前分镜移除 B-roll 使用 revision + 真实 assetId 的窄写契约", () => {
    expect(
      productionOperations.removeProductionEditingPlanBroll.body.parse({
        expectedRevision: 4,
        assetId: "asset-generated-1",
      }),
    ).toEqual({ expectedRevision: 4, assetId: "asset-generated-1" });
    expect(() =>
      productionOperations.removeProductionEditingPlanBroll.body.parse({
        expectedRevision: -1,
        assetId: "",
      }),
    ).toThrow();
  });
});
