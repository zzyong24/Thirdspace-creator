import {requireWorkspace,workspaceFilter,assertWritableWorkspace} from "../../workspace-scope";
import {and,eq,itemTranscripts,intelligenceItems} from '@creatoros/backend';
import type {TranscribeExecutionScope} from '../execution/transcribe-execution-binding';
import {ConflictError} from '../execution/execution.errors';
import {intelligenceWorkspaceFilter} from './intelligence-workspace-scope';
/** 原 item transcript 行、来源及 execution claim 三方绑定；不是 ai_task 映射。 */
export async function bindIntelligenceTranscript(scope:TranscribeExecutionScope){
 const {task,context,tx}=scope,payload=task.payload as Record<string,unknown>;
 const [item]=await tx.select().from(intelligenceItems).where(and(eq(intelligenceItems.id,task.ownerId),intelligenceWorkspaceFilter(intelligenceItems,context)));
 const [transcript]=item?await tx.select().from(itemTranscripts).where(and(eq(itemTranscripts.itemId,item.id),eq(itemTranscripts.executionTaskId,task.id),intelligenceWorkspaceFilter(itemTranscripts,context))):[];
 if(task.kind!=='transcribe'||task.ownerType!=='item'||!transcript||!item||transcript.itemId!==item.id||payload.itemId!==item.id||payload.sourceUrl!==item.canonicalUrl)throw new ConflictError('情报逐字稿与原任务来源不符');
 const awemeId=item.externalId??item.canonicalUrl.match(/\/video\/([^/?#]+)/)?.[1]??null;
 return {item,transcript,awemeId};
}
