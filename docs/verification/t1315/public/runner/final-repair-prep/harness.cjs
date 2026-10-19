'use strict';
// PREPARATION_ONLY: 导出工厂；模块加载不读session、不请求网络、不创建任务。
const assert = require('node:assert/strict');
const {randomUUID} = require('node:crypto');
const MIN=120000;
function createHarness({binding,rpc,save,load,verifyCandidate,clock=Date.now}) {
 assert(binding?.executionAuthorized===true && binding?.performanceWindowReleased===true,'尚未获新包业务执行窗口');
 assert(/^[a-f0-9]{40}$/.test(binding.sourceHead??''),'缺真实source');
 assert(binding.sourceHead!=='0e1dc6228f1fa3dc02f2b1c7a1cee77ab18d650a','旧候选不作为新包');
 assert(binding.groupId&&binding.actorId&&binding.candidateBindingSha256,'缺实际owned身份/产物');
 for(const f of [rpc,save,load,verifyCandidate])assert.equal(typeof f,'function');
 assert(binding.requestMs>=900000&&binding.observationMs>=1800000&&binding.outerBudgetSeconds>=86400,'保原长预算');
 const rows=x=>{if(Array.isArray(x))return x;if(Array.isArray(x?.rows))return x.rows;if(Array.isArray(x?.items))return x.items;throw Error('LIST_SHAPE_UNOBSERVED');};
 async function preflight(){const evidence=await verifyCandidate(binding);assert.equal(evidence.sourceHead,binding.sourceHead);assert.equal(evidence.candidateBindingSha256,binding.candidateBindingSha256);assert.equal(evidence.actorId,binding.actorId);assert.equal(evidence.groupId,binding.groupId);assert(evidence.beforeSnapshotVerified&&evidence.performanceWindowReleased);await save('candidate-preflight',evidence);return evidence;}
 async function call(id,input={},options={}){return rpc(id,input,{groupId:binding.groupId,requestMs:binding.requestMs,...options});}
 async function once(name,id,input,options={}){
  const key='actions/'+name;assert.equal(await load(key),null,'原动作已有记录，禁止重发；只能只读恢复原ID');
  await save(key,{status:'STARTED',id,input,sourceHead:binding.sourceHead,startedAt:new Date(clock()).toISOString()});
  try{const result=await call(id,input,options);await save(key,{status:'RETURNED',id,input,result,sourceHead:binding.sourceHead,returnedAt:new Date(clock()).toISOString()});return result;}
  catch(error){await save(key,{status:'UNKNOWN_OR_REJECTED',id,input,errorName:error?.name,code:typeof error?.code==='string'?error.code:null,sourceHead:binding.sourceHead,finishedAt:new Date(clock()).toISOString()});throw error;}
 }
 async function allOffset(id,{params={},query={}}={}){const all=[];for(let offset=0;;offset+=20){const page=rows(await call(id,{params,query:{...query,limit:20,offset}}));all.push(...page);if(page.length<20)return all;}}
 async function allSequence(id,taskId){let afterSequence=0;const pages=[];for(;;){const page=await call(id,{params:{taskId},query:{afterSequence,limit:100}});pages.push(page);if(page.hasMore===false)return pages;assert.equal(page.hasMore,true,'缺分页终态');assert(Number.isSafeInteger(page.nextSequence)&&page.nextSequence>afterSequence,'游标必须真实前进');afterSequence=page.nextSequence;}}
 async function waitAi(name,taskId,submittedAt){
  assert(Number.isFinite(submittedAt));const key='observations/'+name;const previous=await load(key);const absolute=previous?.deadlineAt??submittedAt+binding.observationMs;assert(absolute<=submittedAt+binding.observationMs,'不能续原观察');
  let deadlineAt=absolute,last=null;const mappedIds=new Set();
  for(;;){if(deadlineAt-clock()<MIN){await save(key,{taskId,deadlineAt,last,classification:'原观察耗尽/剩余不足启动正请求，保原ID，不重发'});return {task:last,deadlineAt,classification:'UNKNOWN_OBSERVATION_ENDED'};}
   const task=await call('ai.tasks.get',{params:{taskId}},{deadlineAt});last=task;
   if(task.executionTaskId){mappedIds.add(task.executionTaskId);assert.equal(mappedIds.size,1,'原AI任务映射发生变化');const execution=await call('execution.tasks.get',{params:{taskId:task.executionTaskId}},{deadlineAt});const raw=execution.task??execution;if(raw.deadlineAt){const d=Date.parse(raw.deadlineAt);assert(Number.isFinite(d));deadlineAt=Math.min(deadlineAt,d);}await save(key+'-execution',{aiTaskId:taskId,executionId:task.executionTaskId,execution,observedAt:new Date(clock()).toISOString()});}
   await save(key,{taskId,deadlineAt,task,observedAt:new Date(clock()).toISOString(),classification:'原任务有限观察'});
   if(['succeeded','failed','cancelled','awaiting_confirmation','partial'].includes(task.status)||['waiting_user','unknown_result','awaiting_authorization'].includes(task.runtimeStatus))return {task,deadlineAt,classification:task.runtimeStatus??task.status};
   await new Promise(resolve=>setTimeout(resolve,1500));
  }
 }
 async function readAi(taskId){return {task:await call('ai.tasks.get',{params:{taskId}}),results:await call('ai.tasks.results.list',{params:{taskId}}),steps:await call('ai.tasks.steps.list',{params:{taskId}})};}
 async function artifacts(projectId){const items=await allOffset('artifacts.list',{params:{projectId}});return {project:await call('projects.get',{params:{projectId}}),items,versions:await Promise.all(items.map(async a=>({artifactId:a.id,versions:await allOffset('artifacts.versions.list',{params:{artifactId:a.id}})})))};}
 return {binding,preflight,call,once,allOffset,allSequence,waitAi,readAi,artifacts,save,clock,uuid:randomUUID,rows};
}
module.exports={createHarness};
