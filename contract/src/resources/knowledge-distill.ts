import {z} from 'zod';
import {id} from '../primitives';
/** Persisted chat location only; client text is never evidence of a model tool result. */
export const knowledgeDistillSource=z.object({conversationId:id,sourceMessageId:id,toolCallId:id}).strict();
export const knowledgeDistillAtom=z.object({index:z.number().int().min(0),type:z.enum(['claim','evidence','quote','qa']),title:z.string().trim().min(1).max(1000),note:z.string().max(100000),sourceNote:z.string().max(10000)}).strict();
export const knowledgeDistillAdoptInput=z.object({source:knowledgeDistillSource,atoms:z.array(knowledgeDistillAtom).min(1).max(200),archiveOriginal:z.boolean()}).strict();
export const knowledgeDistillReceipt=z.object({source:knowledgeDistillSource,taskId:id,callId:id,knowledgeIds:z.array(id),atomCount:z.number().int().positive(),archiveKnowledgeId:id.nullable(),createdAt:z.string()}).strict();
export const knowledgeDistillReceiptResult=z.object({receipt:knowledgeDistillReceipt.nullable()}).strict();
export type KnowledgeDistillSource=z.infer<typeof knowledgeDistillSource>;
export type KnowledgeDistillAdoptInput=z.infer<typeof knowledgeDistillAdoptInput>;
export type KnowledgeDistillReceipt=z.infer<typeof knowledgeDistillReceipt>;
