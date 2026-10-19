'use strict';
const {expect,save,read,rpc}=require('./support.cjs');
async function settle(page,response,label){
 const h=response.headers(),ids={conversationId:h['x-conversation-id'],sourceMessageId:h['x-source-message-id'],aiTaskId:h['x-ai-task-id'],executionTaskId:h['x-execution-task-id']};
 save(label+'-submission',{httpStatus:response.status(),...ids,observedAt:new Date().toISOString()});
 if(response.status()!==200)save(label+'-http-error',{httpStatus:response.status(),body:await response.text()});expect(response.status()).toBe(200);for(const id of Object.values(ids))expect(id).toBeTruthy();
 let last;await expect.poll(async()=>{last=await rpc(page,'execution.tasks.get',{params:{taskId:ids.executionTaskId}});expect(last.ownerId).toBe(ids.aiTaskId);expect(last.groupId).toBe(read('owned').groupId);save(label+'-task',{...ids,task:{id:last.id,ownerId:last.ownerId,groupId:last.groupId,status:last.status,runtimeStatus:last.runtimeStatus,errorCode:last.errorCode,errorMessage:last.errorMessage,lastErrorCode:last.lastErrorCode,lastErrorMessage:last.lastErrorMessage,createdAt:last.createdAt,updatedAt:last.updatedAt},observedAt:new Date().toISOString()});return ['succeeded','blocked','waiting_user','failed','cancelled','unknown_result','paused','partial'].includes(last.runtimeStatus??last.status);},{timeout:1200000,intervals:[2000,5000]}).toBe(true);
 const messages=await rpc(page,'ai.conversations.messages.list',{params:{conversationId:ids.conversationId}});save(label+'-messages',messages);expect(last.runtimeStatus??last.status,'原任务失败留原ID，不重发').toBe('succeeded');const assistant=messages.find(m=>m.role==='assistant'&&m.modelMetadata?.sourceMessageId===ids.sourceMessageId);expect(assistant).toBeTruthy();expect(assistant.modelMetadata.actualEngine).toBe('codex');return {ids,assistant,messages};
}
module.exports={settle};
