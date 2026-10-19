import {describe,it,expect,vi} from 'vitest';
import {createAnalysisSession} from './analysis-session';
const report:any={date:'2026-09-12',timeZone:'Asia/Shanghai',generatedAt:'2026-09-13T01:00:00Z',accountId:'a',accountName:'账号',positioning:null,works:[],recentWorks:[],warnings:[]};
function setup(){const api:any={listConversations:vi.fn(async()=>[]),createConversation:vi.fn(async()=>({id:'c'})),createMessage:vi.fn(async()=>({id:'m'})),listMessages:vi.fn(async()=>[]),getTask:vi.fn(),commandExecutionTasks:vi.fn(async()=>({}))};const send=vi.fn(async(_body:string)=>new Response('',{headers:{'x-execution-task-id':'e'}}));const s=createAnalysisSession(report,{api,send,assertScope:()=>{}});return {api,send,s};}
describe('日报持久分析',()=>{
 it('打开仅查询，不生成模型',async()=>{const {api,s,send}=setup();expect((await s.refresh()).status).toBe('idle');expect(api.createConversation).not.toHaveBeenCalled();expect(send).not.toHaveBeenCalled();});
 it('提交回执未知时沿原消息重放，不能重新建会话消息',async()=>{const {api,s,send}=setup();send.mockRejectedValueOnce(Error('offline'));await expect(s.start()).rejects.toThrow('offline');await s.start();expect(api.createConversation).toHaveBeenCalledTimes(1);expect(api.createMessage).toHaveBeenCalledTimes(1);expect(JSON.parse(send.mock.calls[1][0]).trigger).toBe('regenerate-message');expect(JSON.parse(send.mock.calls[1][0]).chatContext.surface).toBe('review');});
 it('再次打开恢复原任务，取消使用原执行ID',async()=>{const {api,s}=setup();api.listConversations.mockResolvedValue([{id:'c',scope:'surface:daily-report:2026-09-12'}]);api.listMessages.mockResolvedValue([{id:'m',role:'user',content:JSON.stringify({kind:'daily-report.request.v1',report}),modelMetadata:{chatTaskId:'t'}}]);api.getTask.mockResolvedValue({id:'t',status:'running',executionTaskId:'e'});expect((await s.refresh()).status).toBe('running');await s.cancel();expect(api.commandExecutionTasks.mock.calls[0][0].body.taskIds).toEqual(['e']);});
 it('新一轮未完成不能显示旧一轮结果为成功',async()=>{const {api,s}=setup();api.listConversations.mockResolvedValue([{id:'c'}]);api.listMessages.mockResolvedValue([{id:'old',role:'assistant',content:'旧报告',modelMetadata:{sourceMessageId:'m0'}},{id:'m',role:'user',content:JSON.stringify({kind:'daily-report.request.v1',report}),modelMetadata:{chatTaskId:'t'}}]);api.getTask.mockResolvedValue({id:'t',status:'running',executionTaskId:'e'});const r=await s.refresh();expect(r.status).toBe('running');expect(r.rawAnalysis).toBeNull();});
 it('模型非JSON结果保留可读正文且不误挂来源',async()=>{const {api,s}=setup();api.listConversations.mockResolvedValue([{id:'c'}]);api.listMessages.mockResolvedValue([{id:'m',role:'user',content:JSON.stringify({kind:'daily-report.request.v1',report}),modelMetadata:{chatTaskId:'t'}},{id:'reply',role:'assistant',content:'有证据的运营分析',modelMetadata:{sourceMessageId:'m',chatTaskId:'t'}}]);api.getTask.mockResolvedValue({id:'t',status:'succeeded',executionTaskId:'e'});const r=await s.refresh();expect(r.rawAnalysis).toBe('有证据的运营分析');expect(r.status).toBe('succeeded');});
});

describe('恢复边界',()=>{
 it('部分完成保留原回复，再次分析只读原任务而不重发',async()=>{
  const {api,s,send}=setup();
  api.listConversations.mockResolvedValue([{id:'c'}]);
  api.listMessages.mockResolvedValue([{id:'m',role:'user',content:JSON.stringify({kind:'daily-report.request.v1',report}),modelMetadata:{chatTaskId:'original-partial'}},{id:'reply',role:'assistant',content:'已收到的部分分析正文',modelMetadata:{sourceMessageId:'m',chatTaskId:'original-partial'}}]);
  api.getTask.mockResolvedValue({id:'original-partial',status:'partial',runtimeStatus:'partial',executionTaskId:'original-execution'});
  const result=await s.refresh();
  expect(result.status).toBe('failed');expect(result.error).toContain('部分完成');expect(result.rawAnalysis).toBe('已收到的部分分析正文');
  await s.start();
  expect(api.getTask).toHaveBeenCalledTimes(2);
  expect(api.getTask.mock.calls.every(([input]:any[])=>input.params.taskId==='original-partial')).toBe(true);
  expect(send).not.toHaveBeenCalled();expect(api.createMessage).not.toHaveBeenCalled();expect(api.createConversation).not.toHaveBeenCalled();expect(api.commandExecutionTasks).not.toHaveBeenCalled();
 });
 it('未知结果只能读取原任务，禁止重新生成',async()=>{const {api,s,send}=setup();api.listConversations.mockResolvedValue([{id:'c'}]);api.listMessages.mockResolvedValue([{id:'m',role:'user',content:JSON.stringify({kind:'daily-report.request.v1',report}),modelMetadata:{chatTaskId:'t'}}]);api.getTask.mockResolvedValue({id:'t',status:'unknown_result',runtimeStatus:'unknown_result',executionTaskId:'e'});await s.refresh();await s.start();expect(send).not.toHaveBeenCalled();expect(api.createMessage).not.toHaveBeenCalled();});
});
