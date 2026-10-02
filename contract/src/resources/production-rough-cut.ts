import {z} from 'zod';
import {productionEditorRequestId} from './production-editor';
const id=z.string().min(1).max(256),revision=z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),digest=z.string().regex(/^sha256:[a-f0-9]{64}$/);
export const productionRoughTextSelection=z.object({start:z.number().int().nonnegative(),end:z.number().int().positive(),offsetEncoding:z.literal('utf16')}).strict().refine(v=>v.end>v.start);
const transcriptSelection=z.union([
 z.object({transcriptId:id,tokenIds:z.array(id).min(1).max(20000).refine(ids=>new Set(ids).size===ids.length)}).strict(),
 z.object({transcriptId:id,textSelection:productionRoughTextSelection}).strict(),
]);
export const productionRoughCutCreateBody=z.object({expectedRevision:revision,requestId:productionEditorRequestId,selection:z.object({sceneId:id.optional(),trackId:id.optional(),clipIds:z.array(id).min(1).max(20000).refine(ids=>new Set(ids).size===ids.length),transcriptSelection:transcriptSelection.optional()}).strict(),instruction:z.string().min(1).max(20000)}).strict();
export const productionRoughCutModelSuggestion=z.object({suggestionId:id,decision:z.enum(['keep','remove','review']),target:z.discriminatedUnion('kind',[
 z.object({kind:z.literal('clip'),clipId:id}).strict(),
 z.object({kind:z.literal('tokens'),clipId:id,transcriptId:id,tokenIds:z.array(id).min(1).max(20000).refine(ids=>new Set(ids).size===ids.length)}).strict(),
 z.object({kind:z.literal('unlocated_text'),transcriptId:id,textSelection:productionRoughTextSelection}).strict(),
]),reason:z.string().min(1).max(20000),uncertainty:z.string().max(20000)}).strict();
export const productionRoughCutModelOutput=z.object({suggestions:z.array(productionRoughCutModelSuggestion).max(1000),summary:z.string().max(20000)}).strict().refine(v=>new Set(v.suggestions.map(s=>s.suggestionId)).size===v.suggestions.length);
export const productionRoughCutAdoptBody=z.object({candidateRequestId:productionEditorRequestId,suggestionIds:z.array(id).min(1).max(1000).refine(ids=>new Set(ids).size===ids.length),expectedRevision:revision,requestId:productionEditorRequestId,nativeImpactConfirmation:z.object({suggestionIds:z.array(id).min(1).max(1000).refine(ids=>new Set(ids).size===ids.length),sceneDigest:digest}).strict().optional(),rebind:z.object({observedCurrentRevision:revision,expectedTouchDigest:digest}).strict().optional()}).strict();
export const productionNativeRoughImpact=z.object({sceneId:id,trackId:id,sceneDigest:digest,ticksPerSecond:z.literal(120000),suggestions:z.array(z.object({suggestionId:id,removedRanges:z.array(z.object({startTick:revision,endTick:revision}).strict()),shiftedElementIds:z.array(id),independentItems:z.array(z.object({trackId:id,elementId:id,type:z.string(),startTick:revision,endTick:revision,reasonCode:z.literal('INDEPENDENT_TIMELINE_ITEM')}).strict())}).strict()).max(1000)}).strict();
export type ProductionNativeRoughImpact=z.infer<typeof productionNativeRoughImpact>;
export const productionRoughCutRequest=z.object({requestId:productionEditorRequestId,candidateId:id,baseRevision:revision,taskId:id.nullable(),executionTaskId:id.nullable(),runtimeStatus:z.string().nullable(),status:z.enum(['reserved','queued','running','awaiting_confirmation','succeeded','failed','cancelled','waiting_user','unknown_result','partial']),summary:z.string(),suggestions:z.array(productionRoughCutModelSuggestion.extend({adopted:z.boolean(),actionability:z.enum(['actionable','review_only','non_actionable','covered_by_receipt','needs_regeneration']),reasonCode:z.string().nullable(),coveredByReceiptId:id.nullable()})),currentTouchDigest:digest,coverage:z.object({clipIds:z.array(id),uncoveredClipIds:z.array(id)}).strict(),warnings:z.array(z.string()),nativeImpact:productionNativeRoughImpact.optional()}).strict();

export const productionRoughCutCreated=z.object({candidateId:id,taskId:id,baseRevision:revision}).strict();
