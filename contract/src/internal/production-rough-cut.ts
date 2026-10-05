import {z} from 'zod';
import {productionEditorRequestId} from '../resources/production-editor';
/** Internal original AI input refers to the unique production reservation, not client-provided plan. */
export const productionRoughCutTaskInput=z.object({projectId:z.string().min(1).max(256),contentOutputId:z.string().min(1).max(256),productionRequestId:productionEditorRequestId,frozenInputDigest:z.string().regex(/^sha256:[a-f0-9]{64}$/)}).strict();
export type ProductionRoughCutTaskInput=z.infer<typeof productionRoughCutTaskInput>;
