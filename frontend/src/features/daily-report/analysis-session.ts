import type {DailyReportAnalysis} from '@creatoros/contract';
import type {client} from '@/lib/contract-client';
import {reportPeriodLabel} from "./report-period";
import type {DailyReport} from './report-metrics';
import {createReportRequest,declaresReportProtocol,readReportRequest,parseReportAnalysis,reportEvidenceKey,reportScope,hasReportScope,type ReportRequest} from './analysis-protocol';
type AIConversationResource=Awaited<ReturnType<typeof client.listConversations>>;
type AIMessageResource=Awaited<ReturnType<typeof client.listMessages>>;
type Api=Pick<typeof client,'listConversations'|'createConversation'|'createMessage'|'listMessages'|'getTask'|'commandExecutionTasks'>;
export type AnalysisState={status:'loading'|'idle'|'running'|'succeeded'|'failed';analysis:DailyReportAnalysis|null;rawAnalysis:string|null;error:string|null;sourceGeneratedAt:string|null;stale:boolean};
export const emptyAnalysis:AnalysisState={status:'idle',analysis:null,rawAnalysis:null,error:null,sourceGeneratedAt:null,stale:false};
/** 只编排既有持久会话/任务。轮询与 HTTP 连接都不拥有模型执行权。 */
export function createAnalysisSession(report:DailyReport,deps:{api:Api;send:(body:string)=>Promise<Response>;assertScope:()=>void}){
 let conversationId:string|null=null,sourceId:string|null=null,source:ReportRequest|null=null,executionId:string|null=null;
 let retryTerminal=false;
 let reading:Promise<AnalysisState>|null=null;
 let state:AnalysisState={...emptyAnalysis},busy:Promise<AnalysisState>|null=null;
 const call=async<T>(fn:()=>Promise<T>)=>{deps.assertScope();const value=await fn();deps.assertScope();return value;};
 const api=deps.api;
 async function refresh():Promise<AnalysisState>{
  if(!hasReportScope(report))return {...emptyAnalysis};
  if(!conversationId){const rows=await call(()=>api.listConversations({params:undefined,query:{scope:reportScope(report),page:1,pageSize:1},body:undefined})) as unknown as AIConversationResource[];conversationId=rows[0]?.id??null;}
  if(!conversationId)return state={...emptyAnalysis};
  const messages=await call(()=>api.listMessages({params:{conversationId:conversationId!},query:undefined,body:undefined})) as unknown as AIMessageResource[];
  const message=[...messages].reverse().find(m=>m.role==='user');
  if(!message)return state={...emptyAnalysis};
  const request=readReportRequest(message.content);
  if(!request||request.report.accountId!==report.accountId||reportScope(request.report)!==reportScope(report))throw Error('日报分析来源不匹配，请重新查看');
  sourceId=message.id;source=request;
  const base={...emptyAnalysis,sourceGeneratedAt:request.report.generatedAt,stale:reportEvidenceKey(request.report,request.totalWorks,request.totalRecentWorks)!==reportEvidenceKey(report)};
  const taskId=message.modelMetadata.chatTaskId;
  if(typeof taskId!=='string')return state={...base,status:'failed',error:'分析尚未启动，可重试原请求。'};
  const task=await call(()=>api.getTask({params:{taskId},query:undefined,body:undefined}));executionId=task.executionTaskId??null;retryTerminal=['failed','cancelled'].includes(task.status);
  const reply=messages.find(m=>m.role==='assistant'&&m.modelMetadata.sourceMessageId===message.id&&m.modelMetadata.chatTaskId===taskId);
  if((task.runtimeStatus??task.status)==='partial')return state={...base,status:'failed',rawAnalysis:reply?.content??null,error:'本次分析部分完成，已保留收到的正文；请查看原任务结果。'};
  if(task.status==='succeeded'&&reply){const analysis=parseReportAnalysis(reply.content,request.report);if(!analysis&&declaresReportProtocol(reply.content)){retryTerminal=true;return state={...base,status:'failed',error:'分析结果的格式或来源与本次请求不一致，请重新分析。'};}return state={...base,status:'succeeded',analysis,rawAnalysis:analysis?null:reply.content};}
  if(task.status==='succeeded'&&!reply)return state={...base,status:'failed',error:'原任务已结束，结果暂未读取到，请刷新状态。'};
  if(['failed','cancelled','unknown_result','blocked','paused','waiting_user'].includes(task.runtimeStatus??task.status))return state={...base,status:'failed',rawAnalysis:reply?.content??null,error:task.status==='cancelled'?'分析已停止。':task.errorMessage||'分析需要处理，可刷新原任务状态。'};
  return state={...base,status:'running'};
 }
 async function performStart(){
  if(!hasReportScope(report))return state={...emptyAnalysis};
  // 已有明确在途任务只恢复显示，不额外提交。
  if(state.status==='running'||(executionId&&state.status==='failed'&&!retryTerminal))return refresh();
  if(!conversationId){const c=await call(()=>api.createConversation({params:undefined,query:undefined,body:{title:`运营报表 ${reportPeriodLabel(report)}`,scope:reportScope(report),projectId:null}}));conversationId=c.id;}
  if(!sourceId||state.status==='succeeded'||(executionId&&state.status==='failed'&&retryTerminal)){
   source=createReportRequest(report);const m=await call(()=>api.createMessage({params:{conversationId:conversationId!},query:undefined,body:{content:JSON.stringify(source)}}));sourceId=m.id;executionId=null;
  }
  if(!source)throw Error('日报来源未读取，请刷新后重试');
  const response=await call(()=>deps.send(JSON.stringify({conversationId,trigger:'regenerate-message',messages:[{id:sourceId,role:'user',parts:[{type:'text',text:JSON.stringify(source)}]}],chatContext:{surface:'review',scope:reportScope(report)}})));
  if(!response.ok){const body=await response.json().catch(()=>({}));throw Error(typeof body.error==='string'?body.error:'分析提交未完成，请刷新原任务状态。');}
  executionId=response.headers.get('x-execution-task-id');
  // 后端已持久化，释放事件订阅；UI读取原任务，不依赖页面长期保持SSE连接。
  await response.body?.cancel();
  return state={...emptyAnalysis,status:'running',sourceGeneratedAt:source.report.generatedAt};
 }
 return {refresh(){if(busy)return busy;if(reading)return reading;reading=refresh().finally(()=>{reading=null;});return reading;},start(){if(busy)return busy;busy=(async()=>{if(reading)await reading;return performStart();})().finally(()=>{busy=null;});return busy;},async cancel(){
  if(busy)await busy;if(reading)await reading;
  if(!executionId)await refresh();if(!executionId)throw Error('尚未取得原任务，请刷新状态后再停止。');
  await call(()=>api.commandExecutionTasks({params:undefined,query:undefined,body:{taskIds:[executionId!],command:'cancel',idempotencyKey:`report-stop:${executionId}`}}));return refresh();
 }};
}
