import { projectScriptSourceRef } from "./project-script-source";
import {z} from "zod";
import {id, iso8601} from "../primitives";
import {outputConversionSourceAnchor} from "./output-conversions";
import {workRequestId,workFingerprint,workRevision,workAssetFile,workRuleRef,momentsTextRange,momentsSourceSelection,workBasisSelection,momentsSourceAnchor,workBasisSourceAnchor} from "./work-source-anchors";
export {workRequestId,workFingerprint,workRevision,workAssetFile,workRuleRef,momentsTextRange,momentsSourceSelection,workBasisSelection,momentsSourceAnchor,workBasisSourceAnchor} from "./work-source-anchors";

/** 旧引用保留原协议；新锚点必须由真实 owner 核验。 */
export const workSourceRef = z.union([
  z.object({kind: z.enum(["project", "asset", "intelligence"]), id, versionId: id}).strict(),
  outputConversionSourceAnchor, momentsSourceAnchor, workBasisSourceAnchor, projectScriptSourceRef,
]);
export const workContentSource = z.union([
  outputConversionSourceAnchor, momentsSourceAnchor, workBasisSourceAnchor,
]);
export const workCommittedOwnerVersion = z.union([
  z.object({kind: z.literal("artifact"), artifactId: id, versionId: id}).strict(),
  z.object({kind: z.literal("production"), outputId: id, revision: workRevision}).strict(),
  z.object({kind: z.literal("publication"), publicationId: id, revisionId: id}).strict(),
]);
export const workOwnerVersion = z.union([
  workCommittedOwnerVersion,
  z.object({kind: z.literal("not_saved"), outputId: id}).strict(),
]);
export const workAdoptionReceipt = z.object({
  owner: z.enum(["wechat_article", "graphic_post", "output_script", "publication", "moments"]),
  candidateId: id, clientRequestId: workRequestId, requestDigest: workFingerprint,
  committedAt: iso8601,
  version: z.union([
    z.object({kind: z.literal("artifact"), artifactId: id, versionId: id}).strict(),
    z.object({kind: z.literal("publication"), publicationId: id, revisionId: id}).strict(),
  ]),
}).strict();
/** 必须由真实 owner 的持久提交回执构造，不能把手工保存伪装成 AI 采用。 */
const committedReceipt = {
  clientRequestId: workRequestId, requestDigest: workFingerprint,
  committedAt: iso8601, version: workCommittedOwnerVersion,
};
export const workCommitReceipt = z.discriminatedUnion("kind", [
  z.object({kind: z.literal("AI_adopt"), receipt: workAdoptionReceipt}).strict(),
  z.object({kind: z.literal("manual_save"), ...committedReceipt,
    owner: z.enum(["wechat_article", "graphic_post", "output_script", "production", "publication", "moments"]),
  }).strict(),
  z.object({kind: z.literal("material_attach"), ...committedReceipt,
    associationId: id, file: workAssetFile,
  }).strict(),
]);
export type WorkCommitReceipt = z.infer<typeof workCommitReceipt>;
export type WorkAssetFile = z.infer<typeof workAssetFile>;
export type WorkSourceRef = z.infer<typeof workSourceRef>;
export type WorkContentSource = z.infer<typeof workContentSource>;
export type MomentsSourceAnchor = z.infer<typeof momentsSourceAnchor>;
export type WorkBasisSourceAnchor = z.infer<typeof workBasisSourceAnchor>;
export type WorkAdoptionReceipt = z.infer<typeof workAdoptionReceipt>;
export type WorkOwnerVersion = z.infer<typeof workOwnerVersion>;

export type WorkRuleRef = z.infer<typeof workRuleRef>;
