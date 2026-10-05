import {z} from 'zod';
import {productionEditorRequestId} from './production-editor';
import {productionPlanV2} from './production-main-track';
const revision=z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const common={expectedRevision:revision,requestId:productionEditorRequestId};
export const productionConversionPrepareBody=z.discriminatedUnion('mode',[
 z.object({...common,mode:z.literal('empty')}).strict(),
 z.object({...common,mode:z.literal('capture-current-original'),mainSourceRequestId:productionEditorRequestId}).strict(),
 z.object({...common,mode:z.literal('explicit-replace-main'),mainSourceRequestId:productionEditorRequestId}).strict(),
]);
export const productionConversionAdoptBody=z.object({...common,conversionRequestId:productionEditorRequestId,conversionDigest:z.string().regex(/^sha256:[a-f0-9]{64}$/)}).strict();
export const productionConversionRequest=z.object({requestId:productionEditorRequestId,conversionId:z.string().min(1),baseRevision:revision,conversionDigest:z.string().regex(/^sha256:[a-f0-9]{64}$/),plan:productionPlanV2,warnings:z.array(z.string())}).strict();
