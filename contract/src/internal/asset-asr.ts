import {assetAsrPcmMappingReceipt,assetAsrProviderTiming} from "./asset-asr-timing";
import {transcribeConfigurationSchema} from './transcribe-task';
import {transcribeAudioReceiptSchema} from './execution-transcribe-audio';
import {z} from 'zod';
import {productionMainTrack} from '../resources/production-main-track';
import {asrIdentitySchema,asrRequestSchema} from './execution-asr';
const sha=z.string().regex(/^[a-f0-9]{64}$/),prefixed=z.string().regex(/^sha256:[a-f0-9]{64}$/),id=z.string().min(1),revision=z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
export const assetAsrInput=z.object({kind:z.literal('asset.asr'),projectId:id,contentOutputId:id,source:productionMainTrack.shape.sources.element,language:z.literal('zh'),timestampMode:z.enum(['text','segment','word']),extractionProtocolVersion:z.literal('asset-original-audio.v1'),configuration:transcribeConfigurationSchema}).strict();
export type AssetAsrInput=z.infer<typeof assetAsrInput>;
export const internalAssetAsrTaskCreate=z.object({taskType:z.literal('asset.asr'),attemptId:z.string().min(16).max(128),inputData:assetAsrInput}).strict();
const originalReservation=z.object({ownerCreateBody:internalAssetAsrTaskCreate,ownerCreateBodyDigest:sha}).strict();
const asrWorkspace=z.object({userId:id,accountId:id.nullable(),groupId:id.nullable(),groupVersion:z.number().int().positive().nullable(),membershipVersion:z.number().int().positive().nullable()}).strict();
// 旧freeze保持原严格形状；新版本明确任务创建协议与真实会员冻结，不给旧对象补默认值。
export const productionAssetAsrReservationFrozen=z.union([originalReservation,originalReservation.extend({schemaVersion:z.literal(2),creationScope:z.object({userId:id,accountId:id.nullable(),groupId:id.nullable()}).strict(),workspaceScope:asrWorkspace}).strict()]);
export const rational=z.object({num:z.string().regex(/^-?(0|[1-9]\d*)$/),den:z.string().regex(/^[1-9]\d*$/)}).strict();
// This candidate never exports precision editing. A mapping is evidence, not inferred word timing.
export const assetAsrAudioEvidence=z.object({schemaVersion:z.literal(1),assetFileId:id,fileDigest:sha,sourceStreamIndex:revision,sourceClockOrigin:rational.nullable(),firstDecodedSamplePts:rational,sampleRate:z.number().int().positive(),decodedValidSampleCount:revision,initialSkipSamples:revision.nullable(),trailingDiscardSamples:revision.nullable(),probeEvidenceDigest:sha,extractorArgumentsDigest:sha,audioDigest:prefixed,audioByteLength:z.number().int().positive(),mappingStatus:z.enum(['unverified','verified']),mappingReceipt:assetAsrPcmMappingReceipt.optional(),reason:z.string().min(1)}).strict();
export const assetAsrStoredAudio=z.object({receipt:transcribeAudioReceiptSchema,evidence:assetAsrAudioEvidence}).strict();
export const assetAsrEffectivePlan=z.object({identity:asrIdentitySchema,timestampMode:z.enum(['text','segment','word']),protocolVersion:z.literal('asset-asr-text.v1'),audioDigest:prefixed,audioByteLength:z.number().int().positive(),audioManifestDigest:sha.optional()}).strict();
export const assetAsrTranscript=z.object({text:z.string().max(1900000),language:z.string().max(128).optional(),timing:assetAsrProviderTiming.optional()}).strict();
export const assetAsrCallEntry=z.object({callId:id,operationKey:id,requestDigest:sha,resultDigest:sha,chunkIndex:revision,chunkDigest:prefixed,chunkByteLength:z.number().int().positive()}).strict();
export const assetAsrFallback=z.object({fromPlanDigest:sha,toPlanDigest:sha,reason:z.enum(['rejected','empty']),selectionReceiptId:id,sourceCalls:z.array(z.object({callId:id,requestDigest:sha,status:z.enum(['rejected','settled']),resultDigest:sha.nullable(),rejectionStatus:z.number().int().nullable()}).strict()).min(1)}).strict();
export const assetAsrAggregate=z.object({aggregateReceiptId:id,taskId:id,executionTaskId:id,executionInputDigest:sha,sourceIdentityDigest:sha,audioSourceMappingDigest:sha,audioManifestDigest:sha,effectiveAsrPlan:assetAsrEffectivePlan,effectiveAsrPlanDigest:sha,orderedCalls:z.array(assetAsrCallEntry).min(1),requiredCallIds:z.array(id).min(1),fallbackProvenance:z.array(assetAsrFallback),assemblyProtocolVersion:z.literal('asset-asr-text.v1'),granularity:z.enum(['text','segment','word']),timing:assetAsrProviderTiming.optional(),timingReceipt:z.object({callId:id,durableReceiptId:id,rawResponseDigest:prefixed,extractionReceiptId:id,extractionDigest:prefixed,mappingDigest:prefixed}).strict().optional(),tokens:z.array(z.object({tokenId:id,text:z.string(),startTicks:revision,endTicks:revision}).strict()).optional(),text:z.string().max(1900000),textDigest:sha,language:z.string().optional(),aggregateDigest:sha,createdAt:id}).strict().superRefine((v,c)=>{if(v.granularity!=='text'&&(!v.timing||!v.timingReceipt||!v.tokens?.length))c.addIssue({code:'custom',message:'精确粒度缺少真实全部时码证据'});if(v.granularity==='text'&&(v.tokens!==undefined||v.timingReceipt!==undefined))c.addIssue({code:'custom',message:'全文不能冒充可剪切时码'});});
export type AssetAsrAggregate=z.infer<typeof assetAsrAggregate>;
export const assetAsrRequest=asrRequestSchema;
export const assetAsrResultReceipt=z.object({schemaVersion:z.literal(1),result:assetAsrTranscript}).strict();

export type AssetAsrTranscript=z.infer<typeof assetAsrTranscript>;
