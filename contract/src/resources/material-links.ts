import { z } from "zod";
import { id, iso8601 } from "../primitives";

// MaterialLink (用料链 / Bill-of-Materials, Plan A4). The edge recording that a project
// (and optionally a specific content output) USES a library item — a KnowledgeItem or
// an Asset — with a role + stage + provenance. The single source of truth for the wire
// shape; the module's `<module>.schema.ts` re-exports it.
export const materialLinkResource = z.object({
  id,
  userId: id,
  projectId: id,
  contentOutputId: id.nullable(),
  entityType: z.enum(["knowledge", "asset"]),
  entityId: id,
  role: z.string(),
  stage: z.string(),
  addedByType: z.string(),
  // [T-146 切片 b] 项目内优先级(用户裁决②:二元自动,用户上传 = 最高)。落在 material_link
  // 这条边(项目内语义:同一素材在不同项目可不同优先级)。派生规则在 service 层
  // (addedByType='user'→high / 'ai'→normal),字段留扩展位(日后手动 pin 只需写这一列)。
  priority: z.string(),
  createdAt: iso8601,
});
export type MaterialLinkResource = z.infer<typeof materialLinkResource>;
