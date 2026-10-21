import {expect,it} from 'vitest';
import {createHash} from 'node:crypto';
import {codexExecutionSpec,createExecutionRoute,intelligenceRewriteInputSchema,workerTaskInputSchema,structuredGenerationInputSchema} from '@creatoros/contract/execution-worker';
import {originalCodexReadBinding} from './codex-read-recovery';
type Task=Parameters<typeof originalCodexReadBinding>[0];type Call=Parameters<typeof originalCodexReadBinding>[1];
it('T1382 project-owner原Codex回合只读恢复核冻结来源/项目/工作区',()=>{
 const f=owner('topic_preview'),payload=f.task.payload as any,hash=`sha256:${createHash('sha256').update('真实来源正文').digest('hex')}`;
 const source={kind:'project_artifact',projectId:'project',artifactId:'source-artifact',artifactVersion:2,contentHash:hash,title:'来源',authorName:null,url:null};
 const target={ownerType:'project',projectId:'project',source,generationMode:'strategy_backed',transcript:{text:'真实来源正文',hash}};
 const input={...payload.intelligenceGeneration.input,facets:{mode:'topic_preview',target:JSON.stringify(target)}};
 const task={...f.task,ownerType:'project',ownerId:'project',payload:{...payload,projectId:'project',source,intelligenceGeneration:{...payload.intelligenceGeneration,input,sourceDigest:createHash('sha256').update(JSON.stringify(target)).digest('hex')}}} as Task;
 expect(originalCodexReadBinding(task,f.call)).toMatchObject({threadId:'original-thread',turnId:'original-turn'});
 for(const changed of [{...task,ownerId:'foreign'},{...task,groupId:'foreign'},{...task,groupVersion:9},{...task,membershipVersion:9},{...task,payload:{...task.payload as object,projectId:'foreign'}},{...task,payload:{...task.payload as object,source:{...source,artifactVersion:3}}}])expect(originalCodexReadBinding(changed,f.call)).toBeNull();
 expect(originalCodexReadBinding(task,{...f.call,executionTaskId:'other-task'})).toBeNull();
});
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

it.each([null,{type:'object'}])('原 intelligenceText 正文冻结契约 %j 可只读恢复，错误owner拒绝',outputSchema=>{
 const f=owner('topic_preview'),payload=f.task.payload as any,original=payload.intelligenceGeneration.input,skillId='intelligence.topic-adapted-draft';
 const input=intelligenceRewriteInputSchema.parse({...original,intelligenceText:'rewrite_only',skillId,facets:{mode:'topic_preview',target:JSON.stringify({generationMode:'rewrite_only'})},skillSnapshot:{...original.skillSnapshot,skills:[{...original.skillSnapshot.skills[0],skillId,effective:{...original.skillSnapshot.skills[0].effective,outputSchema}}]}});
 expect(workerTaskInputSchema.parse(input)).toEqual(input);expect(structuredGenerationInputSchema.safeParse(input).success).toBe(false);
 const task={...f.task,payload:{...payload,intelligenceGeneration:{...payload.intelligenceGeneration,input}}};
 expect(originalCodexReadBinding(task,f.call)).toMatchObject({threadId:'original-thread',turnId:'original-turn'});
 expect(originalCodexReadBinding({...task,ownerType:'project'},f.call)).toBeNull();expect(originalCodexReadBinding({...task,kind:'script_candidate',ownerType:'project'},f.call)).toBeNull();
});
