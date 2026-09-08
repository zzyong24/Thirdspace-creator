
import type { ProjectMaterialsReader, ProjectMaterial } from "../../modules/ai-runtime";
/** 共享业务上下文读取；聊天和持久生成消费同一投影。 */
export function createProjectMaterialsContext(ports: {
assetsService: Pick<ReturnType<typeof import("../../modules/assets").createAssetsService>,"getAsset" | "listFilesByIds">;
materialLinksService: Pick<ReturnType<typeof import("../../modules/material-links").createMaterialLinksService>,"list">;
}) {
const {assetsService,materialLinksService}=ports;
return ((): ProjectMaterialsReader => ({
    listProjectMaterials: async (c, projectId) => {
      // material_links 是「料库⇄创作」一等公民边;list(projectId) 已 user-scoped(repo 用 ctx.userId)。
      const { rows } = await materialLinksService.list(c, {
        projectId,
        page: 1,
        pageSize: 100,
      });
      const assetLinks = rows.filter((r) => r.entityType === "asset");
      const materials: ProjectMaterial[] = [];
      for (const link of assetLinks) {
        try {
          const asset = await assetsService.getAsset(c, link.entityId); // OwnershipError → catch 跳过
          // 只读 document 类(图/视/音不是「资料」,不进硬约束);非文档跳过。
          if (asset.assetType !== "document") continue;
          // 文档抽取的三件套(extractedText/extractStatus/materialSummary)都落在**当前文件**行
          // (切片 a:extracted_text/extract_status 是 asset_files 列,materialSummary 在其 mediaMetadata),
          // 与契约 assetResource 的 file 派生投影同源。故一并从 current file 读(与 toAssetResource 一致)。
          let materialSummary: ProjectMaterial["materialSummary"] = null;
          let extractStatus: string | null = null;
          let extractedText: string | null = null;
          if (asset.currentFileId) {
            const files = await assetsService.listFilesByIds(c, [
              asset.currentFileId,
            ]);
            const file = files[0] ?? null;
            extractStatus = file?.extractStatus ?? null;
            extractedText = file?.extractedText ?? null;
            const meta = (file?.mediaMetadata ?? null) as Record<
              string,
              unknown
            > | null;
            const summary = meta?.materialSummary;
            if (summary && typeof summary === "object" && !Array.isArray(summary)) {
              materialSummary = summary as ProjectMaterial["materialSummary"];
            }
          }
          materials.push({
            name: asset.name,
            priority: link.priority === "high" ? "high" : "normal",
            extractStatus,
            materialSummary,
            extractedText,
          });
        } catch {
          // 单份素材读失败(越权/已删)→ 跳过该条,不牵连其它素材、不阻断写文案/搜索。
          continue;
        }
      }
      return materials;
    },
  }))();
}
