import { describe, expect, it } from "vitest";
import { listAllProjectMaterialAssets } from "./material-export-pagination";

describe("listAllProjectMaterialAssets", () => {
  it("项目超过 100 条素材时仍收齐全部素材参与导出", async () => {
    const links = Array.from({ length: 125 }, (_, index) => ({
      id: `link-${index}`,
      entityType: "asset",
      entityId: `asset-${index}`,
      role: index === 0 ? "clip" : "broll",
    }));
    const result = await listAllProjectMaterialAssets(
      "project-many-assets",
      async ({ page, pageSize }) => ({
        rows: links.slice((page - 1) * pageSize, page * pageSize),
        total: links.length,
      }),
    );
    expect(result).toHaveLength(125);
    expect(result[0]).toEqual({ assetId: "asset-0", role: "clip" });
    expect(result.at(-1)?.assetId).toBe("asset-124");
  });
});
