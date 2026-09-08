import {z} from 'zod';
const item=z.object({awemeId:z.string().min(1).max(128)}).strict();
export const transcribeSourceSchema=z.discriminatedUnion('kind',[
 z.object({kind:z.literal('video'),playUrl:z.string().url(),coverUrl:z.string().url().optional()}).strict(),
 z.object({kind:z.literal('image-album')}).strict(),
]);
export const transcribeItemReceiptSchema=z.object({awemeId:z.string(),status:z.enum(['existing','saved','image-album','failed','no-project']),projectId:z.string().nullable(),error:z.string().nullable()}).strict();
export const transcribeWorkflowPortSchemas={
 prepareTranscribeItem:item,
 acquireTranscribeProfile:item,
 recordTranscribeSource:item.extend({source:transcribeSourceSchema}).strict(),
 saveTranscribeArtifact:item,
 failTranscribeItem:item.extend({error:z.string().min(1).max(4000)}).strict(),
 completeTranscribeTask:z.object({}).strict(),
 acquireTranscribeChannel:item.extend({channel:z.enum(['iesdouyin','creator-center'])}).strict(),
 reportTranscribeChannel:item.extend({channel:z.enum(['iesdouyin','creator-center']),result:z.union([z.object({kind:z.literal('success')}).strict(),z.object({kind:z.enum(['captcha','empty-item-list','router-data-missing','net-timeout']),consecutiveTimeouts:z.number().int().positive().optional()}).strict()])}).strict(),
};
/** 仅来源读操作的可恢复故障；不用于ASR/模型或工件提交回执。 */
export const transcribeSourceFailureSchema=z.object({sourceFailure:z.object({outcome:z.enum(['waiting_user','retry_wait']),errorCode:z.enum(['TRANSCRIBE_LOGIN_REQUIRED','TRANSCRIBE_SOURCE_COOLDOWN','TRANSCRIBE_SOURCE_UNAVAILABLE']),retryAfterMs:z.number().int().nonnegative().max(2147483647).optional()}).strict()}).strict();

/** 路径只由宿主从当前账号解析；Worker不得提交路径或资源摘要。 */
export const transcribeProfileSchema=z.object({authDir:z.string().min(1),profileKey:z.string().regex(/^[a-f0-9]{64}$/),leaseId:z.string().uuid()}).strict();
