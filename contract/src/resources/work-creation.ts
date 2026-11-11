import {writingContext,resolvedWritingContext} from './work-writing-context';
import {z} from 'zod';
import {id} from '../primitives';
import {articleDocument} from './articles';
import {graphicPostDocument,type GraphicPostDocument} from './graphic-posts';
import {projectScriptSourceRef,projectImageSource} from './project-script-source';

const digest=z.string().regex(/^[a-f0-9]{64}$/);
const member={outputId:id,artifactId:id,baseVersionId:id};
/** 明确两成员与同一已保存稿；身份仍由原任务和各属主核验。 */
export const workCreationTarget=z.object({
 schemaVersion:z.literal(1),clientRequestId:z.string().min(8).max(128),projectId:id,
 writingContext:writingContext.optional(),compositionId:id,compositionRevision:z.number().int().positive(),scriptSourceRef:projectScriptSourceRef,
 scriptConfirmation:z.object({confirmedBy:z.literal('user'),source:z.enum(['current-click','public-request'])}).strict(),
 articleMember:z.object({kind:z.literal('article'),...member}).strict(),
 graphicMember:z.object({kind:z.literal('image'),...member}).strict(),
}).strict();
export type WorkCreationTarget=z.infer<typeof workCreationTarget>;
export const workCreationReadInput=z.object({targetDigest:digest.optional()}).strict();
export const workCreationProposalInput=z.object({targetDigest:digest,article:articleDocument,graphic:graphicPostDocument}).strict();
export type WorkCreationProposalInput=z.infer<typeof workCreationProposalInput>;
/** v3提案仅将空引用作为继承标记；正式文档仍使用graphicPostDocument，由宿主核验并补齐。 */
export const workCreationDraftProposalInput=workCreationProposalInput.extend({
 graphic:graphicPostDocument.extend({
  imageUses:graphicPostDocument.shape.imageUses.optional(),
  ruleSnapshotRef:z.union([graphicPostDocument.shape.ruleSnapshotRef,z.object({}).strict()]).optional(),
 }).strict(),
}).strict();
export type WorkCreationDraftProposalInput=z.infer<typeof workCreationDraftProposalInput>;
export class WorkCreationMetadataConflictError extends Error {
 constructor(){super('规则快照必须保留当前已确认版本；可省略该字段或用空对象继承，不编造版本号。');this.name='WorkCreationMetadataConflictError';}
}
/** SEMANTIC_BOUNDARY_ALLOW: 用原属主同一已保存版本补齐技术字段；内容、来源与显式图片选择不改。 */
export function bindWorkCreationDraftMetadata(raw:WorkCreationDraftProposalInput,base:Pick<GraphicPostDocument,'imageUses'|'ruleSnapshotRef'>):WorkCreationProposalInput {
 const draft=workCreationDraftProposalInput.parse(raw),ref=draft.graphic.ruleSnapshotRef;
 const inherited=ref===undefined||(ref!==null&&Object.keys(ref).length===0);
 const explicitVersion=ref&&'versionId' in ref?ref.versionId:undefined;
 if(!inherited&&(ref===null?base.ruleSnapshotRef!==null:explicitVersion!==base.ruleSnapshotRef?.versionId))throw new WorkCreationMetadataConflictError();
 return workCreationProposalInput.parse({...draft,graphic:{...draft.graphic,imageUses:draft.graphic.imageUses??base.imageUses,ruleSnapshotRef:base.ruleSnapshotRef}});
}


export const workCreationReadResult=z.object({kind:z.literal('work.creation.read'),schemaVersion:z.literal(1),
 target:workCreationTarget,resolvedWritingContext:resolvedWritingContext.optional(),targetDigest:digest,scriptText:z.string(),scriptSourceRef:projectScriptSourceRef,
 article:articleDocument,graphic:graphicPostDocument,
 images:z.array(projectImageSource),imageState:z.enum(['ready','empty','unavailable']),imageMessage:z.string().optional(),
 error:z.null(),
}).strict();
export type WorkCreationReadResult=z.infer<typeof workCreationReadResult>;
export const workCreationProposalResult=z.object({kind:z.literal('work.creation.propose'),schemaVersion:z.literal(1),
 target:workCreationTarget,targetDigest:digest,article:articleDocument,graphic:graphicPostDocument,
 articleDigest:digest,graphicDigest:digest,scriptSourceRef:projectScriptSourceRef,error:z.null(),
}).strict();
export type WorkCreationProposalResult=z.infer<typeof workCreationProposalResult>;
