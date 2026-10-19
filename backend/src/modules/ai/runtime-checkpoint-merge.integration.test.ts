// @vitest-environment node
import {it,expect,vi} from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {isDeepStrictEqual} from 'node:util';
import {createDb,aiTasks,eq,sql,type Db} from '@creatoros/backend';
import type {RequestContext} from '@creatoros/contract';
const gate=vi.hoisted(()=>({armed:false,taskId:'',reads:0,ready:null as (()=>void)|null,boundary:'requireTask',release:null as Promise<void>|null}));
// 仅在真实repository读回后设置可重复并发屏障；写入与service caller保持生产实现。
vi.mock('./ai.repository',async original=>{
 const actual=await original<typeof import('./ai.repository')>();
 return {...actual,createAiRepository:(...args:Parameters<typeof actual.createAiRepository>)=>{
  const repo=actual.createAiRepository(...args);const patch=(repo as any).patchTaskRuntimeData;
  return {...repo,async requireTask(taskId:string){const row=await repo.requireTask(taskId);
   if(gate.armed&&gate.boundary==='requireTask'&&taskId===gate.taskId){gate.reads++;if(gate.reads===3)gate.ready?.();await gate.release;}return row;},...(typeof patch==='function'?{async patchTaskRuntimeData(taskId:string,input:unknown){if(gate.armed&&gate.boundary==='patchTaskRuntimeData'&&taskId===gate.taskId){gate.reads++;if(gate.reads===3)gate.ready?.();await gate.release;}return patch(taskId,input);}}:{})};
 }};
});
import {createAiService,type ServiceDeps} from './ai.service';
import {createAiRepository} from './ai.repository';
it('三个真实checkpoint caller并发不能覆盖同root已提交的来源绑定或彼此字段',async()=>{
 expect(process.env.T1328_CHECKPOINT_APPROVED).toBe('1');
 const root=process.env.T1328_CHECKPOINT_OUTPUT;expect(root).toBeTruthy();fs.mkdirSync(root!,{recursive:true});
 const save=(name:string,value:unknown)=>fs.writeFileSync(path.join(root!,name+'.json'),JSON.stringify(value,null,2)+'\n');
 let unlock:(()=>void)|undefined;let pending:Promise<unknown>[]=[];
 const f=await createDb();let seq=0;const now=()=>new Date().toISOString(),nextId=(prefix:string)=>`t1328-checkpoint-${prefix}-${++seq}`;
 const ctx:RequestContext={userId:'t1328-checkpoint-owned',accountId:'t1328-checkpoint-account',requestId:'t1328',source:'ai'};
 try{
  const repo=createAiRepository(f.db,{userId:ctx.userId,accountId:ctx.accountId!,now,nextId});
  const task=await repo.createTask({projectId:null,contentOutputId:null,taskType:'copilot.assist',inputData:{},modelKey:'test-no-model',idempotencyKey:'t1328-checkpoint-owned',requestedAt:now(),runtimeData:{executionRoute:{schemaVersion:1,engine:'codex'},untouched:{sentinel:1}}});
  const service=createAiService({db:f.db,now,nextId} as unknown as ServiceDeps);
  let ready!:()=>void;const allRead=new Promise<void>(r=>{ready=r;});
  gate.boundary=typeof (repo as any).patchTaskRuntimeData==='function'?'patchTaskRuntimeData':'requireTask';gate.armed=true;gate.taskId=task.id;gate.reads=0;gate.ready=ready;gate.release=new Promise<void>(r=>{unlock=r;});
  const checkpoints={multimodalProviderCheckpoint:{schemaVersion:1,state:'fixture-only'},videoDecisionsCheckpoint:{schemaVersion:1,marker:'video'},scriptDraftCheckpoint:{schemaVersion:1,marker:'script'}};
  const jobs=[service.putMultimodalProviderCheckpoint(ctx,task.id,checkpoints.multimodalProviderCheckpoint as never),service.putVideoDecisionsCheckpoint(ctx,task.id,checkpoints.videoDecisionsCheckpoint as never),service.putScriptDraftCheckpoint(ctx,task.id,checkpoints.scriptDraftCheckpoint as never)];
  pending=jobs;const settled=Promise.allSettled(jobs);
  // 已完成3个实际旧快照读取后，在另一合法事务提交root来源绑定，然后恢复三个原caller。
  let barrierTimer:ReturnType<typeof setTimeout>|undefined;try{await Promise.race([allRead,new Promise<never>((_,reject)=>{barrierTimer=setTimeout(()=>reject(Error('T1328_THREE_CHECKPOINT_BOUNDARIES_NOT_REACHED')),180000);})]);}finally{if(barrierTimer)clearTimeout(barrierTimer);}const locks={'source-tool-a':{policyVersion:1,childTaskId:'owned-child-a',sourceDigest:'owned-source-a'}};
  await f.db.transaction(async tx=>{await tx.update(aiTasks).set({runtimeData:sql`jsonb_set(${aiTasks.runtimeData}, '{predictionLocks}', ${JSON.stringify(locks)}::jsonb, true)`}).where(eq(aiTasks.id,task.id));});
  save('CONCURRENT_BINDING_COMMITTED',{taskId:task.id,reads:gate.reads,boundary:gate.boundary,locks,checkpoints,externalModels:0,scope:'仅隔离数据库fixture；不称来源绑定服务已实施'});
  unlock!();const outcomes=await settled;gate.armed=false;
  const [after]=await f.db.select().from(aiTasks).where(eq(aiTasks.id,task.id));
  save('RESULT',{taskId:task.id,outcomes:outcomes.map(x=>({status:x.status,...(x.status==='rejected'?{name:x.reason?.name,message:x.reason?.message}:{})})),after:after?.runtimeData,expected:{predictionLocks:locks,...checkpoints},sourceBindingsPreserved:isDeepStrictEqual((after?.runtimeData as any)?.predictionLocks,locks),externalModels:0});
  expect(outcomes.every(x=>x.status==='fulfilled')).toBe(true);
  expect(after!.runtimeData).toMatchObject({untouched:{sentinel:1},predictionLocks:locks,...checkpoints});
 }finally{gate.armed=false;unlock?.();await Promise.allSettled(pending);gate.ready=null;gate.release=null;await f.client.close();save('CLEANUP',{databaseClosed:true,externalModels:0,sharedCandidateTouched:false});}
},28800000);
