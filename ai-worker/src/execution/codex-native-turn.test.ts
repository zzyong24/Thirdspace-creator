import {it,expect,vi,describe} from 'vitest';
import assert from 'node:assert/strict';
import {tmpdir} from 'node:os';
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
it('T1238 结构化输出、授权图片及真实图片-only终态与恢复',async()=>{
 const f=fixture();
 const running=runCodexNativeTurn({rpc:f.rpc,mcpNames:[],cwd:'/tmp/owned-task',prompt:'生图',signal:new AbortController().signal,tools:[],outputSchema:{type:'object'},images:[{url:'data:image/png;base64,aW1hZ2U='}],...f.callbacks});
 await vi.waitFor(()=>expect(f.callbacks.onTurn).toHaveBeenCalled());
 expect(f.rpc.request.mock.calls.find((x:any)=>x[0]==='turn/start')?.[1]).toMatchObject({outputSchema:{type:'object'},input:[{type:'text',text:'生图'},{type:'image',url:'data:image/png;base64,aW1hZ2U='}]});
 const item={type:'imageGeneration',id:'img-actual',status:'completed',result:'aW1hZ2U='};
 await f.rpc.onNotification('turn/completed',{threadId:'thread-actual',turn:{id:'turn-actual',status:'completed',items:[item]}});
 expect(await running).toMatchObject({text:'',images:[{id:'img-actual',base64:'aW1hZ2U='}]});
 f.rpc.request.mockResolvedValueOnce({thread:{id:'thread-actual',turns:[{id:'turn-actual',status:'completed',items:[item]}]}});
 expect(await recoverCodexNativeTurn(f.rpc,'thread-actual','turn-actual')).toMatchObject({images:[{id:'img-actual'}]});
});

it('原预算用量已超限只打断同thread/turn，不能等待completed或另发turn',async()=>{
 const f=fixture(),observed=vi.fn(async()=>true);
 const running=runCodexNativeTurn({rpc:f.rpc,mcpNames:[],cwd:'/tmp/task',prompt:'目标',signal:new AbortController().signal,tools:[],...f.callbacks,onUsage:observed});const caught=running.catch(e=>e);
 await vi.waitFor(()=>expect(f.callbacks.onTurn).toHaveBeenCalled());
 await f.rpc.onNotification('thread/tokenUsage/updated',{threadId:'thread-actual',turnId:'turn-actual',tokenUsage:{total:{inputTokens:10,outputTokens:3,totalTokens:13}}});
 expect(observed).toHaveBeenCalledWith(expect.objectContaining({totalTokens:13}));
 expect(f.rpc.request).toHaveBeenLastCalledWith('turn/interrupt',{threadId:'thread-actual',turnId:'turn-actual'},1000);
 expect(await caught).toMatchObject({code:'CODEX_TOKEN_BUDGET_EXHAUSTED'});expect(f.rpc.request.mock.calls.filter((x:any)=>x[0]==='turn/start')).toHaveLength(1);
});

