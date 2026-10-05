import {it,expect,vi} from 'vitest';
import {runCodexNativeTurn,recoverCodexNativeTurn} from './codex-native-turn';
function fixture(){
 const rpc:any={onNotification:undefined,onRequest:undefined,onFailure:undefined,onAbort:undefined,close:vi.fn(),request:vi.fn(async(method:string)=>{
  if(method==='thread/start')return {thread:{id:'thread-actual'}};
  if(method==='mcpServerStatus/list')return {data:[]};
  if(method==='turn/start')return {turn:{id:'turn-actual'}};
  if(method==='turn/interrupt')return {};
  throw Error(method);
 })};
 const callbacks={onThread:vi.fn(),onAdmission:vi.fn(),onTurn:vi.fn(),onTool:vi.fn(async()=>({text:'真实工具结果',success:true})),onText:vi.fn()};
 return {rpc,callbacks};
}
it('线程预备和回合入场都先持久，再接受实际ID与动态工具；真实终态才完成',async()=>{
 const f=fixture(),controller=new AbortController();
 const running=runCodexNativeTurn({rpc:f.rpc,mcpNames:[],cwd:'/tmp/owned-task',prompt:'目标',signal:controller.signal,tools:[{name:'read_project',description:'读取',inputSchema:{type:'object'}}],...f.callbacks});
 await vi.waitFor(()=>expect(f.callbacks.onTurn).toHaveBeenCalledWith('turn-actual'));
 expect(f.callbacks.onThread).toHaveBeenCalledWith('thread-actual');expect(f.callbacks.onAdmission).toHaveBeenCalledWith('thread-actual');
 expect(f.callbacks.onAdmission.mock.invocationCallOrder[0]).toBeLessThan(f.callbacks.onTurn.mock.invocationCallOrder[0]!);
 expect(await f.rpc.onRequest('item/tool/call',{threadId:'thread-actual',turnId:'turn-actual',callId:'tc',tool:'read_project',arguments:{}})).toEqual({contentItems:[{type:'inputText',text:'真实工具结果'}],success:true});
 await expect(f.rpc.onRequest('item/tool/call',{threadId:'other',turnId:'turn-actual',callId:'tc2',tool:'read_project',arguments:{}})).rejects.toThrow();
 await expect(f.rpc.onRequest('item/tool/call',{threadId:'thread-actual',turnId:'turn-actual',callId:'tc3',tool:'shell',arguments:{}})).rejects.toThrow();
 expect(f.callbacks.onTool).toHaveBeenCalledTimes(1);
 await f.rpc.onNotification('turn/completed',{threadId:'thread-actual',turn:{id:'turn-actual',status:'completed',items:[{type:'agentMessage',phase:'final_answer',text:'完成'}]}});
 expect(await running).toMatchObject({sessionId:'thread-actual',providerTurnId:'turn-actual',text:'完成',usage:null});
});
it('预备回执未保存不能启动模型；不接受原生审批和伪造用户回复',async()=>{
 const f=fixture();f.callbacks.onThread.mockRejectedValueOnce(Error('no receipt'));
 await expect(runCodexNativeTurn({rpc:f.rpc,mcpNames:[],cwd:'/tmp/owned-task',prompt:'目标',signal:new AbortController().signal,tools:[],...f.callbacks})).rejects.toThrow();
 expect(f.rpc.request.mock.calls.map((x:any)=>x[0])).not.toContain('turn/start');
});
it('停止先中断同一实际回合，不调用fork/resume或新turn',async()=>{
 const f=fixture();const running=runCodexNativeTurn({rpc:f.rpc,mcpNames:[],cwd:'/tmp/task',prompt:'目标',signal:new AbortController().signal,tools:[],...f.callbacks});
 const caught=running.catch(error=>error);
 await vi.waitFor(()=>expect(f.callbacks.onTurn).toHaveBeenCalled());await f.rpc.onAbort();
 expect(f.rpc.request).toHaveBeenLastCalledWith('turn/interrupt',{threadId:'thread-actual',turnId:'turn-actual'},1000);
 expect(await caught).toBeInstanceOf(Error);
});
it('未知回执只读取同一turn，缺ID或未完成保留未知，不重放工具/模型',async()=>{
 const f=fixture();f.rpc.request.mockResolvedValueOnce({thread:{id:'thread-actual',turns:[{id:'turn-actual',status:'completed',items:[{type:'agentMessage',text:'原真实终态'}]}]}});
 expect(await recoverCodexNativeTurn(f.rpc,'thread-actual','turn-actual')).toMatchObject({text:'原真实终态',providerTurnId:'turn-actual'});
 expect(f.rpc.request).toHaveBeenCalledTimes(1);expect(f.rpc.request).toHaveBeenCalledWith('thread/read',{threadId:'thread-actual',includeTurns:true});
 await expect(recoverCodexNativeTurn(f.rpc,'thread-actual',undefined)).rejects.toThrow();expect(f.rpc.request).toHaveBeenCalledTimes(1);
});
