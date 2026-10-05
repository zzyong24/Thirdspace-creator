import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createDb,aiTasks,executionTasks,executionCalls,eq} from '/Users/zyongzhu/.codex/worktrees/user-diagnostics/Thirdspace-creator/backend/src/index.ts';
import {createPersistentTaskService} from '/Users/zyongzhu/.codex/worktrees/user-diagnostics/Thirdspace-creator/backend/src/modules/execution/persistent-task.service.ts';
import {createFrozenModelRetryPort} from '/Users/zyongzhu/.codex/worktrees/user-diagnostics/Thirdspace-creator/backend/src/modules/execution/frozen-model-retry.ts';
const evidenceDir='/tmp/t1060-ai-business/continue-derived';
const previous=JSON.parse(await readFile(join(evidenceDir,'evidence.json'),'utf8'));
assert.ok(previous.isolatedRoot.startsWith(evidenceDir+'/isolated-'));
const opened=await createDb({dataDir:join(previous.isolatedRoot,'db')});
const report:any={observedAt:new Date().toISOString(),scope:'真实隔离任务的原重试门；不调用模型、不修改状态',cases:[],wakeCalls:0,originalUserDatabaseRead:false};
try{
 const execution=createPersistentTaskService(opened.db);
 const retry=createFrozenModelRetryPort({execution,readTask:async(ctx,id)=>{
  const [task]=await opened.db.select().from(aiTasks).where(eq(aiTasks.id,id));
  assert.equal(task.userId,ctx.userId);assert.equal(task.accountId,ctx.accountId);
  return task;
 },wake:()=>{report.wakeCalls++;}});
 for(const input of previous.inputs){
  const [task]=await opened.db.select().from(aiTasks).where(eq(aiTasks.id,input.taskId));
  const ctx={userId:task.userId,accountId:task.accountId,requestId:'t1060-isolated-retry-guard',source:'user' as const};
  const [before]=await opened.db.select().from(executionTasks).where(eq(executionTasks.id,input.executionTaskId));
  const beforeCalls=await opened.db.select().from(executionCalls).where(eq(executionCalls.executionTaskId,input.executionTaskId));
  assert.equal(before.status,'waiting_user');let rejected:any;
  try{await retry(ctx,{taskId:task.id,taskType:task.taskType,clientRequestId:'t1060-isolated-retry-existing-real'});}catch(error){rejected={name:(error as Error).name,code:(error as any).code,message:(error as Error).message};}
  assert.ok(rejected);const [after]=await opened.db.select().from(executionTasks).where(eq(executionTasks.id,input.executionTaskId));
  const afterCalls=await opened.db.select().from(executionCalls).where(eq(executionCalls.executionTaskId,input.executionTaskId));
  assert.deepEqual(after,before);assert.equal(beforeCalls.length,0);assert.equal(afterCalls.length,0);
  report.cases.push({taskId:task.id,taskType:task.taskType,executionTaskId:input.executionTaskId,realExecutionStatus:before.status,retryRejected:rejected,unchanged:true,callsBefore:beforeCalls.length,callsAfter:afterCalls.length});
 }
 assert.equal(report.wakeCalls,0);report.outcome='guard_passed_on_real_waiting_tasks';
}catch(error){report.outcome='harness_error';report.error={name:(error as Error).name,message:(error as Error).message};process.exitCode=1;}
finally{await opened.client.close();await writeFile(join(evidenceDir,'retry-guard.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));}