// 仅外部AppServer协议fixture：运行完整公共native-turn入口，零官方模型/用户认证读取。
const run=runCodexNativeTurn,recover=recoverCodexNativeTurn;
const protocolIt=(name:string,body:()=>Promise<void>)=>it(name,body,120000);
const T='fixture-thread-original',V='fixture-turn-original',msg=(text='fixture真实完成正文',phase='final_answer',id='msg1')=>({id,type:'agentMessage',text,phase});
const turn=(itemsView='full',items=[msg()],status='completed')=>({id:V,status,itemsView,items});
function externalProtocolFixture(readTurn=turn(),opts:any={}){
 const calls:any[]=[],usage:any[]=[],texts:any[]=[],tools:any[]=[],threads:any[]=[],admissions:any[]=[],turns:any[]=[],controller=new AbortController();let admitted!:()=>void;
 const ready=new Promise<void>(r=>admitted=r);
 const rpc:any={request:async(method:string,params:unknown,timeout?:number)=>{calls.push({method,params,timeout:timeout??120000});
  if(method==='thread/start')return {thread:{id:T},model:'fixture-model',modelProvider:'fixture-provider'};
  if(method==='mcpServerStatus/list')return {data:[]};
  if(method==='turn/start')return {turn:{id:V}};
  if(method==='turn/interrupt')return {};
  if(method==='thread/read')return opts.read?await opts.read(controller):{thread:{id:T,turns:[readTurn]}};
  throw Error('禁止未知RPC '+method);
 }};
 const options={rpc,mcpNames:[],cwd:tmpdir(),prompt:'fixture唯一原提示',signal:controller.signal,tools:[{name:'read_project',description:'fixture已授权',inputSchema:{type:'object'}}],onThread:async (id:string)=>{threads.push(id); },onAdmission:async (id:string)=>{admissions.push(id); },onTurn:async (id:string)=>{turns.push(id);admitted();},onText:async (text:string)=>{texts.push(text);},onUsage:async (u:any)=>{usage.push(u);return opts.exhaustTokens===true;},onTool:async(...args:any[])=>{tools.push(args);return {text:'fixture实际外部工具回执',success:true};}};
 const running=run(options);const outcome:Promise<any>=running.then(value=>({value}),error=>({error}));
 return {rpc,calls,usage,texts,tools,controller,ready,outcome,options,threads,admissions,turns};
}
const notify=(f:any,method:string,params:any)=>f.rpc.onNotification(method,{threadId:T,...params});
const complete=(f:any,t=turn())=>notify(f,'turn/completed',{turn:t});
async function finish(f:any,expected='fixture真实完成正文'){
 const out:any=await f.outcome;assert.equal(out.error,undefined,out.error?.stack);assert.equal(out.value.text,expected);assert.equal(out.value.sessionId,T);assert.equal(out.value.providerTurnId,V);
 assert.equal(f.calls.filter((x:any)=>x.method==='turn/start').length,1);assert.equal(f.calls.filter((x:any)=>x.method==='thread/start').length,1);
 assert.ok(f.calls.every((x:any)=>!['thread/fork','thread/resume'].includes(x.method)));assert.equal(f.tools.length,0);return out.value;
}
const unknown=async (f:any)=>{const out:any=await f.outcome;assert.equal(out.error?.code,'CODEX_TURN_RESULT_UNKNOWN');assert.equal(f.calls.filter((x:any)=>x.method==='turn/start').length,1);};
 protocolIt('原notLoaded＋同turn完成agentMessage须成功（真实RED目标）',async()=>{const f=externalProtocolFixture();await f.ready;await notify(f,'item/completed',{turnId:V,completedAtMs:1,item:msg()});await complete(f,turn('notLoaded',[]));await finish(f);assert.equal(f.calls.filter((x:any)=>x.method==='thread/read').length,0);});
 protocolIt('full真实终态原路径不回读',async()=>{const f=externalProtocolFixture();await f.ready;await complete(f);await finish(f);assert.equal(f.calls.filter((x:any)=>x.method==='thread/read').length,0);});
 protocolIt('schema省略itemsView默认full保持兼容',async()=>{const f=externalProtocolFixture();await f.ready;const t=turn();delete (t as any).itemsView;await complete(f,t);await finish(f);});
 protocolIt('summary展示文本不得冒完整正文，同原turn回读full',async()=>{const f=externalProtocolFixture();await f.ready;await complete(f,turn('summary',[msg('仅展示摘要')]));await finish(f);assert.deepEqual(f.calls.find((x:any)=>x.method==='thread/read'),{method:'thread/read',params:{threadId:T,includeTurns:true},timeout:120000});});
 protocolIt('notLoaded缺完成事件只回读同turn一次',async()=>{const f=externalProtocolFixture();await f.ready;await complete(f,turn('notLoaded',[]));await finish(f);assert.equal(f.calls.filter((x:any)=>x.method==='thread/read').length,1);});
 for(const view of ['summary','notLoaded','foreignView'])protocolIt('回读仍'+view+'保留UNKNOWN',async()=>{const f=externalProtocolFixture(turn(view,[msg('不得作为完整内容')]));await f.ready;await complete(f,turn('notLoaded',[]));await unknown(f);assert.equal(f.calls.filter((x:any)=>x.method==='thread/read').length,1);});
 protocolIt('full无文本无图片保留UNKNOWN不补造',async()=>{const f=externalProtocolFixture(turn('full',[]));await f.ready;await complete(f,turn('notLoaded',[]));await unknown(f);});
 for(const status of ['failed','interrupted','inProgress'])protocolIt('终态'+status+'不能完成或回读',async()=>{const f=externalProtocolFixture();await f.ready;await notify(f,'item/completed',{turnId:V,item:msg()});await complete(f,turn('notLoaded',[],status));await unknown(f);assert.equal(f.calls.filter((x:any)=>x.method==='thread/read').length,0);});
 protocolIt('外thread外turn完成事件与终态都不污染',async()=>{const f=externalProtocolFixture();await f.ready;await f.rpc.onNotification('item/completed',{threadId:'foreign',turnId:V,item:msg('外线程')});await notify(f,'item/completed',{turnId:'foreign',item:msg('外回合')});await f.rpc.onNotification('turn/completed',{threadId:'foreign',turn:turn()});await complete(f,{...turn(),id:'foreign'});await notify(f,'item/completed',{turnId:V,item:msg()});await complete(f,turn('notLoaded',[]));await finish(f);});
 for(const kind of ['thread','turn','missing'])protocolIt('同thread/read返回'+kind+'不匹配保UNKNOWN',async()=>{const f=externalProtocolFixture(undefined,{read:async()=>({thread:{id:kind==='thread'?'foreign':T,turns:kind==='missing'?[]:[{...turn(),id:kind==='turn'?'foreign':V}]}})});await f.ready;await complete(f,turn('notLoaded',[]));await unknown(f);});
 protocolIt('同id/phase重复completed及full事件合并仅一次',async()=>{const f=externalProtocolFixture();await f.ready;const m=msg();await notify(f,'item/completed',{turnId:V,item:m});await notify(f,'item/completed',{turnId:V,item:m});await complete(f,turn('full',[m,m]));await finish(f);});
 for(const change of [msg('冲突正文'),msg('fixture真实完成正文','commentary')])protocolIt('同id正文或phase冲突保持UNKNOWN '+change.phase,async()=>{const f=externalProtocolFixture();await f.ready;await notify(f,'item/completed',{turnId:V,item:msg()});await notify(f,'item/completed',{turnId:V,item:change});await unknown(f);});
 protocolIt('commentary完成不是final，summary须读完整history',async()=>{const f=externalProtocolFixture();await f.ready;await notify(f,'item/completed',{turnId:V,item:msg('思考中','commentary','c1')});await complete(f,turn('summary',[msg('展示摘要')]));await finish(f);assert.equal(f.calls.filter((x:any)=>x.method==='thread/read').length,1);});
 protocolIt('多个completed final按原id顺序输出，commentary不混入',async()=>{const f=externalProtocolFixture();await f.ready;for(const item of [msg('思考','commentary','c'),msg('第一段','final_answer','a'),msg('第二段','final_answer','b')])await notify(f,'item/completed',{turnId:V,item});await complete(f,turn('notLoaded',[]));await finish(f,'第一段\n\n第二段');});
 protocolIt('完成image-only事件保留实际base64无虚构文本',async()=>{const f=externalProtocolFixture();await f.ready;await notify(f,'item/completed',{turnId:V,item:{id:'image1',type:'imageGeneration',status:'completed',result:'aW1hZ2U='}});await complete(f,turn('notLoaded',[]));const result=await finish(f,'');assert.deepEqual(result.images,[{id:'image1',base64:'aW1hZ2U='}]);});
 protocolIt('取消后late完成不read不二次turn',async()=>{const f=externalProtocolFixture();await f.ready;const handler=f.rpc.onNotification;await f.rpc.onAbort();await handler('turn/completed',{threadId:T,turn:turn('notLoaded',[])});const out=await f.outcome;assert.equal(out.error?.code,'CODEX_TURN_CANCELLED');assert.equal(f.calls.filter((x:any)=>x.method==='thread/read').length,0);assert.deepEqual(f.calls.at(-1),{method:'turn/interrupt',params:{threadId:T,turnId:V},timeout:1000});});
 protocolIt('持久deadline已abort完成前不read',async()=>{const f=externalProtocolFixture();await f.ready;f.controller.abort(Error('fixture原持久任务已耗尽'));await complete(f,turn('notLoaded',[]));assert.ok((await f.outcome).error);assert.equal(f.calls.filter((x:any)=>x.method==='thread/read').length,0);});
 protocolIt('回读期间原deadline耗尽不采纳full',async()=>{const f=externalProtocolFixture(undefined,{read:async (controller:AbortController)=>{controller.abort(Error('fixture原持久期限耗尽'));return {thread:{id:T,turns:[turn()]}};}});await f.ready;await complete(f,turn('notLoaded',[]));assert.ok((await f.outcome).error);assert.equal(f.calls.filter((x:any)=>x.method==='thread/read').length,1);});
 protocolIt('累计usage重复通知只记一次，不由history新增费用',async()=>{const f=externalProtocolFixture();await f.ready;const u={turnId:V,tokenUsage:{total:{inputTokens:10,outputTokens:3,totalTokens:13}}};await notify(f,'thread/tokenUsage/updated',u);await notify(f,'thread/tokenUsage/updated',u);await complete(f,turn('summary',[]));const result=await finish(f);assert.equal(f.usage.length,1);assert.equal(result.usage.totalTokens,13);});
 protocolIt('费用预算耗尽后late终态不read，费用事实保留',async()=>{const f=externalProtocolFixture(undefined,{exhaustTokens:true});await f.ready;const handler=f.rpc.onNotification;await notify(f,'thread/tokenUsage/updated',{turnId:V,tokenUsage:{total:{totalTokens:13}}});await handler('turn/completed',{threadId:T,turn:turn('notLoaded',[])});assert.equal((await f.outcome).error?.code,'CODEX_TOKEN_BUDGET_EXHAUSTED');assert.equal(f.calls.filter((x:any)=>x.method==='thread/read').length,0);assert.equal(f.usage.length,1);});
 protocolIt('公共recover只读原turn，partial保持unknown，取消不read',async()=>{const f=externalProtocolFixture();await f.ready;await complete(f);await finish(f);const recovered=await recover(f.rpc,T,V,new AbortController().signal);assert.equal(recovered.text,'fixture真实完成正文');assert.equal(recovered.usage,null);const calls=f.calls.length;const s=new AbortController();s.abort();await assert.rejects(()=>recover(f.rpc,T,V,s.signal));assert.equal(f.calls.length,calls);await assert.rejects(()=>recover(f.rpc,T,undefined));assert.equal(f.calls.length,calls);});
 protocolIt('tool授权与真实原id gate保持，禁止foreign/tool重放',async()=>{const f=externalProtocolFixture();await f.ready;await assert.rejects(()=>f.rpc.onRequest('item/tool/call',{threadId:'foreign',turnId:V,callId:'tool1',tool:'read_project',arguments:{}}));await assert.rejects(()=>f.rpc.onRequest('item/tool/call',{threadId:T,turnId:V,callId:'tool1',tool:'unknown',arguments:{}}));await complete(f);await finish(f);});

