import {requireWorkspace,workspaceFilter,assertWritableWorkspace} from "../../workspace-scope";
import {and,eq,itemTranscripts,intelligenceItems} from '@creatoros/backend';
import type {TranscribeExecutionScope} from '../execution/transcribe-execution-binding';
import {ConflictError} from '../execution/execution.errors';
/** 原 item transcript 行、来源及 execution claim 三方绑定；不是 ai_task 映射。 */
export async function bindIntelligenceTranscript(scope:TranscribeExecutionScope){
 const {task,context,tx}=scope,payload=task.payload as Record<string,unknown>;
 const [transcript]=await tx.select().from(itemTranscripts).where(and(eq(itemTranscripts.executionTaskId,task.id),eq(itemTranscripts.userId,context.userId),workspaceFilter(itemTranscripts,context)));
 const [item]=await tx.select().from(intelligenceItems).where(and(eq(intelligenceItems.id,task.ownerId),eq(intelligenceItems.userId,context.userId),workspaceFilter(intelligenceItems,context)));
 if(task.kind!=='transcribe'||task.ownerType!=='item'||!transcript||!item||transcript.itemId!==item.id||payload.itemId!==item.id||payload.sourceUrl!==item.canonicalUrl)throw new ConflictError('情报逐字稿与原任务来源不符');
 const awemeId=item.externalId??item.canonicalUrl.match(/\/video\/([^/?#]+)/)?.[1]??null;
 return {item,transcript,awemeId};
}
