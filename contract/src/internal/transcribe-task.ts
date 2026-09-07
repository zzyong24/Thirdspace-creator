import {z} from 'zod';
import {assetCredentialSchema} from './asset-generation';
import {asrIdentitySchema,asrTranscriptSchema} from './execution-asr';
/** 只保留识别和受管音频校验实际消费的配置；密钥不能进入任务。 */
export const transcribeConfigurationSchema=z.object({
 kind:z.literal('audio'),provider:z.string().min(1).max(128),model:z.string().min(1).max(512),baseUrl:assetCredentialSchema.shape.baseUrl,
 serviceId:z.string().min(1).max(512).optional(),apiFormat:z.string().max(128).optional(),displayModelKey:z.literal('channel-managed').optional(),credentialLifecycle:z.enum(['persistent','per_request']).optional(),
 settings:z.object({maxDurationSeconds:z.union([z.number(),z.string()]).optional(),maxBytes:z.union([z.number(),z.string()]).optional()}).strict().optional(),
}).strict();
export const transcribeTaskInputSchema=z.object({kind:z.literal('transcribe.douyin'),awemeIds:z.array(z.string().min(1).max(128)).min(1).max(10000),language:z.string().min(1).max(128),configuration:transcribeConfigurationSchema}).strict().refine(input=>new Set(input.awemeIds).size===input.awemeIds.length,'作品不能重复');
export const transcribeAsrPlanSchema=z.object({schemaVersion:z.literal(1),identity:asrIdentitySchema,audioDigest:z.string().regex(/^sha256:[a-f0-9]{64}$/),audioByteLength:z.number().int().positive().max(2147483647)}).strict();
export type TranscribeConfiguration=z.infer<typeof transcribeConfigurationSchema>;

/** 仅用于宿主与执行进程之间；成功恢复不再携带密钥。 */
export const transcribeAsrPreparationSchema=z.discriminatedUnion('status',[
 z.object({status:z.literal('restored'),plan:transcribeAsrPlanSchema,result:asrTranscriptSchema.extend({text:z.string()})}).strict(),
 z.object({status:z.literal('prepared'),plan:transcribeAsrPlanSchema,spec:transcribeConfigurationSchema.extend({token:z.string()}).strict()}).strict(),
]);

export const transcribeLocalFallbackSchema=z.object({plan:transcribeAsrPlanSchema,sourceCallIds:z.array(z.string().min(1)).min(1).max(10000),reason:z.enum(['rejected','empty'])}).strict();