describe("公共回读补充原ID/summary/冲突族",()=>{
const T='fixture-original-thread',V='fixture-original-turn',message=(text:string)=>({id:'m',type:'agentMessage',phase:'final_answer',text}),full=(text:string)=>({id:V,status:'completed',itemsView:'full',items:[message(text)]});
 protocolIt('history两回合仅原指定turn，较新回合不替代结果或生成新回合',async()=>{const calls:any[]=[],rpc:any={request:async(method:string,params:unknown)=>{calls.push({method,params});return {thread:{id:T,turns:[{...full('较新回合内容'),id:'newer-turn'},full('原回合完整内容')]}};}};const result=await recover(rpc,T,V,new AbortController().signal);assert.equal(result.text,'原回合完整内容');assert.deepEqual(calls,[{method:'thread/read',params:{threadId:T,includeTurns:true}}]);});
 protocolIt('公共recover明确summary不能冒完整结果',async()=>{const rpc:any={request:async()=>({thread:{id:T,turns:[{...full('只供展示'),itemsView:'summary'}]}})};await assert.rejects(()=>recover(rpc,T,V,new AbortController().signal),(e:any)=>e.code==='CODEX_TURN_RESULT_UNKNOWN');});
 protocolIt('full快照与同id完成事件冲突拒绝，不覆盖原信息',async()=>{let ready!:()=>void;const admitted=new Promise<void>(r=>ready=r),calls:any[]=[],rpc:any={request:async(method:string,params:unknown)=>{calls.push({method,params});if(method==='thread/start')return {thread:{id:T}};if(method==='mcpServerStatus/list')return {data:[]};if(method==='turn/start')return {turn:{id:V}};throw Error(method);}};const result=run({rpc,mcpNames:[],cwd:tmpdir(),prompt:'fixture唯一prompt',tools:[],signal:new AbortController().signal,onThread:async()=>{},onAdmission:async()=>{},onTurn:async()=>ready(),onTool:async()=>{throw Error('不应工具重放');}});const rejected=assert.rejects(result,(e:any)=>e.code==='CODEX_TURN_RESULT_UNKNOWN');await admitted;await rpc.onNotification('item/completed',{threadId:T,turnId:V,completedAtMs:1,item:message('事件原正文')});await rpc.onNotification('turn/completed',{threadId:T,turn:full('冲突快照')});await rejected;assert.equal(calls.filter((c:any)=>c.method==='turn/start').length,1);assert.equal(calls.filter((c:any)=>c.method==='thread/read').length,0);});

});

