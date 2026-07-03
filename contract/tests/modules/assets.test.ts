import { describe, it, expect } from "vitest";
import { assetResource } from "../../src/resources/assets";
import { assetsOperations } from "../../src/operations/assets";

describe("assets contract", () => {
  it("parses an Asset resource", () => {
    const a = assetResource.parse({
      id: "asset-poster-ainativebrowser",
      userId: "user-zyongzhu",
      currentFileId: "afile-poster-ainativebrowser",
      assetType: "image",
      name: "AI Native Browser 主封面",
      description: "主视频封面图",
      status: "active",
      isFavorite: false,
      // [T-061] file 派生字段(current asset_file 投影;headless row → null)。
      mimeType: "image/png",
      fileSize: 245760,
      width: 1920,
      height: 1080,
      durationMs: null,
      deletedAt: null,
      createdAt: "2026-06-06T02:00:00.000Z",
      updatedAt: "2026-06-06T02:00:00.000Z",
    });
    expect(a.assetType).toBe("image");
    expect(a.status).toBe("active");
  });

  it("rejects an unknown asset status", () => {
    expect(() =>
      assetResource.parse({
        id: "a",
        userId: "u",
        currentFileId: "f",
        assetType: "image",
        name: "n",
        description: "",
        status: "trashed", // not an Asset status member
        deletedAt: null,
        createdAt: "2026-06-06T02:00:00.000Z",
        updatedAt: "2026-06-06T02:00:00.000Z",
      }),
    ).toThrow();
  });

  it("registers the assets list + upload-complete endpoints with FR ids", () => {
    expect(assetsOperations.listAssets.method).toBe("GET");
    expect(assetsOperations.listAssets.path).toBe("/assets");
    expect(assetsOperations.listAssets.isList).toBe(true);
    expect(assetsOperations.completeUpload.method).toBe("POST");
    expect(assetsOperations.completeUpload.path).toBe(
      "/assets/uploads/:uploadId/complete",
    );
    expect(assetsOperations.listAssets.fr.length).toBeGreaterThan(0);
  });
});
