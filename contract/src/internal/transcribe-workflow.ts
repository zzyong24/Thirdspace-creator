import {z} from 'zod';
const item=z.object({awemeId:z.string().min(1).max(128)}).strict();
export const transcribeSourceSchema=z.discriminatedUnion('kind',[
 z.object({kind:z.literal('video'),playUrl:z.string().url(),coverUrl:z.string().url().optional()}).strict(),
 z.object({kind:z.literal('image-album')}).strict(),
]);
export const transcribeItemReceiptSchema=z.object({awemeId:z.string(),status:z.enum(['existing','saved','image-album','failed','no-project']),projectId:z.string().nullable(),error:z.string().nullable()}).strict();
export const transcribeWorkflowPortSchemas={
 prepareTranscribeItem:item,
 fetchLoggedInTranscribeSource:item,
 recordTranscribeSource:item.extend({source:transcribeSourceSchema}).strict(),
 saveTranscribeArtifact:item,
 failTranscribeItem:item.extend({error:z.string().min(1).max(4000)}).strict(),
 completeTranscribeTask:z.object({}).strict(),
 acquireTranscribeChannel:item.extend({channel:z.enum(['iesdouyin','creator-center'])}).strict(),
 reportTranscribeChannel:item.extend({channel:z.enum(['iesdouyin','creator-center']),result:z.union([z.object({kind:z.literal('success')}).strict(),z.object({kind:z.enum(['captcha','empty-item-list','router-data-missing','net-timeout']),consecutiveTimeouts:z.number().int().positive().optional()}).strict()])}).strict(),
};