describe("非法full与history冲突协议族" ,()=>{
const T='fixture-thread',V='fixture-turn',message=(text:string,phase='final_answer')=>({id:'same-message',type:'agentMessage',phase,text});
function protocolItCase(name:string,view:string,items:any,known:any,readItem?:any){protocolIt(name,async()=>{let ready!:()=>void;const admitted=new Promise<void>(r=>ready=r),calls:any[]=[],rpc:any={request:async(method:string,params:unknown)=>{calls.push({method,params});if(method==='thread/start')return {thread:{id:T}};if(method==='mcpServerStatus/list')return {data:[]};if(method==='turn/start')return {turn:{id:V}};if(method==='thread/read')return {thread:{id:T,turns:[{id:V,status:'completed',itemsView:'full',items:[readItem]}]}};throw Error(method);}};const running=run({rpc,mcpNames:[],cwd:tmpdir(),prompt:'fixture原唯一提示',tools:[],signal:new AbortController().signal,onThread:async()=>{},onAdmission:async()=>{},onTurn:async()=>ready(),onTool:async()=>{throw Error('不允许重放');}});const result:Promise<any>=running.then(value=>({value}),error=>({error}));await admitted;await rpc.onNotification('item/completed',{threadId:T,turnId:V,completedAtMs:1,item:known});await rpc.onNotification('turn/completed',{threadId:T,turn:{id:V,status:'completed',itemsView:view,items}});const out=await result;assert.equal(out.error?.code,'CODEX_TURN_RESULT_UNKNOWN','非法full或冲突history必须UNKNOWN，不得完成');assert.equal(calls.filter((x:any)=>x.method==='turn/start').length,1);assert.equal(calls.filter((x:any)=>x.method==='thread/read').length,view==='full'?0:1);});}
protocolItCase('required full.items null不能由completed event补成合法', 'full',null,message('完成事件正文'));protocolItCase('partial回读full同已知completed commentary正文冲突必须UNKNOWN','notLoaded',[],message('原完成commentary','commentary'),message('冲突history内容','commentary'));protocolItCase('partial回读full同已知completed commentary phase冲突必须UNKNOWN','summary',[],message('原完成commentary','commentary'),message('原完成commentary','final_answer'));
});

