import {z} from 'zod';
import {id} from '../primitives';
import {articleDocument} from './articles';
import {graphicPostDocument} from './graphic-posts';
import {projectScriptSourceRef,projectImageSource} from './project-script-source';

const digest=z.string().regex(/^[a-f0-9]{64}$/);
const member={outputId:id,artifactId:id,baseVersionId:id};
/** 明确两成员与同一已保存稿；身份仍由原任务和各属主核验。 */
export const workCreationTarget=z.object({
 schemaVersion:z.literal(1),clientRequestId:z.string().min(8).max(128),projectId:id,
 compositionId:id,compositionRevision:z.number().int().positive(),scriptSourceRef:projectScriptSourceRef,
 scriptConfirmation:z.object({confirmedBy:z.literal('user'),source:z.literal('current-click')}).strict(),
 articleMember:z.object({kind:z.literal('article'),...member}).strict(),
 graphicMember:z.object({kind:z.literal('image'),...member}).strict(),
}).strict();
export type WorkCreationTarget=z.infer<typeof workCreationTarget>;
export const workCreationReadInput=z.object({targetDigest:digest.optional()}).strict();
export const workCreationProposalInput=z.object({targetDigest:digest,article:articleDocument,graphic:graphicPostDocument}).strict();
export type WorkCreationProposalInput=z.infer<typeof workCreationProposalInput>;
export const workCreationReadResult=z.object({kind:z.literal('work.creation.read'),schemaVersion:z.literal(1),
 target:workCreationTarget,targetDigest:digest,scriptText:z.string(),scriptSourceRef:projectScriptSourceRef,
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
