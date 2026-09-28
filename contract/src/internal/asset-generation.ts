import {z} from "zod";

const id=z.string().min(1).max(512).refine(value=>value.trim().length>0,"标识不能为空");
const endpoint=z.string().url().refine(value=>{
 const url=new URL(value);
 return ["http:","https:"].includes(url.protocol) && !url.username && !url.password && !url.search && !url.hash;
},"供应商地址不能包含凭据或查询参数").nullable();
const identity={provider:id,model:id,baseUrl:endpoint,serviceId:id.optional()};
/** 私有素材执行输入；后端冻结供应商身份，密钥另经凭据端口取得。 */
export const assetGenerationInputSchema=z.object({
 kind:z.literal("asset.generate"),operationKey:z.string().min(1).max(200),
 mediaKind:z.enum(["image","video"]),capability:z.enum(["image.generate","image.edit","video.generate"]),
 mode:z.enum(["text_to_image","image_to_image","text_to_video","image_to_video"]).optional(),
 reference:z.object({assetId:id,fileId:id,checksum:z.string().min(1).max(256),mimeType:z.string().min(1).max(128)}).strict().optional(),
 runtimeOptionsDigest:z.string().regex(/^sha256:[a-f0-9]{64}$/).optional(),
 prompt:z.string().min(1).max(100000),...identity,
 aspectRatio:z.string().min(1).max(32).optional(),durationSec:z.number().int().positive().max(3600).optional(),resolution:z.enum(["768P","2K"]).optional(),
}).strict().superRefine((value,ctx)=>{
 if(value.capability!==`${value.mediaKind}.generate` && !(value.mediaKind==="image" && value.capability==="image.edit"))ctx.addIssue({code:"custom",message:"素材类型与能力不符"});
 if(value.mediaKind==="image" && (value.durationSec!==undefined || value.resolution!==undefined))ctx.addIssue({code:"custom",message:"图片不能携带视频规格"});
 if(value.mode){
  const expected=value.mode==="image_to_image"?"image.edit":value.mode==="text_to_image"?"image.generate":"video.generate";
  const expectedKind=value.mode.endsWith("_image")?"image":"video";
  if(value.capability!==expected || value.mediaKind!==expectedKind)ctx.addIssue({code:"custom",message:"生成模式与模型能力不符"});
  if(value.mode.startsWith("image_to_")!==Boolean(value.reference))ctx.addIssue({code:"custom",message:"参考图与生成模式不一致"});
 }else if(value.reference)ctx.addIssue({code:"custom",message:"旧素材任务不能附带参考图"});
});
/** 只表示已提交的外部任务，不表示生成成功或用量已知。 */
export const providerJobSchema=z.object({schemaVersion:z.literal(1),...identity,jobId:id}).strict();
export const providerJobReadSchema=z.object({callId:id}).strict();
export const providerJobRecordSchema=providerJobReadSchema.extend({job:providerJobSchema}).strict();

export const assetRuntimeOptionsSchema=z.object({settings:z.record(z.string(),z.json()).optional(),apiFormat:z.string().optional(),displayModelKey:z.literal("channel-managed").optional(),credentialLifecycle:z.enum(["persistent","per_request"]).optional()}).strict();
export const assetCredentialSchema=assetRuntimeOptionsSchema.extend({...identity,kind:z.enum(["image","video"]),token:z.string().min(1)}).strict();
export const assetResultReceiptSchema=z.object({assetId:id,fileId:id,assetType:z.enum(["image","video"]),name:z.string().min(1),checksum:z.string().min(1),byteLength:z.number().int().positive(),committedAt:z.string().min(1)}).strict();