describe("partial必需数组协议族" ,()=>{
const T='fixture-thread',V='fixture-turn',message=(text:string,phase='final_answer')=>({id:'same-message',type:'agentMessage',phase,text});
function protocolItCase(name:string,view:string,items:any,known:any,readItem?:any){protocolIt(name,async()=>{let ready!:()=>void;const admitted=new Promise<void>(r=>ready=r),calls:any[]=[],rpc:any={request:async(method:string,params:unknown)=>{calls.push({method,params});if(method==='thread/start')return {thread:{id:T}};if(method==='mcpServerStatus/list')return {data:[]};if(method==='turn/start')return {turn:{id:V}};if(method==='thread/read')return {thread:{id:T,turns:[{id:V,status:'completed',itemsView:'full',items:[readItem]}]}};throw Error(method);}};const running=run({rpc,mcpNames:[],cwd:tmpdir(),prompt:'fixture原唯一提示',tools:[],signal:new AbortController().signal,onThread:async()=>{},onAdmission:async()=>{},onTurn:async()=>ready(),onTool:async()=>{throw Error('不允许重放');}});const result:Promise<any>=running.then(value=>({value}),error=>({error}));await admitted;await rpc.onNotification('item/completed',{threadId:T,turnId:V,completedAtMs:1,item:known});await rpc.onNotification('turn/completed',{threadId:T,turn:{id:V,status:'completed',itemsView:view,items}});const out=await result;assert.equal(out.error?.code,'CODEX_TURN_RESULT_UNKNOWN','非法full或冲突history必须UNKNOWN，不得完成');assert.equal(calls.filter((x:any)=>x.method==='turn/start').length,1);assert.equal(calls.filter((x:any)=>x.method==='thread/read').length,0);});}
protocolItCase('partial notLoaded required items null必须UNKNOWN','notLoaded',null,message('完成事件原正文'));protocolItCase('partial summary required items null必须UNKNOWN','summary',null,message('完成事件原正文'));
});
