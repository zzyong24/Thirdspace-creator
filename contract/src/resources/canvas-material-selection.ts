import {z} from 'zod';
import {id} from '../primitives';
import {workAssetFile} from './work-source-anchors';
const checksum=z.string().regex(/^[a-f0-9]{64}$/);
const anchor={canvasId:id,generationLinkId:id,nodeId:id,attemptId:z.string().min(1).max(128),inputRevision:z.number().int().positive(),inputDigest:checksum};
export const canvasMaterialSelectorParams=z.object({canvasId:id,generationLinkId:id}).strict();
export const canvasGenerationMaterialOrigin=z.object({...anchor,taskId:id,resultId:id,executionTaskId:id,callId:id}).strict();
export const committedGeneratedAssetProof=z.object({taskId:id,resultId:id,executionTaskId:id,callId:id,
 receipt:z.object({assetId:id,fileId:id,assetType:z.enum(['image','video']),name:z.string().min(1),checksum,byteLength:z.number().int().positive(),committedAt:z.string().datetime()}).strict(),
 assetStatus:z.enum(['pending','active']),taskStatus:z.enum(['awaiting_confirmation','succeeded'])}).strict();
const available=z.object({status:z.literal('available'),phase:z.enum(['candidate','confirmed']),origin:canvasGenerationMaterialOrigin,file:workAssetFile,checksum,assetType:z.enum(['image','video']),name:z.string().min(1),assetStatus:z.enum(['pending','active']),taskStatus:z.enum(['awaiting_confirmation','succeeded'])}).strict().superRefine((v,ctx)=>{
 if(v.phase==='confirmed'&&(v.assetStatus!=='active'||v.taskStatus!=='succeeded'))ctx.addIssue({code:'custom',message:'生成素材未经过原用户确认'});
 if(v.phase==='candidate'&&v.taskStatus!=='awaiting_confirmation')ctx.addIssue({code:'custom',message:'候选状态与原任务不符'});
});
export const canvasMaterialSelectionResource=z.union([available,
 z.object({status:z.literal('not_ready'),...anchor,taskId:id.nullable(),reason:z.string().min(1)}).strict(),
 z.object({status:z.literal('unverifiable'),...anchor,taskId:id.nullable(),reason:z.string().min(1)}).strict(),
]);
export type CanvasMaterialSelection=z.infer<typeof canvasMaterialSelectionResource>;
