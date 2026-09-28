import {z} from "zod";

const id=z.string().min(1).max(128);
const point=z.object({x:z.number().finite().min(-1_000_000).max(1_000_000),y:z.number().finite().min(-1_000_000).max(1_000_000)}).strict();
const common={id,position:point,label:z.string().max(160)};
const textNode=z.object({...common,type:z.literal("text"),text:z.string().max(10_000)}).strict();
const mediaNode=z.object({...common,type:z.enum(["image","video"]),assetId:id,fileId:id.optional(),checksum:z.string().max(256).optional()}).strict();
const generationNode=z.object({...common,type:z.enum(["image_generation","video_generation"]),prompt:z.string().max(10_000),mode:z.enum(["text_to_image","image_to_image","text_to_video","image_to_video"]),referenceAssetId:id.optional(),aspectRatio:z.string().max(32).optional(),durationSec:z.number().int().min(1).max(3600).optional(),resolution:z.enum(["768P","2K"]).optional()}).strict().superRefine((node,ctx)=>{
 if((node.type==="image_generation")!==node.mode.endsWith("_image"))ctx.addIssue({code:"custom",message:"节点类型与生成模式不符"});
 if(!node.mode.startsWith("image_to_")&&node.referenceAssetId)ctx.addIssue({code:"custom",message:"文生模式不能携带参考图"});
});
export const canvasNodeSchema=z.union([textNode,mediaNode,generationNode]);
export const canvasEdgeSchema=z.object({id,source:id,target:id,label:z.string().max(160).optional()}).strict();
export const canvasDocumentSchema=z.object({schemaVersion:z.literal(1),viewport:z.object({x:z.number().finite(),y:z.number().finite(),zoom:z.number().finite().min(0.05).max(4)}).strict(),nodes:z.array(canvasNodeSchema).max(300),edges:z.array(canvasEdgeSchema).max(600)}).strict();
export type CanvasDocument=z.infer<typeof canvasDocumentSchema>;
export type CanvasNode=z.infer<typeof canvasNodeSchema>;
export const emptyCanvasDocument:CanvasDocument={schemaVersion:1,viewport:{x:0,y:0,zoom:1},nodes:[],edges:[]};

export const creativeCanvasResource=z.object({id,userId:id,accountId:id,title:z.string(),projectId:id.nullable(),document:canvasDocumentSchema,revision:z.number().int().positive(),createdAt:z.string(),updatedAt:z.string(),archivedAt:z.string().nullable()}).strict();
export const canvasGenerationLinkResource=z.object({id,canvasId:id,nodeId:id,attemptId:id,taskId:id.nullable(),mediaKind:z.enum(["image","video"]),inputRevision:z.number().int().positive(),inputDigest:z.string(),referenceFileId:id.nullable(),referenceChecksum:z.string().nullable(),resultAssetId:id.nullable(),createdAt:z.string(),updatedAt:z.string()}).strict();
const operationId=id;
export const canvasProposalOperationSchema=z.discriminatedUnion("type",[
 z.object({type:z.literal("addNode"),operationId,tempId:id,node:canvasNodeSchema}).strict(),
 z.object({type:z.literal("updateNode"),operationId,nodeId:id,patch:z.object({label:z.string().max(160).optional(),text:z.string().max(10_000).optional(),prompt:z.string().max(10_000).optional(),mode:z.enum(["text_to_image","image_to_image","text_to_video","image_to_video"]).optional(),referenceAssetId:id.nullable().optional()}).strict()}).strict(),
 z.object({type:z.literal("moveNode"),operationId,nodeId:id,position:point}).strict(),
 z.object({type:z.literal("deleteNode"),operationId,nodeId:id}).strict(),
 z.object({type:z.literal("connect"),operationId,source:id,target:id,label:z.string().max(160).optional()}).strict(),
 z.object({type:z.literal("disconnect"),operationId,edgeId:id}).strict(),
]);
export const canvasProposalResource=z.object({id,canvasId:id,baseRevision:z.number().int().positive(),operations:z.array(canvasProposalOperationSchema).max(100),status:z.enum(["pending","applied","discarded"]),appliedRevision:z.number().int().positive().nullable(),createdAt:z.string(),expiresAt:z.string()}).strict();
export const canvasGenerationCapabilitiesResource=z.object({modes:z.array(z.object({mode:z.enum(["text_to_image","image_to_image","text_to_video","image_to_video"]),available:z.boolean(),model:z.string().nullable(),reason:z.string().nullable()}).strict()).length(4)}).strict();
export type CreativeCanvasResource=z.infer<typeof creativeCanvasResource>;
