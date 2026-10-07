import { z } from "zod";
import { videoRenderCard, videoRenderBroll, videoBrollMotion } from "./video-render";
import { executionTaskSpec } from "./execution";
import {productionMainEditOptions,productionOverlayAnchor} from "./production-main-track";

// T-1037：只表达用户或模型明确提出的修改，身份/前值由服务端再次校验。
const target = { itemId: z.string().min(1), expectedItemDigest: z.string().regex(/^sha256:[a-f0-9]{64}$/) };
export const productionLegacyEditorEdit = z.discriminatedUnion("type", [
  z.object({type:z.literal("updateCaption"),...target,patch:z.object({
    cn:z.string().min(1).optional(),en:z.string().nullable().optional(),
    start:z.number().nonnegative().optional(),end:z.number().positive().optional(),
  }).strict()} ).strict(),
  // 校验完整卡片结构但不替换原输入，避免解析默认色调覆盖用户已选样式。
  z.object({type:z.literal("updateCard"),...target,card:z.record(z.string(),z.unknown()).superRefine((value,ctx)=>{
    const checked=videoRenderCard.safeParse(value);if(!checked.success)for(const issue of checked.error.issues)ctx.addIssue({...issue,path:issue.path});
  })}).strict(),
  z.object({type:z.literal("updateBroll"),...target,patch:z.object({
    at:z.number().nonnegative().optional(),durationSec:z.number().positive().optional(),
    file:z.string().min(1).optional(),label:z.string().min(1).optional(),motion:videoBrollMotion.optional(),
  }).strict()}).strict(),
  z.object({type:z.literal("updateSceneTitle"),...target,title:z.string().min(1)}).strict(),
  z.object({type:z.literal("removeItem"),...target}).strict(),
  z.object({type:z.literal("addBroll"),broll:videoRenderBroll.extend({anchor:productionOverlayAnchor.optional()})}).strict(),
]);
export type ProductionEditorEdit = z.infer<typeof productionEditorEdit>;
export const productionNativeSceneEdit=z.object({type:z.literal("replaceNativeSceneTracks"),sceneId:z.string().min(1),expectedBeforeDigest:z.string().regex(/^sha256:[a-f0-9]{64}$/),tracks:z.record(z.string(),z.json())}).strict();
export const productionEditorEdit=z.discriminatedUnion("type",[...productionLegacyEditorEdit.options,...productionMainEditOptions,productionNativeSceneEdit]);

export const productionEditorRequestId = z.string().min(16).max(128);
export const productionEditorSource = z.enum(["manual","assistant","restore","legacy"]);
export const productionEditorSaveBody = z.object({expectedRevision:z.number().int().nonnegative(),
  requestId:productionEditorRequestId,plan:z.record(z.string(),z.unknown()),source:productionEditorSource.default("manual"),replaceEditor:z.boolean().optional()}).strict();
export const productionEditorApplyBody = z.object({expectedRevision:z.number().int().nonnegative(),
  requestId:productionEditorRequestId,edits:z.array(productionEditorEdit).min(1).max(1000)}).strict();
export const productionEditorRestoreBody = z.object({expectedRevision:z.number().int().nonnegative(),
  requestId:productionEditorRequestId,sourceRevision:z.number().int().nonnegative()}).strict();
export const productionEditorVersion = z.object({productionId:z.string(),revision:z.number().int().nonnegative(),
  requestId:productionEditorRequestId.nullable(),planDigest:z.string(),source:productionEditorSource,
  plan:z.record(z.string(),z.unknown()),createdAt:z.string()});
export const productionEditorDocument = z.object({outputId:z.string(),projectId:z.string(),productionId:z.string().nullable(),
  revision:z.number().int().nonnegative(),state:z.enum(["empty","legacy","editable"]),
  plan:z.record(z.string(),z.unknown()).nullable(),unsupportedFields:z.array(z.string())});
export const productionEditorHistory = z.object({items:z.array(productionEditorVersion.omit({plan:true})),total:z.number().int().nonnegative()});
export const productionEditorHistoryQuery = z.object({limit:z.number().int().min(1).max(100).default(20),offset:z.number().int().nonnegative().default(0)});
export type ProductionEditorVersion = z.infer<typeof productionEditorVersion>;
export type ProductionEditorDocument = z.infer<typeof productionEditorDocument>;
export type ProductionEditorSaveBody = z.input<typeof productionEditorSaveBody>;
export type ProductionEditorApplyBody = z.input<typeof productionEditorApplyBody>;
export type ProductionEditorRestoreBody = z.input<typeof productionEditorRestoreBody>;
export const productionEditorRenderBody=z.object({revision:z.number().int().positive(),requestId:productionEditorRequestId}).strict();
export const productionEditorRenderRequest=z.object({productionId:z.string(),requestId:productionEditorRequestId,revision:z.number().int().nonnegative(),
  spec:executionTaskSpec,attemptId:z.string(),taskId:z.string().nullable(),assetId:z.string().nullable(),createdAt:z.string()});
export const productionEditorRenders=z.object({items:z.array(productionEditorRenderRequest),total:z.number().int().nonnegative()});
export type ProductionEditorRenderRequest=z.infer<typeof productionEditorRenderRequest>;

// T-1038：草稿预览是纯读取，不形成制作版本或渲染任务。
export const productionEditorPreviewBody=z.object({expectedRevision:z.number().int().nonnegative(),requestId:productionEditorRequestId,plan:z.record(z.string(),z.unknown())}).strict();
export const productionEditorPreview=z.object({html:z.string(),durationSec:z.number().positive(),warnings:z.array(z.string())});
export type ProductionEditorPreviewBody=z.infer<typeof productionEditorPreviewBody>;
export type ProductionEditorPreview=z.infer<typeof productionEditorPreview>;
export const productionSourcePrepareBody=z.object({assetId:z.string().min(1),assetFileId:z.string().min(1),requestId:productionEditorRequestId}).strict();
export const productionSourceAdoptBody=z.object({sourceRequestId:productionEditorRequestId,expectedRevision:z.number().int().nonnegative(),requestId:productionEditorRequestId,addWholeClip:z.boolean().default(true),mediaId:z.string().min(1).max(256).optional()}).strict();
export const productionProbeResult=z.object({timebase:z.object({num:z.number().int().positive(),den:z.number().int().positive()}).strict(),durationTicks:z.number().int().positive(),hasAudio:z.boolean(),fileDigest:z.string().regex(/^[a-f0-9]{64}$/),probeDigest:z.string().regex(/^[a-f0-9]{64}$/)}).strict();
export const productionSourceRequest=z.object({deterministicGeneration:z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).optional(),requestId:productionEditorRequestId,taskId:z.string().nullable(),status:z.enum(["reserved","queued","running","succeeded","failed","cancelled"]),sourceId:z.string(),assetId:z.string(),assetFileId:z.string(),probe:productionProbeResult.nullable(),error:z.string().nullable()}).strict();

export type ProductionSourceRequest=z.infer<typeof productionSourceRequest>;

export const productionSourceRetryBody=z.object({sourceRequestId:productionEditorRequestId,requestId:productionEditorRequestId}).strict();
