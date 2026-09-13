import {describe,it,expect,vi} from 'vitest';
import {resolveSkillForSurface} from '../../../../backend/src/modules/ai-runtime/chat-surface';
import {createAnalysisSession} from './analysis-session';
import {createReportRequest,parseReportAnalysis,reportEvidenceKey,reportScope} from './analysis-protocol';
const report:any={date:'2026-09-01',startDate:'2026-09-01',endDate:'2026-09-13',timeZone:'Asia/Shanghai',generatedAt:'2026-09-14T00:00:00Z',accountId:'a',positioning:null,works:[],recentWorks:[],warnings:[]};
const result={format:'creatoros.daily-report.v1',date:report.date,startDate:report.startDate,endDate:report.endDate,accountId:report.accountId,sourceGeneratedAt:report.generatedAt,headline:'建议',summary:'摘要',positioning:{observation:'观察',suggestion:'建议'},works:[],experiments:[]};
function setup(output=result){
 const api:any={listConversations:vi.fn(async()=>[{id:'c'}]),createConversation:vi.fn(async()=>({id:'new-c'})),createMessage:vi.fn(async()=>({id:'new-m'})),listMessages:vi.fn(async()=>[{id:'m',role:'user',content:JSON.stringify(createReportRequest(report)),modelMetadata:{chatTaskId:'t'}},{id:'reply',role:'assistant',content:JSON.stringify(output),modelMetadata:{sourceMessageId:'m',chatTaskId:'t'}}]),getTask:vi.fn(async()=>({status:'succeeded',executionTaskId:'e'})),commandExecutionTasks:vi.fn()};
 const send=vi.fn(async()=>new Response('',{headers:{'x-execution-task-id':'new-e'}}));
 return {api,send,session:createAnalysisSession(report,{api,send,assertScope:()=>{}})};
}
describe('日报日期范围与原任务绑定',()=>{
 it('相同开始日的不同结束日不共享scope或证据key，旧单天scope兼容',()=>{
  const other={...report,endDate:'2026-09-12'};
  expect(reportScope(report)).not.toBe(reportScope(other));expect(reportEvidenceKey(report)).not.toBe(reportEvidenceKey(other));
  expect(reportScope({...report,startDate:undefined,endDate:undefined})).toBe('surface:daily-report:2026-09-01');
  expect(parseReportAnalysis(JSON.stringify({...result,endDate:other.endDate}),report)).toBeNull();
  expect(parseReportAnalysis(JSON.stringify({...result,startDate:undefined,endDate:undefined}),report)).toBeNull();
 });
 it('会话返回其他范围的源消息时停止读取任务',async()=>{
  const {api,session}=setup();api.listMessages.mockResolvedValue([{id:'m',role:'user',content:JSON.stringify(createReportRequest({...report,endDate:'2026-09-12'})),modelMetadata:{chatTaskId:'t'}}]);
  await expect(session.refresh()).rejects.toThrow('来源不匹配');expect(api.getTask).not.toHaveBeenCalled();
 });
 it('协议声明范围错绑不会降级为可导出的成功正文，明确完成的无效结果允许重新分析',async()=>{
  const {api,send,session}=setup({...result,endDate:'2026-09-12'});
  const state=await session.refresh();expect(state.status).toBe('failed');expect(state.rawAnalysis).toBeNull();expect(state.analysis).toBeNull();
  await session.start();expect(api.createMessage).toHaveBeenCalledTimes(1);expect(send).toHaveBeenCalledTimes(1);
 });
 it('真实提交参数采用review上下文并携带完整日期范围，而不是仅开始日',async()=>{
  const {api,send,session}=setup();api.listConversations.mockResolvedValue([]);
  await session.refresh();await session.start();
  expect(api.createConversation.mock.calls[0][0].body.scope).toBe('surface:daily-report:2026-09-01:2026-09-13');
  const payload=JSON.parse((send.mock.calls as unknown as string[][])[0][0]);
  expect(payload.chatContext).toEqual({surface:'review',scope:'surface:daily-report:2026-09-01:2026-09-13'});
  expect(resolveSkillForSurface(payload.chatContext.surface)).toBe('chatbox.review');
  expect(JSON.parse(payload.messages[0].parts[0].text).report).toMatchObject({startDate:'2026-09-01',endDate:'2026-09-13'});
 });
});

it('重新分析写消息期间的旧轮询不会把新消息绑定到旧快照',async()=>{
 const {api,send,session}=setup();const old={...report,generatedAt:'2026-09-13T00:00:00Z'};
 api.listMessages.mockResolvedValue([{id:'m',role:'user',content:JSON.stringify(createReportRequest(old)),modelMetadata:{chatTaskId:'t'}},{id:'reply',role:'assistant',content:'旧分析',modelMetadata:{sourceMessageId:'m',chatTaskId:'t'}}]);
 await session.refresh();let release!:(value:{id:string})=>void;
 api.createMessage.mockImplementation(()=>new Promise(resolve=>{release=resolve;}));
 const starting=session.start();const polling=session.refresh();
 // 允许当前在途旧读取推进，但不等待可能已被序列化到提交之后的 refresh。
 await new Promise(resolve=>setTimeout(resolve,0));release({id:'new-m'});
 await starting;await polling;
 const payload=JSON.parse((send.mock.calls as unknown as string[][])[0][0]);
 expect(payload.messages[0].id).toBe('new-m');
 expect(JSON.parse(payload.messages[0].parts[0].text).report.generatedAt).toBe(report.generatedAt);
});
