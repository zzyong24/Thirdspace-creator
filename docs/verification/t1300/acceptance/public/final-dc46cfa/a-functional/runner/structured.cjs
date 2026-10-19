"use strict";
const s=require('./support.cjs');const {expect,rpc,save,uuid}=s;
async function observeTask(page,task,id,groupId='grp-bcda7005-6'){
 let current;await expect.poll(async()=>{current=await rpc(page,'ai.tasks.get',{params:{taskId:task.id}},groupId);save('actions/'+id+'/original-task',current);return ['succeeded','awaiting_confirmation','failed','cancelled','unknown_result','blocked','waiting_user','partial','paused'].includes(current.status)||['succeeded','failed','cancelled','unknown_result','blocked','waiting_user','partial','paused'].includes(current.runtimeStatus);},{timeout:1800000,intervals:[2000,5000]}).toBe(true);
 const results=await rpc(page,'ai.tasks.results.list',{params:{taskId:task.id}},groupId);save('actions/'+id+'/results',results);save('actions/'+id+'/steps',await rpc(page,'ai.tasks.steps.list',{params:{taskId:task.id}},groupId));expect(['succeeded','awaiting_confirmation']).toContain(current.status);expect(results.length).toBeGreaterThan(0);return {task:current,results};
}
async function createTask(page,taskType,inputData,id,groupId){const attemptId=uuid();const task=await rpc(page,'ai.tasks.create',{body:{taskType,attemptId,inputData}},groupId);save('actions/'+id+'/submission',{aiTaskId:task.id,executionTaskId:task.executionTaskId??null,attemptId,taskType,createdAt:task.requestedAt,protocol:'structured-persistent-task'});return observeTask(page,task,id,groupId);}
async function confirm(page,result,id,groupId){const value=await rpc(page,'ai.tasks.confirm',{params:{taskId:result.task.id}},groupId);save('actions/'+id+'/confirmed',value);return value;}
module.exports={...s,observeTask,createTask,confirm};
