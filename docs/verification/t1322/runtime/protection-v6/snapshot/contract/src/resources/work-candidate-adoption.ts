import {z} from 'zod';
import {id} from '../primitives';
import {articleDocument} from './articles';
import {graphicPostDocument} from './graphic-posts';
import {workEditorCandidate} from './work-editor';
import {workCreationProposalResult} from './work-creation';
export const workAssistantSource=z.object({taskId:id,callId:id,toolCallId:id,candidateDigest:z.string().regex(/^sha256:[a-f0-9]{64}$/)}).strict();
export type WorkAssistantSource=z.infer<typeof workAssistantSource>;
export const workMetadataSelection=z.array(z.enum(['title','summary','tags'])).max(3).refine(v=>new Set(v).size===v.length,'元信息选择不能重复');
export const workFactSelection=z.discriminatedUnion('mode',[z.object({mode:z.literal('keep')}).strict(),z.object({mode:z.literal('replace'),expectedBeforeDigest:z.string().regex(/^sha256:[a-f0-9]{64}$/),proposedFactsDigest:z.string().regex(/^sha256:[a-f0-9]{64}$/)}).strict()]);
const common={adoptionMode:z.literal('assistant'),expectedCurrentVersionId:id,assistantSource:workAssistantSource,fieldSelection:workMetadataSelection,policyVersion:z.literal(1),clientRequestId:z.string().min(8).max(128)};
export const articleAssistedVersionBody=z.object({...common,factSelection:workFactSelection}).strict();
export const graphicAssistedVersionBody=z.object(common).strict();
export type ArticleAssistedVersionBody=z.infer<typeof articleAssistedVersionBody>;
export type GraphicAssistedVersionBody=z.infer<typeof graphicAssistedVersionBody>;
export const articleManualVersionBody=z.object({expectedCurrentVersionId:id,document:articleDocument,clientRequestId:z.string().min(8).max(128)}).strict();
export const graphicManualVersionBody=z.object({expectedCurrentVersionId:id,document:graphicPostDocument,clientRequestId:z.string().min(8).max(128)}).strict();
export const workCandidateSourceResult=z.union([
 z.object({assistantSource:workAssistantSource,toolName:z.literal('work.editor.propose'),candidate:workEditorCandidate}).strict(),
 z.object({assistantSource:workAssistantSource,toolName:z.literal('work.creation.propose'),candidate:workCreationProposalResult}).strict(),
]);
export type WorkCandidateSourceResult=z.infer<typeof workCandidateSourceResult>;
