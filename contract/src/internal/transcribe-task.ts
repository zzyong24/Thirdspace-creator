import {z} from 'zod';
import {assetCredentialSchema} from './asset-generation';
import {asrIdentitySchema} from './execution-asr';
/** 只保留识别和受管音频校验实际消费的配置；密钥不能进入任务。 */
export const transcribeConfigurationSchema=z.object({
 kind:z.literal('audio'),provider:z.string().min(1).max(128),model:z.string().min(1).max(512),baseUrl:assetCredentialSchema.shape.baseUrl,
 serviceId:z.string().min(1).max(512).optional(),apiFormat:z.string().max(128).optional(),displayModelKey:z.literal('channel-managed').optional(),credentialLifecycle:z.enum(['persistent','per_request']).optional(),
 settings:z.object({maxDurationSeconds:z.union([z.number(),z.string()]).optional(),maxBytes:z.union([z.number(),z.string()]).optional()}).strict().optional(),
}).strict();
export const transcribeTaskInputSchema=z.object({kind:z.literal('transcribe.douyin'),awemeIds:z.array(z.string().min(1).max(128)).min(1).max(10000),language:z.string().min(1).max(128),configuration:transcribeConfigurationSchema}).strict().refine(input=>new Set(input.awemeIds).size===input.awemeIds.length,'作品不能重复');
export const transcribeAsrPlanSchema=z.object({schemaVersion:z.literal(1),identity:asrIdentitySchema,audioDigest:z.string().regex(/^sha256:[a-f0-9]{64}$/),audioByteLength:z.number().int().positive().max(2147483647)}).strict();
export type TranscribeConfiguration=z.infer<typeof transcribeConfigurationSchema>;
