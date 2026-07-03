import { z } from "zod";
import { defineEndpoint } from "../endpoints";
import { id, paginationQuery } from "../primitives";
import { materialLinkResource } from "../resources/material-links";

const linkParams = z.object({ linkId: id });

// MaterialLinks (用料链 / Bill-of-Materials, Plan A4) — the 料库⇄创作 connection ops.
// delete is a POST /:linkId/delete (destructive ops are POST in this contract, mirroring
// accounts.archive / outputs.products.delete), not an HTTP DELETE.
export const materialLinksOperations = {
  listMaterialLinks: defineEndpoint({
    id: "materialLinks.list",
    method: "GET",
    path: "/material-links",
    // [T-060③b] projectId 可选:缺省 = 该用户全量 links(素材中心「按项目分组」的反查读)。
    query: paginationQuery.extend({ projectId: id.optional() }),
    response: materialLinkResource,
    isList: true,
    fr: ["FR-MATERIAL-LINK-LIST"],
  }),
  createMaterialLink: defineEndpoint({
    id: "materialLinks.create",
    method: "POST",
    path: "/material-links",
    body: z.object({
      projectId: id,
      contentOutputId: id.nullable().optional(),
      entityType: z.enum(["knowledge", "asset"]),
      entityId: id,
      role: z.string().optional(),
      stage: z.string().optional(),
    }),
    response: materialLinkResource,
    fr: ["FR-MATERIAL-LINK-CREATE"],
  }),
  deleteMaterialLink: defineEndpoint({
    id: "materialLinks.delete",
    method: "POST",
    path: "/material-links/:linkId/delete",
    params: linkParams,
    response: materialLinkResource,
    fr: ["FR-MATERIAL-LINK-DELETE"],
  }),
} as const;
