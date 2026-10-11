import {expect,it} from 'vitest';
import {codexExecutionSpec,createExecutionRoute} from '@creatoros/contract/execution-worker';
import {originalCodexReadBinding} from './codex-read-recovery';
type Task=Parameters<typeof originalCodexReadBinding>[0];type Call=Parameters<typeof originalCodexReadBinding>[1];
function owner(kind:'topic_preview'|'script_candidate'|'scheduled.flywheel'){
 const identity={schemaVersion:1,capability:kind==='topic_preview'?'topic.generate':'script.draft',...codexExecutionSpec()},input={kind:'model.structured',operationKey:kind==='scheduled.flywheel'?'flywheel:original':'intelligence:task',capability:identity.capability,facets:{title:'原题'},skillId:'original-skill',maxOutputTokens:2048,skillSnapshot:{snapshotVersion:1,userId:'u',accountId:'a',resolvedAt:'fixed',platformPolicyVersion:'1',platformPolicy:'原策略',skills:[{skillId:'original-skill',baseVersion:'1',overlayRevision:null,overlayVersion:null,effective:{methodSystem:'原策略',template:'{{title}}',tools:[],requiredFacets:['title'],contextRequirements:[],outputSchema:{type:'object'},completionPolicy:null,completionPolicyAdapter:null}}]}};
 const call={id:'original-call',executionTaskId:'task',operationKey:`${input.operationKey}/model/1`,parentCallId:null,kind:'model',status:'unknown',startedAttempt:1,providerJob:null,toolExecutionClaimId:null} as Call;
 const payload={executionRoute:createExecutionRoute('codex'),codexCalls:{[call.id]:{threadId:'original-thread',turnId:'original-turn'}},...(kind==='scheduled.flywheel'?{aiTaskId:'owner',modelInput:{kind:'scheduled.flywheel',jobId:'original-job',jobRunId:'original-run',target:{},sourceKind:'benchmark',skillSnapshot:input.skillSnapshot},flywheelStages:{original:{input,identity}}}:{intelligenceGeneration:{input,identity}})};
 const task={id:'task',attempt:2,userId:'u',accountId:'a',groupId:null,kind:kind==='scheduled.flywheel'?'ai_task':kind,ownerType:kind==='topic_preview'?'transform':kind==='script_candidate'?'project':'ai_task',ownerId:'owner',payload} as Task;
 return {task,call};
}
it.each(['topic_preview','script_candidate','scheduled.flywheel'] as const)('原后台 %s 所有者的真实持久identity/binding保留只读恢复',kind=>{
 const f=owner(kind);expect(originalCodexReadBinding(f.task,f.call)).toMatchObject({threadId:'original-thread',turnId:'original-turn'});
 expect(originalCodexReadBinding({...f.task,ownerType:kind==='scheduled.flywheel'?'project':'ai_task'},f.call)).toBeNull();expect(originalCodexReadBinding(f.task,{...f.call,executionTaskId:'foreign'})).toBeNull();expect(originalCodexReadBinding({...f.task,groupId:'foreign'},f.call)).toBeNull();
 const payload=f.task.payload as any,frozen=kind==='scheduled.flywheel'?payload.flywheelStages.original:payload.intelligenceGeneration;const changed={...frozen,identity:{...frozen.identity,engine:'pi'}};expect(originalCodexReadBinding({...f.task,payload:{...payload,...(kind==='scheduled.flywheel'?{flywheelStages:{original:changed}}:{intelligenceGeneration:changed})}},f.call)).toBeNull();
});
