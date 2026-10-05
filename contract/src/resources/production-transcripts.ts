import {z} from 'zod';
import {productionEditorRequestId} from './production-editor';
import {productionSourceTranscript} from './production-main-track';
const id=z.string().min(1).max(256),revision=z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
export const productionTranscriptCreateBody=z.object({sourceId:id,granularity:z.enum(["text","segment","word"]).optional(),expectedRevision:revision,requestId:productionEditorRequestId}).strict();
export const productionTranscriptAdoptBody=z.object({transcriptRequestId:productionEditorRequestId,expectedRevision:revision,requestId:productionEditorRequestId}).strict();
export const productionTranscriptRequest=z.object({requestId:productionEditorRequestId,taskId:id.nullable(),executionTaskId:id.nullable(),status:z.string().min(1).max(128),sourceId:id,transcript:productionSourceTranscript.nullable(),warnings:z.array(z.string())}).strict();
