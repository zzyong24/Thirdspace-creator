import { collectAllPages } from "@/lib/complete-pagination";

export interface MaterialExportLinkRow {
  readonly id: string;
  readonly entityType: string;
  readonly entityId: string;
  readonly role: string;
}

export interface MaterialExportLinkPage {
  readonly rows: ReadonlyArray<MaterialExportLinkRow>;
  readonly total: number;
}

export async function listAllProjectMaterialAssets(
  projectId: string,
  listPage: (input: {
    projectId: string;
    page: number;
    pageSize: number;
  }) => Promise<MaterialExportLinkPage>,
): Promise<Array<{ assetId: string; role: string }>> {
  const rows = await collectAllPages<MaterialExportLinkRow>({
    pageSize: 100,
    getKey: (link) => link.id,
    fetchPage: async (page, pageSize) => {
      const result = await listPage({ projectId, page, pageSize });
      return {
        rows: result.rows,
        hasNext: page * pageSize < result.total,
      };
    },
  });
  return rows
    .filter((link) => link.entityType === "asset")
    .map((link) => ({ assetId: link.entityId, role: link.role }));
}
