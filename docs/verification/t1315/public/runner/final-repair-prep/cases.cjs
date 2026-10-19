'use strict';
// 实际公共操作工厂；没有顶层执行。future fixture必须先验真实新package/owned范围。
const assert=require('node:assert/strict');
function createCases(h){
 async function inspectAndEvents(taskId,{foreignGroupId}={}){
  await h.preflight();const before=await h.call('execution.tasks.get',{params:{taskId}});
  const inspect=await h.allSequence('workbench.tasks.inspect',taskId),events=await h.allSequence('workbench.tasks.events',taskId);
  assert(inspect.length&&events.length);for(const p of inspect){assert.equal(p.task.id,taskId);assert(Array.isArray(p.calls));assert(Array.isArray(p.frozenTools));}
  if(foreignGroupId){assert.notEqual(foreignGroupId,h.binding.groupId);for(const id of ['workbench.tasks.inspect','workbench.tasks.events']){const denied=await h.call(id,{params:{taskId},query:{afterSequence:0,limit:100}},{groupId:foreignGroupId,allowReject:true});assert.equal(denied.rejected,true);await h.save('workbench-foreign-'+id,denied);}}
  const after=await h.call('execution.tasks.get',{params:{taskId}});await h.save('workbench-readback',{taskId,before,inspect,events,after});
  if(['succeeded','failed','cancelled','awaiting_confirmation'].includes(before.runtimeStatus??before.status))assert.deepEqual(after,before,'终态读取/foreign负例不写原任务');
  return {taskId,inspect,events};
 }
 async function thesis({projectId,topic}){
  await h.preflight();const initial=await h.artifacts(projectId),submittedAt=h.clock();
  const task=await h.once('thesis-create','ai.tasks.create',{body:{taskType:'planning.thesis',attemptId:'t1315-final-thesis-'+h.uuid(),inputData:{projectId,topic}}});
  const terminal=await h.waitAi('thesis',task.id,submittedAt);await h.save('thesis-candidate',{initial,task,terminal,candidate:await h.readAi(task.id)});
  assert.equal(terminal.task?.status,'awaiting_confirmation','原任务失败/未知不换key重发');
  const confirmed=await h.once('thesis-confirm','ai.tasks.confirm',{params:{taskId:task.id}}),after=await h.artifacts(projectId),final=await h.readAi(task.id);
  await h.save('thesis-final',{taskId:task.id,confirmed,after,final});assert.equal(final.task.status,'succeeded');assert(after.items.some(a=>a.artifactType==='thesis_tree'),'必须真实论点artifact读回');
  // 未另建付费合同/outline样本；旧PASS精确消费者等价时由最终汇总单列引用。
  return {taskId:task.id,confirmed,after};
 }
 async function collect({rssUrl,displayName,profileWindow}){
  assert.equal(profileWindow?.exclusive,true,'共享profile须C明确时窗');await h.preflight();
  const source=await h.once('rss-source','intelligence.sources.create',{body:{collectionId:null,type:'rss',config:{type:'rss',url:rssUrl},displayName,monitorEnabled:false,runInitial:false,idempotencyKey:'t1315-final-source-'+h.uuid()}});
  assert.equal(source.run,null);assert.equal(source.task,null);const sourceId=source.source.id,submittedAt=h.clock();
  const task=await h.once('agentic-collect','execution.tasks.create',{body:{attemptId:'t1315-final-collect-'+h.uuid(),spec:{taskType:'agentic.collect',goal:`只采集本次公开来源 ${sourceId}。先collect.plan核对该ID，再collect.run提交该目标一次；保留真实runId，必要时递增observation调用collect.status，只有ok=true才说完成，不采其它来源或另起采集。`,inputs:[],params:{maxSteps:20,maxTokens:100000},constraints:{timeoutSec:1800,network:'deny',maxOutputMB:512}}}});
  // 现行execution.tasks.create契约复用exec.* AI task投影；不可把其id直接冒durable execution id。
  const terminal=await h.waitAi('agentic-collect',task.id,submittedAt),readback=await h.readAi(task.id);
  const items=await h.allOffset('intelligence.items.list',{query:{sourceId,sort:'newest'}});const first=items[0]?.item?.id??items[0]?.id;const detail=first?await h.call('intelligence.items.get',{params:{itemId:first}}):null;
  await h.save('collect-final',{sourceId,taskId:task.id,terminal,readback,items,detail,manualRunsStarted:0});
  assert(['succeeded','awaiting_confirmation'].includes(terminal.task?.status),'原采集失败/UNKNOWN如实留原ID');
  assert(items.length>0,'真实0条不得冒采集/后续消费成功');return {sourceId,taskId:task.id,readback,items,detail};
 }
 async function mixedChat({projectId,prompt,profileWindow}){
  assert.equal(profileWindow?.exclusive,true,'web/profile排他');await h.preflight();
  const conversation=await h.once('mixed-conversation','ai.conversations.create',{body:{title:'新候选真实系统与网页工具验收',projectId,scope:'global'}}),submittedAt=h.clock();
  const message=await h.once('mixed-message','ai.conversations.messages.create',{params:{conversationId:conversation.id},body:{executionEngine:'codex',content:prompt}});
  const taskId=message.modelMetadata?.chatTaskId;assert(taskId,'已提交消息缺taskID先保UNKNOWN，不第二次提交');const terminal=await h.waitAi('mixed-chat',taskId,submittedAt),readback=await h.readAi(taskId),messages=await h.call('ai.conversations.messages.list',{params:{conversationId:conversation.id}});
  await h.save('mixed-chat-final',{conversationId:conversation.id,sourceMessageId:message.id,taskId,terminal,readback,messages});assert.equal(terminal.task?.status,'succeeded','不重发旧UNKNOWN或本次失败');
  if(terminal.task.executionTaskId)await inspectAndEvents(terminal.task.executionTaskId);
  // 工具实际parts/冻结定义、proposal与ordinary回执须最终执行者逐操作核；不能仅根succeeded签U33/34。
  return {taskId,readback,messages};
 }
 async function agentic({taskType,goal,inputs=[],params={},profileWindow}){
  assert(['agentic.material','agentic.research'].includes(taskType));assert.equal(profileWindow?.exclusive,true);await h.preflight();
  const submittedAt=h.clock(),task=await h.once(taskType,'execution.tasks.create',{body:{attemptId:'t1315-final-'+taskType.replaceAll('.','-')+'-'+h.uuid(),spec:{taskType,goal,inputs,params:{maxSteps:20,maxTokens:100000,...params},constraints:{timeoutSec:1800,network:'deny',maxOutputMB:512}}}});
  const terminal=await h.waitAi(taskType,task.id,submittedAt),readback=await h.readAi(task.id);await h.save(taskType+'-final',{task,terminal,readback,coverage:params.dryRun===true?'真实公开准入/原dry-run，不冒完整业务能力':'真实原任务；结果须按实际工具与业务读回逐项核'});
  return {task,terminal,readback};
 }
 async function unknownAndDeterministic(){
  await h.preflight();const before=await h.allOffset('ai.tasks.list'),unknown=await h.once('unknown-type','execution.tasks.create',{body:{attemptId:'t1315-final-unknown-'+h.uuid(),spec:{taskType:'agentic.unknown',goal:'公开未知类型负例',inputs:[],params:{},constraints:{timeoutSec:1800,network:'deny',maxOutputMB:512}}}},{allowReject:true});
  assert.equal(unknown.rejected,true);const after=await h.allOffset('ai.tasks.list');assert.deepEqual(after.map(t=>t.id).sort(),before.map(t=>t.id).sort(),'未知类型不创建task');
  const submittedAt=h.clock(),echo=await h.once('deterministic-echo','execution.tasks.create',{body:{attemptId:'t1315-final-echo-'+h.uuid(),spec:{taskType:'echo.manifest',goal:'原确定性回显准入',inputs:[],params:{goal:'原确定性回显准入'},constraints:{timeoutSec:600,network:'deny',maxOutputMB:512}}}});const terminal=await h.waitAi('deterministic-echo',echo.id,submittedAt);assert.equal(terminal.task?.status,'awaiting_confirmation');await h.save('deterministic-echo-readback',await h.readAi(echo.id));
  const discarded=await h.once('deterministic-echo-discard','execution.tasks.discard',{params:{taskId:echo.id}});await h.save('admission-boundaries',{unknown,echo,terminal,discarded});return {unknown,echo,discarded};
 }
 return {inspectAndEvents,thesis,collect,mixedChat,agentic,unknownAndDeterministic};
}
module.exports={createCases};
