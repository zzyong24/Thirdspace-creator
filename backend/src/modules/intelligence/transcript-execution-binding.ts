import {and,eq,itemTranscripts,intelligenceItems} from '@creatoros/backend';
import {transcribeAudioKey,transcribePlatformSourceSchema,type TranscribePlatformSource} from '@creatoros/contract/execution-worker';
import type {TranscribeExecutionScope} from '../execution/transcribe-execution-binding';
import {ConflictError} from '../execution/execution.errors';
import {intelligenceWorkspaceFilter} from './intelligence-workspace-scope';
type Item = Pick<typeof intelligenceItems.$inferSelect,'canonicalUrl'|'externalId'|'platform'|'captureChannel'>;
type BoundSource =
 | {captureChannel:'everyinfra';source:TranscribePlatformSource;awemeId:string}
 | {captureChannel:'legacy-douyin-cdp';source:TranscribePlatformSource|null;awemeId:string|null};

export function bindIntelligenceTranscriptSource(item:Item,payload:Record<string,unknown>):BoundSource {
 if(payload.source!==undefined){
  const source=transcribePlatformSourceSchema.safeParse(payload.source);
  if(!source.success||item.captureChannel!=='everyinfra'||source.data.platform!==item.platform||source.data.externalId!==item.externalId){
   throw new ConflictError('情报逐字稿与原作品 ID 不符');
  }
  return {captureChannel:'everyinfra',source:source.data,awemeId:transcribeAudioKey(source.data)};
 }
 if(payload.sourceUrl!==item.canonicalUrl)throw new ConflictError('情报逐字稿与原任务来源不符');
 const awemeId=item.platform==='douyin'?(item.externalId??item.canonicalUrl.match(/\/video\/([^/?#]+)/)?.[1]??null):null;
 return {captureChannel:'legacy-douyin-cdp',source:awemeId?{platform:'douyin',externalId:awemeId}:null,awemeId};
}
/** 原 item transcript 行、来源及 execution claim 三方绑定；不是 ai_task 映射。 */
export async function bindIntelligenceTranscript(scope:TranscribeExecutionScope){
 const {task,context,tx}=scope,payload=task.payload as Record<string,unknown>;
 const [item]=await tx.select().from(intelligenceItems).where(and(eq(intelligenceItems.id,task.ownerId),intelligenceWorkspaceFilter(intelligenceItems,context)));
 const [transcript]=item?await tx.select().from(itemTranscripts).where(and(eq(itemTranscripts.itemId,item.id),eq(itemTranscripts.executionTaskId,task.id),intelligenceWorkspaceFilter(itemTranscripts,context))):[];
 if(task.kind!=='transcribe'||task.ownerType!=='item'||!transcript||!item||transcript.itemId!==item.id||payload.itemId!==item.id)throw new ConflictError('情报逐字稿与原任务来源不符');
 return {item,transcript,...bindIntelligenceTranscriptSource(item,payload)};
}
