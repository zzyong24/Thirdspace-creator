'use strict';
const {expect,save,rpc}=require('./support.cjs');
async function submit(page,dialog,text,label){
 const responsePromise=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/chat'&&r.request().method()==='POST',{timeout:900000});
 await dialog.getByRole('textbox',{name:'我能帮你做什么',exact:true}).fill(text);
 await expect(dialog.getByRole('button',{name:'提交提示给 Copilot',exact:true})).toBeEnabled();
 await dialog.getByRole('button',{name:'提交提示给 Copilot',exact:true}).click();
 const response=await responsePromise,h=response.headers();
 const ids={conversationId:h['x-conversation-id'],sourceMessageId:h['x-source-message-id'],aiTaskId:h['x-ai-task-id'],executionTaskId:h['x-execution-task-id']};
 save(label+'-submission',{httpStatus:response.status(),...ids,observedAt:new Date().toISOString()});
 if(response.status()!==200){save(label+'-http-error',{httpStatus:response.status(),body:await response.text()});}
 expect(response.status()).toBe(200);for(const id of Object.values(ids))expect(id).toBeTruthy();
 let last;
 await expect.poll(async()=>{
  last=await rpc(page,'execution.tasks.get',{params:{taskId:ids.executionTaskId}});
  const safe={id:last.id,ownerId:last.ownerId,groupId:last.groupId,status:last.status,runtimeStatus:last.runtimeStatus,lastErrorCode:last.lastErrorCode,lastErrorMessage:last.lastErrorMessage,createdAt:last.createdAt,updatedAt:last.updatedAt};
  save(label+'-task',{...ids,task:safe,observedAt:new Date().toISOString()});
  return ['succeeded','blocked','waiting_user','failed','cancelled','unknown_result','paused','partial'].includes(last.runtimeStatus??last.status);
 },{timeout:1200000,intervals:[2000,5000]}).toBe(true);
 const messages=await rpc(page,'ai.conversations.messages.list',{params:{conversationId:ids.conversationId}});save(label+'-messages',messages);
 expect(last.runtimeStatus??last.status,'原任务失败保留ID，不自动重发').toBe('succeeded');
 const assistant=messages.find(m=>m.role==='assistant'&&m.modelMetadata?.sourceMessageId===ids.sourceMessageId);expect(assistant).toBeTruthy();expect(assistant.modelMetadata.actualEngine).toBe('codex');
 const textContent=assistant.content??assistant.parts?.filter(p=>p.type==='text').map(p=>p.text).join('')??'';expect(textContent.length).toBeGreaterThan(0);save(label+'-public-output',{...ids,text:textContent,modelMetadata:assistant.modelMetadata});
 return {ids,assistant,text:textContent};
}
module.exports={submit};
