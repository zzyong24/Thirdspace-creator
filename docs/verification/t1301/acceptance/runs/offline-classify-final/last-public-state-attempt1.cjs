'use strict';
const fs=require('node:fs'),path=require('node:path');
const out=__dirname;
const ready=JSON.parse(fs.readFileSync('docs/verification/t1301/acceptance/candidate/runs/owned-b9fa0008e50e6287/ready.json','utf8'));
const session=JSON.parse(fs.readFileSync(ready.sessionPath,'utf8'));
const ui=JSON.parse(fs.readFileSync('docs/verification/t1302/acceptance/runs/final-2168294-a-ui/a/A1302-WINDOW-RESULT.json','utf8'));
const prior=JSON.parse(fs.readFileSync('docs/verification/t1301/acceptance/runs/final-2168294-a-classify/a/A1301-WINDOW-RESULT.json','utf8'));
if(session.ownedRoot!=='/private/tmp/t1300-candidate-Co1DpL'||session.baseURL!=='http://127.0.0.1:64881'||ui.groupId!==prior.groupId)throw Error('EXACT_OWNED_BINDING_REQUIRED');
async function main(){
 const rows=[];
 for(const task of [{aiTaskId:prior.aiTaskId,executionTaskId:prior.executionTaskId},...ui.realModelTasks]){
  const response=await fetch(session.baseURL+'/api/v1/dispatch',{method:'POST',headers:{'content-type':'application/json','x-creatoros-handshake':session.handshake,'x-group-id':ui.groupId},body:JSON.stringify({id:'ai.tasks.get',input:{params:{taskId:task.aiTaskId}}}),signal:AbortSignal.timeout(120000)});
  const body=await response.json();if(!response.ok()||body.success===false)throw Error('ORIGINAL_TASK_GET_REJECTED:'+response.status);
  const d=body.data;const row={aiTaskId:task.aiTaskId,expectedExecutionTaskId:task.executionTaskId,executionTaskId:d.executionTaskId,status:d.status,runtimeStatus:d.runtimeStatus??null,attempt:d.attempt??null,observedAt:new Date().toISOString()};rows.push(row);
  if(d.id!==task.aiTaskId||d.executionTaskId!==task.executionTaskId||d.status!=='succeeded')throw Error('ORIGINAL_TASK_NOT_TERMINAL_OR_BINDING_CHANGED');
 }
 fs.writeFileSync(path.join(out,'LAST_PUBLIC_TASK_STATES.json'),JSON.stringify({groupId:ui.groupId,ownedRoot:session.ownedRoot,sourceHead:ready.sourceHead,rows,allFourSucceeded:true,newTasksCreated:0,oldUnknownResubmitted:false,controllerStopped:false},null,2)+'\n');console.log(JSON.stringify({originalTasks:rows.length,allSucceeded:true,newTasks:0}));
}
main().catch(error=>{fs.writeFileSync(path.join(out,'LAST_PUBLIC_TASK_STATES_FAILURE.json'),JSON.stringify({message:error.message,at:new Date().toISOString()})+'\n');console.error(error.message);process.exitCode=1;});
