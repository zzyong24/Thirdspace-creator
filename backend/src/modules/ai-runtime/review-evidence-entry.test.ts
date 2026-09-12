import {expect,it,vi} from 'vitest';
import {prepareReviewContext} from './review-context';
import {createChatBusinessGenerationPreparation} from './chat-business-generation-preparation';
import {createChatStructuredTaskToolHost} from './chat-structured-tool-host';
import {buildChatTools,type ChatToolDeps} from './chat-tools';
import {prepareChatToolDefinitions} from './chat-tool-definitions';
const ctx={userId:'user',accountId:'account',source:'user' as const,requestId:'r'};
async function fixture(script:string,metrics:string,comments:string[]){
 const deps={reviewSubject:{getTitle:async()=> '当前作品',getScript:vi.fn(async()=>script),getMetricsSummary:vi.fn(async()=>metrics),getComments:async()=>comments},positioning:{getPositioningCenter:async()=>({profile:null,currentStatement:null})},assertProject:vi.fn(async()=>{}),readTrend:async()=>({brief:'',sourceCount:0,signalCount:0,note:null})};
 const business=createChatBusinessGenerationPreparation(deps as never);
 const definitions=(await prepareChatToolDefinitions(buildChatTools(['review.analyze'],{} as ChatToolDeps),{workerStructuredNodes:true})).definitions;
 const restored={context:ctx,modelInput:{tools:definitions},hostContext:{chatContext:{projectId:'project'},structuredContext:{positioningBrief:'',accountsBrief:'',learningsBrief:'',signalsBrief:'',knowledgeBrief:''},structuredGeneration:{version:1,maxOutputTokens:2048},skillSnapshot:{skills:[{skillId:'review.insights'}]}}};
 const resolve=createChatStructuredTaskToolHost({read:async()=>structuredClone(restored)} as never,{business,readWorks:async()=>'',getPositioningDiscovery:async()=>null});
 const scope={execution:{executionTaskId:'task',attempt:1,fenceToken:'fence'},callId:'parent',attemptId:'attempt',signal:new AbortController().signal};
 const tools=await resolve(ctx,{} as never,scope.execution,scope.signal);
 return {deps,scope,tool:tools['review.analyze']!};
}
it.each([
 {name:'指标独有',script:'',metrics:'播放：11568 · 完播率：14.01 · 2s跳出率：28.38',comments:[]},
 {name:'真实零指标',script:'',metrics:'播放：0 · 点赞：0',comments:[]},
 {name:'评论独有',script:'',metrics:'',comments:['希望给出操作演示']},
 {name:'稿件独有',script:'先展示真实操作，再解释步骤。',metrics:'',comments:[]},
])('$name经真实chat structured准备入口与持久入口一致，缺失证据不伪造',async({script,metrics,comments})=>{
 const f=await fixture(script,metrics,comments);
 const persistent=await prepareReviewContext(ctx,{projectId:'project',inputData:{}},f.deps as never);
 const prepared=await f.tool.prepareGeneration!(ctx,{},f.scope);
 expect(prepared.node.capability).toBe('review.analyze');expect(prepared.node.facets).toEqual({...persistent,__reviewProjectId:'project'});
 expect(f.deps.assertProject).toHaveBeenCalledWith(ctx,'project');
 if(!script)expect(prepared.node.facets.reviewScriptBlock).toContain('未取得真实稿件');
 if(!metrics)expect(prepared.node.facets.reviewMetricsBlock).toContain('未取得发布指标');
 if(!metrics)expect(prepared.node.facets.reviewMetricsBlock).not.toContain('播放：0');
 else expect(prepared.node.facets.reviewMetricsBlock).toContain(metrics);
});
it('真实稿件指标评论全空仍拒绝，标题不替代证据；越权不读取内容',async()=>{
 const f=await fixture('','',[]);
 await expect(f.tool.prepareGeneration!(ctx,{},f.scope)).rejects.toThrow('missing current-project');
 await expect(prepareReviewContext(ctx,{projectId:'project',inputData:{topic:'标题'}},f.deps as never)).rejects.toThrow('missing current-project');
 f.deps.reviewSubject.getScript.mockClear();f.deps.assertProject.mockRejectedValueOnce(new Error('not owned'));
 await expect(f.tool.prepareGeneration!(ctx,{projectId:'foreign'},f.scope)).rejects.toThrow('not owned');expect(f.deps.reviewSubject.getScript).not.toHaveBeenCalled();
});
