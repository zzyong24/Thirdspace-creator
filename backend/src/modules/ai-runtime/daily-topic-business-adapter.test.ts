import {it,expect,vi} from 'vitest';
import {createDailyTopicBusinessAdapter} from './daily-topic-business-adapter';
const ctx={userId:'u',accountId:'a',requestId:'r',source:'user' as const},now=()=> '2026-09-05T00:00:00.000Z';
const skillSnapshot={snapshotVersion:1 as const,userId:'u',accountId:'a',resolvedAt:now(),platformPolicyVersion:'1',platformPolicy:'候选',skills:[{skillId:'topic.generate',baseVersion:'1',overlayRevision:null,overlayVersion:null,effective:{methodSystem:'',template:'',tools:[],requiredFacets:[],contextRequirements:[],outputSchema:{type:'object'},completionPolicy:null,completionPolicyAdapter:null}}]};
const task={id:'daily-task',projectId:null,inputData:{jobRunId:'forged'},retryOfTaskId:null,skillSnapshot};
function fixture(count=0,configured=true){
 const context=vi.fn(async()=>({profile:null,currentStatement:{oneLiner:'真实定位',keywords:[]}}));
 const deps={resolveRun:vi.fn(async()=>({jobId:'j',jobRunId:'real-run',dayKey:'2026-09-04'})),countCandidatesForDay:vi.fn(async()=>count),hasConfiguredModel:vi.fn(async()=>configured),listActivePreferences:vi.fn(async()=>[{keyword:'工具',direction:'prefer' as const,weight:3,exampleCount:4,lastReinforcedAt:now()}]),dailyLimit:5,now,positioning:{getPositioningCenter:context},signals:{list:async()=>[{source:'comment',rawText:'怎么使用这个工具？',demandTag:null},{source:'comment',rawText:'666',demandTag:null}]},knowledge:{list:async()=>[{title:'真实知识',knowledgeType:'evidence'}]},learnings:{getSuggestions:async()=>[{title:'经验标题',insight:'真实经验'}]},sourceReader:{listEnabledSources:vi.fn(async()=>[{id:'s',name:'来源',url:'https://example.com',domain:'example.com',sourceType:'web' as const}])}};
 return {deps,context,adapter:createDailyTopicBusinessAdapter(deps)};
}
it('每日准备冻结真实多依据与来源，只用运行反查，不信临时jobRunId',async()=>{
 const f=fixture(),facets=await f.adapter.prepare(ctx,task),topic=JSON.parse(facets.__topicGenerate!),daily=JSON.parse(facets.__dailyTopic!);
 expect(topic).toMatchObject({mode:'daily',basis:'positioning',projectId:null,context:{positioningBrief:expect.stringContaining('真实定位'),knowledgeBrief:expect.stringContaining('真实知识'),learningsBrief:expect.stringContaining('真实经验')}});
 expect(topic.basisBrief).toContain('怎么使用');expect(topic.basisBrief).not.toContain('[comment] 666');expect(topic.trendSources).toHaveLength(1);expect(daily).toMatchObject({jobRunId:'real-run',dayKey:'2026-09-05',dailyLimit:5,rankingNow:now()});expect(f.adapter.additionalCalls?.(facets)).toBe(3);expect(daily.preferences).toHaveLength(1);expect(f.deps.countCandidatesForDay).toHaveBeenCalledWith(ctx,'2026-09-05');
});
it.each(['quota','model_unconfigured'] as const)('%s真实skip零上下文且不伪造topic快照',async(reason)=>{
 const f=fixture(reason==='quota'?5:0,reason!=='model_unconfigured'),facets=await f.adapter.prepare(ctx,task),daily=JSON.parse(facets.__dailyTopic!);
 expect(f.adapter.additionalCalls?.(facets)).toBe(0);expect(daily.skipReason).toBe(reason);expect(facets.__topicGenerate).toBeUndefined();expect(f.context).not.toHaveBeenCalled();expect(f.deps.sourceReader.listEnabledSources).not.toHaveBeenCalled();expect(f.deps.listActivePreferences).not.toHaveBeenCalled();if(reason==='quota'){expect(daily.observedCount).toBe(5);expect(f.deps.hasConfiguredModel).not.toHaveBeenCalled();}
});
it('归属失败发生于配额与模型配置读取前，偏好读取失败保持旧零调整兼容',async()=>{
 const f=fixture();f.deps.resolveRun.mockRejectedValueOnce(Error('归属拒绝'));await expect(f.adapter.prepare(ctx,task)).rejects.toThrow('归属拒绝');expect(f.deps.countCandidatesForDay).not.toHaveBeenCalled();
 f.deps.listActivePreferences.mockRejectedValueOnce(Error('offline'));expect(JSON.parse((await f.adapter.prepare(ctx,task)).__dailyTopic!).preferences).toEqual([]);
});
it('投影必须使用daily冻结身份，与真实旧节点一致拒绝空产出，不改变候选类型',async()=>{
 const f=fixture(),facets=await f.adapter.prepare(ctx,task),frozenInput={kind:'model.structured',operationKey:'topic.generate',skillId:'topic.generate',capability:'topic.generate',maxOutputTokens:100,skillSnapshot,facets};
 expect(f.adapter.project({}, {topics:[{title:' 真实题目 ',angle:'角度',source:'demand',predictedScore:80,reason:'依据',contentRole:'trust'}]},{frozenInput})).toMatchObject({resultType:'candidate_list',resultData:{items:[{title:'真实题目',source:'demand'}]}});
 expect(()=>f.adapter.project({}, {topics:[]},{frozenInput})).toThrow();
 expect(()=>f.adapter.project({}, {topics:[{title:'正常'}]},{frozenInput:{...frozenInput,facets:{}}})).toThrow();
});
