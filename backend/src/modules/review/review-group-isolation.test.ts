import {afterAll,beforeAll,expect,it} from 'vitest';
import {createDb,aiTasks,executionTasks,eq} from '@creatoros/backend';
import {accountGroups} from '../../schema/account-groups';
import {reviewRules} from './review-gate.db-schema';
import {createClient,ENDPOINTS,type RequestContext} from '@creatoros/contract';
import {createReviewGateService} from './review-gate.service';
import {createReviewGateTransport} from './review-gate.transport';
import {createStructuredBusinessExecutionService} from '../ai-runtime/structured-business-execution.service';
import {prepareScriptReviewContext} from '../ai-runtime/script-review-context';
import {structuredGenerationInputSchema} from '@creatoros/contract/execution-worker';
import type {LintFinding} from '@creatoros/ai-worker';
const stamp='2026-10-25T00:00:00.000Z';
const a:RequestContext={userId:'review-group-user',groupId:'review-group-a',requestId:'r-a',source:'user'};
const b:RequestContext={...a,groupId:'review-group-b',requestId:'r-b'};
let opened:Awaited<ReturnType<typeof createDb>>;let service:ReturnType<typeof createReviewGateService>;
beforeAll(async()=>{
 opened=await createDb();let seq=0;
 await opened.db.insert(accountGroups).values([a,b].map(ctx=>({id:ctx.groupId!,userId:ctx.userId,name:ctx.groupId!,status:'active',version:1,createdAt:stamp,updatedAt:stamp})));
 await opened.db.insert(reviewRules).values({id:'legacy-rule',userId:a.userId,tier:'empirical',category:'legacy',matchType:'word',pattern:'legacy-word',source:'manual',status:'active',note:'retained',createdAt:stamp,updatedAt:stamp});
 service=createReviewGateService({db:opened.db,now:()=>stamp,nextId:p=>p+'-'+ ++seq,ai:{createTask:async()=>{throw Error('no model');}},script:{getCurrentScriptRef:async()=>{throw Error('no script');}}});
});
afterAll(async()=>opened?.client.close());
it('同用户不同组：公开client列表与实际active词表都不泄露新私有规则',async()=>{
 const transport=createReviewGateTransport(()=>service),ca=createClient(ENDPOINTS,transport,a),cb=createClient(ENDPOINTS,transport,b);
 const created=await ca.createReviewRule({params:undefined,query:undefined,body:{tier:'empirical',category:'private',matchType:'word',pattern:'private-a',note:'',source:'manual',status:'active'}});
 expect(created).toMatchObject({scope:'group',groupId:a.groupId});
 expect((await cb.listReviewRules({params:undefined,query:undefined,body:undefined}) as unknown as Array<{id:string}>).map(x=>x.id)).not.toContain(created.id);
 expect((await service.listActiveLintRules(b)).map(x=>x.id)).not.toContain(created.id);
 await expect(service.patchRule(b,created.id,{status:'disabled'})).rejects.toThrow();
 await expect(service.deleteRule(b,created.id)).rejects.toThrow();
 expect((await service.listRules(a)).find(x=>x.id===created.id)?.status).toBe('active');
});
it('历史共享仍有效且显式标识，改删必须确认共享影响',async()=>{
 expect((await service.listRules(b)).find(x=>x.id==='legacy-rule')).toMatchObject({scope:'shared_legacy',groupId:null});
 expect((await service.listActiveLintRules(b)).map(x=>x.id)).toContain('legacy-rule');
 await expect(service.patchRule(a,'legacy-rule',{note:'unconfirmed'})).rejects.toThrow();
 expect((await service.listRules(a)).find(x=>x.id==='legacy-rule')?.note).toBe('retained');
 await expect(service.deleteRule(a,'legacy-rule')).rejects.toThrow();
});
it('没有当前组不能创建新用户共享自定义规则',async()=>{
 await expect(service.createRule({...a,groupId:null},{tier:'empirical',category:'no-group',matchType:'word',pattern:'no-group'})).rejects.toThrow();
});
it('历史共享确认后才可改删，保留NULL归属及原创建时间；其他用户仍不可确认越权',async()=>{
 const client=createClient(ENDPOINTS,createReviewGateTransport(()=>service),a);
 await expect(client.patchReviewRule({params:{ruleId:'legacy-rule'},query:undefined,body:{note:'仍未确认',confirmSharedImpact:false}})).rejects.toThrow('共享');
 const patched=await client.patchReviewRule({params:{ruleId:'legacy-rule'},query:undefined,body:{note:'人已确认全组共享影响',confirmSharedImpact:true}});
 expect(patched).toMatchObject({groupId:null,scope:'shared_legacy',createdAt:stamp});
 expect((await service.listRules(b)).find(rule=>rule.id==='legacy-rule')?.note).toBe('人已确认全组共享影响');
 await expect(service.patchRule({...a,userId:'foreign-user'},'legacy-rule',{note:'越权',confirmSharedImpact:true})).rejects.toThrow();
 await opened.db.insert(reviewRules).values({id:'legacy-delete-confirmed',userId:a.userId,tier:'empirical',category:'legacy',matchType:'word',pattern:'legacy-delete',source:'manual',status:'active',note:'preserved-until-confirm',createdAt:stamp,updatedAt:stamp});
 await expect(client.deleteReviewRule({params:{ruleId:'legacy-delete-confirmed'},query:undefined,body:undefined})).rejects.toThrow('共享');
 expect(await client.deleteReviewRule({params:{ruleId:'legacy-delete-confirmed'},query:undefined,body:{confirmSharedImpact:true}})).toEqual({id:'legacy-delete-confirmed',deleted:true});
});
it('retro候选只归当前组、不能强制激活；新组私有记录正常组内改删',async()=>{
 const retro=await service.createRule(a,{tier:'empirical',category:'复盘',matchType:'word',pattern:'retro-private',source:'retro',status:'active'});
 expect(retro).toMatchObject({scope:'group',groupId:a.groupId,status:'candidate'});expect((await service.listRules(b)).some(rule=>rule.id===retro.id)).toBe(false);
 expect((await service.patchRule(a,retro.id,{status:'active'})).status).toBe('active');await service.deleteRule(a,retro.id);expect((await service.listRules(a)).some(rule=>rule.id===retro.id)).toBe(false);
});
it('实际审核准备冻结任务组词表：同用户其他组私有规则不进入L1或prompt，换组不能准备旧任务',async()=>{
 const own=await service.createRule(a,{tier:'empirical',category:'仅A组',matchType:'word',pattern:'private-freeze-a'}),other=await service.createRule(b,{tier:'empirical',category:'仅B组',matchType:'word',pattern:'private-freeze-b'});
 const snapshot={snapshotVersion:1,userId:a.userId,accountId:null,groupId:a.groupId!,resolvedAt:stamp,platformPolicyVersion:'1',platformPolicy:'按冻结范围',skills:[{skillId:'script.review',baseVersion:'controlled-1',overlayRevision:null,overlayVersion:null,effective:{methodSystem:'隔离验收',template:'{{script}}',tools:[],requiredFacets:['script'],contextRequirements:[],outputSchema:{type:'object'},completionPolicy:null,completionPolicyAdapter:null}}]};
 await opened.db.insert(aiTasks).values({id:'review-frozen-group-task',userId:a.userId,accountId:null,groupId:a.groupId,groupVersion:1,taskType:'script.review',projectId:'isolated-review-project',idempotencyKey:'review-frozen-group-task',requestFingerprint:'sha256:'+'a'.repeat(64),requestedAt:stamp,inputData:{artifactId:'isolated-review-script',artifactVersion:1},runtimeData:{skillSnapshot:snapshot}});
 const worker=createStructuredBusinessExecutionService(opened.db,{budget:{maxCalls:6,maxTokens:10000,deadlineMs:60000},maxOutputTokens:1000,adapters:{'script.review':{skillId:'script.review',capability:'default',prepare:(ctx,task)=>prepareScriptReviewContext(ctx,task,{scriptSource:{getLatestScript:async()=>({artifactId:'isolated-review-script',version:1,text:'private-freeze-a private-freeze-b legacy-word'})},lintRules:service}),project(){throw Error('no model/candidate');}}}});
 await expect(worker.prepare(b,'review-frozen-group-task')).rejects.toThrow();const mapped=await worker.prepare(a,'review-frozen-group-task');
 const [execution]=await opened.db.select().from(executionTasks).where(eq(executionTasks.id,mapped.executionTaskId));const frozen=structuredGenerationInputSchema.parse((execution!.payload as Record<string,unknown>).modelInput).facets;
 expect(frozen.lexicon).toContain(own.pattern);expect(frozen.lexicon).not.toContain(other.pattern);expect(frozen.lexicon).toContain('legacy-word');
 const lint=(JSON.parse(frozen.__reviewSnapshot!) as {lintFindings:LintFinding[]}).lintFindings;expect(lint.some(finding=>finding.ruleId===own.id)).toBe(true);expect(lint.some(finding=>finding.ruleId===other.id)).toBe(false);
});
