import {z} from "zod";
import {id, iso8601} from "../primitives";

export const workRequestId = z.string().min(8).max(128);
export const workFingerprint = z.string().regex(/^[a-f0-9]{64}$/);
export const workRevision = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);

// SEMANTIC_BOUNDARY_ALLOW: 只校验明确身份及选区，不选择创作内容。
const distinct = (values: readonly string[]) => new Set(values).size === values.length;
export const workAssetFile = z.object({assetId: id, assetFileId: id}).strict();
export const workRuleRef = z.object({versionId: id}).strict();

/** textDigest 是完整字段 UTF-8 SHA256；位置为 UTF-16，end 不含。 */
export const momentsTextRange = z.object({
  start: workRevision, end: workRevision, textDigest: workFingerprint,
}).strict().refine(v => v.end > v.start, {message: "文字选区必须非空"});
export const momentsSourceSelection = z.discriminatedUnion("mode", [
  z.object({mode: z.literal("whole")}).strict(),
  z.object({mode: z.literal("selected"),
    fields: z.array(z.enum(["text", "imageUses"])),
    textRanges: z.array(momentsTextRange),
  }).strict(),
]).superRefine((v, ctx) => {
  if (v.mode !== "selected") return;
  if (!v.fields.length && !v.textRanges.length)
    ctx.addIssue({code: "custom", message: "必须明确选择来源内容"});
  if (!distinct(v.fields))
    ctx.addIssue({code: "custom", message: "来源字段重复", path: ["fields"]});
  if (v.fields.includes("text") && v.textRanges.length)
    ctx.addIssue({code: "custom", message: "不能同时全选文字和文字范围"});
  for (let i = 0; i < v.textRanges.length; i++) {
    const range = v.textRanges[i]!;
    for (let j = 0; j < i; j++) {
      const prior = v.textRanges[j]!;
      if (range.textDigest !== prior.textDigest ||
          (range.start < prior.end && prior.start < range.end))
        ctx.addIssue({code: "custom", message: "文字范围重叠或全文摘要不一致", path: ["textRanges", i]});
    }
  }
});
export const workBasisSelection = z.discriminatedUnion("mode", [
  z.object({mode: z.literal("whole")}).strict(),
  z.object({mode: z.literal("selected"),
    fields: z.array(z.enum(["topic", "claims", "factItems"])),
    claimIds: z.array(id), factItemIds: z.array(id),
  }).strict(),
]).superRefine((v, ctx) => {
  if (v.mode !== "selected") return;
  if (!v.fields.length && !v.claimIds.length && !v.factItemIds.length)
    ctx.addIssue({code: "custom", message: "必须明确选择依据"});
  if (!distinct(v.fields) || !distinct(v.claimIds) || !distinct(v.factItemIds))
    ctx.addIssue({code: "custom", message: "依据选择重复"});
  if ((v.fields.includes("claims") && v.claimIds.length) ||
      (v.fields.includes("factItems") && v.factItemIds.length))
    ctx.addIssue({code: "custom", message: "不能同时全选集合和集合中的项"});
});
export const momentsSourceAnchor = z.object({
  kind: z.literal("moments_version"), momentsId: id, artifactId: id,
  versionId: id, selectionDigest: workFingerprint, selection: momentsSourceSelection,
}).strict();
export const workBasisSourceAnchor = z.object({
  kind: z.literal("work_basis_version"), compositionId: id, artifactId: id,
  versionId: id, selectionDigest: workFingerprint, selection: workBasisSelection,
}).strict();
