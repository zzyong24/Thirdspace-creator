import { z } from "zod";
import {outputConversionContext, graphicPostTextKind,graphicPostDocument, graphicPostSourceRef } from "@creatoros/contract";
import { bindPrompt } from "../prompt/template";
import { GRAPHIC_POST_TEXT_METHOD, GRAPHIC_POST_TEXT_TEMPLATE, graphicPostTextCandidateSchema } from "../prompt/templates/graphic-post-text";
export {GRAPHIC_POST_TEXT_METHOD, graphicPostTextCandidateSchema} from "../prompt/templates/graphic-post-text";

export const graphicPostMethodInputSchema = z.object({
  conversion:outputConversionContext.optional(),
  conversionConstraints:z.object({factItems:z.array(z.unknown()),sourceRefs:z.array(z.object({location:z.string(),refs:z.array(z.unknown())}).strict()),ruleSnapshotRef:z.unknown()}).strict().optional(),
  projectId: z.string().min(1), outputId: z.string().min(1), artifactId: z.string().min(1),
  baseVersionId: z.string().min(1), kind: graphicPostTextKind,
  targetPlatform: z.string().nullable().optional(), brief: z.string(), current: graphicPostDocument,
  sourceRefs: z.array(graphicPostSourceRef),
  sourceMaterials: z.array(z.object({ref: graphicPostSourceRef, label: z.string(), text: z.string()}).strict()),
  ruleSnapshotRef: z.object({versionId: z.string().min(1)}).strict().nullable(),
  ruleGuidance: z.string(),
  ruleOverrides: z.record(z.string(), z.unknown()).optional(),
}).strict();
export type GraphicPostMethodInput = z.infer<typeof graphicPostMethodInputSchema>;

function refKey(ref: z.infer<typeof graphicPostSourceRef>) { return JSON.stringify(["output_version", "moments_version", "work_basis_version"].includes(ref.kind) ? ref : [ref.kind, "id" in ref ? ref.id : undefined, ref.versionId]); }

/** SEMANTIC_BOUNDARY_ALLOW: exact source and kind equality only verify protocol scope; model owns content choices. */
export function buildGraphicPostFacets(raw: unknown): Record<string, string> {
  const input = graphicPostMethodInputSchema.parse(raw);
  if (input.ruleSnapshotRef === null && input.ruleGuidance.trim()) throw new Error("GRAPHIC_POST_RULE_SNAPSHOT_MISMATCH");
  const allowed = new Set(input.sourceRefs.map(refKey));
  for (const source of input.sourceMaterials) if (!allowed.has(refKey(source.ref))) throw new Error("GRAPHIC_POST_SOURCE_MATERIAL_UNBOUND");
  return {graphicPostContext: JSON.stringify(input)};
}

/** The model cannot choose another field or produce media references through this text operation. */
export function validateGraphicPostTextCandidate(raw: unknown, inputRaw: unknown) {
  const input = graphicPostMethodInputSchema.parse(inputRaw);
  const proposal = graphicPostTextCandidateSchema.parse(raw);
  const request=input.conversion?.request;
  if(request && (request.targetType!=="image" || (request.mode==="selected" && !request.targetFields.includes(input.kind))))throw new Error("GRAPHIC_POST_CONVERSION_FIELD_UNAUTHORIZED");
  if (proposal.kind !== input.kind) throw new Error("GRAPHIC_POST_KIND_MISMATCH");
  if(proposal.kind==="cardBriefs"){
    const allowed=new Set([...input.sourceRefs,...input.current.sourceRefs,...(input.current.cardBriefs??[]).flatMap(card=>card.sourceRefs)].map(refKey));
    for(const card of proposal.value)for(const ref of card.sourceRefs)if(!allowed.has(refKey(ref)))throw new Error("GRAPHIC_POST_SOURCE_REF_UNBOUND");
  }
  return proposal;
}

export function buildGraphicPostTextPrompt(input: GraphicPostMethodInput) {
  return bindPrompt(GRAPHIC_POST_TEXT_TEMPLATE, buildGraphicPostFacets(input));
}
