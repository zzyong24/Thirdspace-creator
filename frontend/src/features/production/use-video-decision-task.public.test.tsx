import {cleanup,fireEvent,render,waitFor,within} from '@testing-library/react';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
const state=vi.hoisted(()=>({copiedText:''}));
const mockClient=vi.hoisted(()=>({getTask:vi.fn(),listAITasks:vi.fn(),listTaskSteps:vi.fn(),createAITask:vi.fn(),commandExecutionTasks:vi.fn()}));
const requests=vi.hoisted(()=>[] as Array<{id:string;scope:unknown}>);
vi.mock('@/lib/http-transport',async(importOriginal)=>{
 const actual=await importOriginal<typeof import('@/lib/http-transport')>();
 const {ENDPOINTS}=await import('@creatoros/contract');
 return {...actual,fetchCreatorApi:async(_url:unknown,init:RequestInit,scope:unknown)=>{
  const body=JSON.parse(String(init.body));requests.push({id:body.id,scope});
  const entry=Object.entries(ENDPOINTS).find(([,e])=>e.id===body.id);if(!entry)throw Error('fixture endpoint unknown');
  const [method,endpoint]=entry;let data:unknown;
  if(method in mockClient)data=await (mockClient[method as keyof typeof mockClient] as (...x:unknown[])=>Promise<unknown>)(body.input);
  else if(endpoint.isList)data=[];
  else if(method==='getOutputProduction')data={id:'prod-1',contentOutputId:'out-1',productionMode:'studio',status:'drafting',recordingConfig:{},subtitleConfig:{},startedAt:null,completedAt:null,updatedAt:'2026-10-13T00:00:00Z'};
  else throw Error('unprepared public fixture operation '+method);
  return new Response(JSON.stringify({data,meta:{requestId:'controlled-T1269',page:1,pageSize:10,total:Array.isArray(data)?data.length:1}}),{status:200,headers:{'content-type':'application/json'}});
 }};
});
// RuntimeActions consumes the original global public client, configured here with the same HTTP service boundary.
vi.mock('@/lib/contract-client',async()=>{
 const {ENDPOINTS,createClient}=await import('@creatoros/contract');const {fetchCreatorApi}=await import('@/lib/http-transport');
 return {client:createClient(ENDPOINTS,{request:async(endpoint,input)=>{const r=await fetchCreatorApi('/api/v1/dispatch',{method:'POST',body:JSON.stringify({id:endpoint.id,input})},{groupId:'owned-fixture-group-A',accountId:null});return await r.json();}})};
});
import {ProductionWorkbench} from '@/features/production/production-workbench';
const makeProps=()=>({projectId:'p-1',projectTitle:'受控原任务诊断',scriptText:null,outputId:'out-1',initialStatus:'drafting',initialSegmentCount:0});
function deferred<T>(){let resolve!:(x:T)=>void;const promise=new Promise<T>(r=>resolve=r);return {promise,resolve};}
beforeEach(()=>{vi.clearAllMocks();state.copiedText='';requests.length=0;mockClient.listTaskSteps.mockResolvedValue([]);mockClient.listAITasks.mockResolvedValue([]);mockClient.getTask.mockResolvedValue(null);Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:vi.fn(async(text:string)=>{state.copiedText=text;})}});});
afterEach(cleanup);
// [T1269] 外部客户端为受控fixture；ProductionWorkbench、原task hook、RuntimeActions均是真实公共消费者。
const managedTask = (overrides:Record<string,unknown>={}) => ({userId:'owned-user',groupId:'owned-fixture-group-A',groupVersion:1,membershipVersion:1,projectId:'p-1',contentOutputId:null,taskType:'video.decisions',inputData:{},modelKey:'controlled-protocol',idempotencyKey:'fixture-idempotency',attemptId:'fixture-attempt-123456',requestFingerprint:'sha256:'+ 'a'.repeat(64),retryOfTaskId:null,requestedAt:'2026-10-13T00:00:00Z',startedAt:null,completedAt:null,id:'mapped-original',status:'failed',executionTaskId:'execution-original',runtimeStatus:'failed',errorCode:'NODE_UPSTREAM',errorMessage:'HTTP 503 upstream temporarily unavailable',...overrides});
function restoreManaged(task=managedTask()) {
 mockClient.listAITasks.mockResolvedValue([task] as never);
 mockClient.getTask.mockResolvedValue(task as never);
 return render(<ProductionWorkbench {...makeProps()} />);
}
const managedRetry = mockClient.commandExecutionTasks;
managedRetry.mockResolvedValue({tasks:[]});
beforeEach(()=>{
 window.localStorage.setItem('creatoros:current-group','owned-fixture-group-A');
 managedRetry.mockResolvedValue({tasks:[]});managedRetry.mockClear();
});
describe('[T1269] 持久失败诊断公共组件',()=>{
 it('[T1269] 原execution失败显示公共error字段，刷新后仍同ID，不重建任务',async()=>{
  const task=managedTask();const a=restoreManaged(task);
  await waitFor(()=>expect(a.container.querySelector('[data-slot="decision-error-detail"]')?.textContent).toContain('HTTP 503'));
  expect(a.container.textContent).toContain('NODE_UPSTREAM');expect(mockClient.listTaskSteps).not.toHaveBeenCalled();
  expect(a.container.querySelector('[data-slot="dispatch-decisions"]')).toBeNull();
  a.unmount();const b=restoreManaged(task);
  await waitFor(()=>expect(b.container.querySelector('[data-slot="decision-error-detail"]')?.textContent).toContain('HTTP 503'));
  expect(mockClient.getTask).toHaveBeenCalledWith(expect.objectContaining({params:{taskId:'mapped-original'}}));expect(mockClient.createAITask).not.toHaveBeenCalled();
 });
 it('[T1269] 显示与复制共用真实脱敏规则，不泄露key Bearer password或私有URL',async()=>{
  const a=restoreManaged(managedTask({errorMessage:'HTTP 503; Bearer synthetic-token; apiKey=synthetic-api; password=synthetic-pass; sk-fixtureAlphabet123; https://private.invalid/api?token=synthetic-url'}));
  await waitFor(()=>expect(a.container.querySelector('[data-slot="copy-decision-error"]')).not.toBeNull());
  const text=a.container.querySelector('[data-slot="decision-error-detail"]')!.textContent!;
  expect(text).toContain('HTTP 503');expect(text).toContain('[REDACTED]');expect(text).not.toMatch(/synthetic-token|synthetic-api|synthetic-pass|sk-fixtureAlphabet123|private\.invalid/);
  fireEvent.click(a.container.querySelector('[data-slot="copy-decision-error"]')!);await waitFor(()=>expect(state.copiedText).toBe(text));
  expect(a.container.textContent).not.toMatch(/synthetic-token|synthetic-api|synthetic-pass|sk-fixtureAlphabet123|private\.invalid/);
 });
 it('[T1269] 无字段保留真实空态和原任务控制，不能编造错误详情',async()=>{
  const a=restoreManaged(managedTask({errorCode:null,errorMessage:null}));
  await waitFor(()=>expect(a.container.textContent).toContain('原分场任务失败'));
  expect(a.container.textContent).toContain('原任务未提供错误详情');expect(a.container.querySelector('[data-slot="decision-error-detail"]')).toBeNull();expect(a.container.querySelector('[data-slot="copy-decision-error"]')).toBeNull();
  expect(within(a.container).getByRole('button',{name:'重试原任务'})).toBeEnabled();expect(mockClient.createAITask).not.toHaveBeenCalled();
 });
 it('[T1269] 只有errorCode时保留代码但不伪造message',async()=>{
  const a=restoreManaged(managedTask({errorCode:'SOURCE_UNAVAILABLE',errorMessage:null}));
  await waitFor(()=>expect(a.container.querySelector('[data-slot="decision-error-detail"]')?.textContent).toBe('错误代码：SOURCE_UNAVAILABLE'));
  expect(a.container.textContent).not.toContain('unknown error');
 });
 it('[T1269] runtimeStatus failed优先于业务running，原retry只发送同execution command',async()=>{
  const task=managedTask({status:'running'});const a=restoreManaged(task);
  await waitFor(()=>expect(a.container.querySelector('[data-slot="decision-error-detail"]')?.textContent).toContain('HTTP 503'));
  mockClient.getTask.mockResolvedValue(managedTask({status:'running',runtimeStatus:'running',errorMessage:null,errorCode:null}) as never);
  fireEvent.click(within(a.container).getByRole('button',{name:'重试原任务'}));
  await waitFor(()=>expect(managedRetry).toHaveBeenCalledTimes(1));
  expect(managedRetry).toHaveBeenCalledWith(expect.objectContaining({body:{taskIds:['execution-original'],command:'retry',idempotencyKey:expect.any(String)}}));
  await waitFor(()=>expect(a.container.querySelector('[data-slot="decisions-error"]')).toBeNull());
  expect(mockClient.createAITask).not.toHaveBeenCalled();
 });
 for(const status of ['waiting_user','unknown_result','blocked','paused','cancelled'])it(`[T1269] ${status}不是failed，不投影旧错误`,async()=>{
  const a=restoreManaged(managedTask({status:'running',runtimeStatus:status}));
  await waitFor(()=>expect(mockClient.getTask).toHaveBeenCalled());
  expect(a.container.querySelector('[data-slot="decision-error-detail"]')).toBeNull();expect(a.container.querySelector('[data-slot="copy-decision-error"]')).toBeNull();expect(mockClient.createAITask).not.toHaveBeenCalled();
 });
 it('[T1269] 不接受不同task ID的失败回读，也不能对外来execution显示控制',async()=>{
  mockClient.listAITasks.mockResolvedValue([managedTask()] as never);mockClient.getTask.mockResolvedValue(managedTask({id:'foreign-task',executionTaskId:'foreign-execution',errorMessage:'FOREIGN-PRIVATE-DIAGNOSTIC'}) as never);
  const a=render(<ProductionWorkbench {...makeProps()} />);await waitFor(()=>expect(mockClient.getTask).toHaveBeenCalled());
  expect(a.container.textContent).not.toContain('FOREIGN-PRIVATE-DIAGNOSTIC');expect(a.container.textContent).not.toContain('原分场任务失败');expect(a.container.querySelector('[data-slot="decision-error-detail"]')).toBeNull();
 });
 it('[T1269] 原轮询读取未完成时切组，晚到失败不能回写新组',async()=>{
  const pending=deferred<ReturnType<typeof managedTask>>();mockClient.listAITasks.mockResolvedValueOnce([managedTask({status:'running',runtimeStatus:'running'})] as never).mockResolvedValue([]);mockClient.getTask.mockImplementationOnce(()=>pending.promise as never);
  const a=render(<ProductionWorkbench {...makeProps()} />);await waitFor(()=>expect(mockClient.getTask).toHaveBeenCalled());
  window.localStorage.setItem('creatoros:current-group','owned-fixture-group-B');fireEvent(window,new Event('creatoros:accounts-changed'));
  await waitFor(()=>expect(mockClient.listAITasks).toHaveBeenCalledTimes(2));
  pending.resolve(managedTask({errorMessage:'OLD-GROUP-ERROR'}));await new Promise(r=>setTimeout(r,0));
  expect(a.container.textContent).not.toContain('OLD-GROUP-ERROR');expect(a.container.querySelector('[data-slot="decision-error-detail"]')).toBeNull();expect(mockClient.createAITask).not.toHaveBeenCalled();
 });
 it('[T1269] 同task且组A-B-A后旧owner失败不能回写',async()=>{
  const pending=deferred<ReturnType<typeof managedTask>>();mockClient.listAITasks.mockResolvedValueOnce([managedTask({status:'running',runtimeStatus:'running'})]).mockResolvedValue([]);mockClient.getTask.mockImplementationOnce(()=>pending.promise);
  const a=render(<ProductionWorkbench {...makeProps()} />);await waitFor(()=>expect(mockClient.getTask).toHaveBeenCalled());
  window.localStorage.setItem('creatoros:current-group','owned-fixture-group-B');fireEvent(window,new Event('creatoros:accounts-changed'));await waitFor(()=>expect(mockClient.listAITasks).toHaveBeenCalledTimes(2));
  window.localStorage.setItem('creatoros:current-group','owned-fixture-group-A');fireEvent(window,new Event('creatoros:accounts-changed'));await waitFor(()=>expect(mockClient.listAITasks).toHaveBeenCalledTimes(3));
  pending.resolve(managedTask({errorMessage:'ABA-OLD-OWNER-ERROR'}));await new Promise(r=>setTimeout(r,0));
  expect(a.container.textContent).not.toContain('ABA-OLD-OWNER-ERROR');expect(a.container.querySelector('[data-slot="decision-error-detail"]')).toBeNull();expect(mockClient.createAITask).not.toHaveBeenCalled();
 });
 it('[T1269] 卸载后的失败回读不启动steps/复制/原任务command',async()=>{
  const pending=deferred<ReturnType<typeof managedTask>>();mockClient.listAITasks.mockResolvedValue([managedTask({status:'running',runtimeStatus:'running'})] as never);mockClient.getTask.mockImplementationOnce(()=>pending.promise as never);
  const a=render(<ProductionWorkbench {...makeProps()} />);await waitFor(()=>expect(mockClient.getTask).toHaveBeenCalled());a.unmount();
  pending.resolve(managedTask());await new Promise(r=>setTimeout(r,0));expect(mockClient.listTaskSteps).not.toHaveBeenCalled();expect(managedRetry).not.toHaveBeenCalled();expect(state.copiedText).toBe('');
 });
});


describe('[T1269] 宪章Cookie与本地路径诊断边界',()=>{
 it('[T1269] Cookie/Set-Cookie头正文与复制不外泄，保HTTP可读诊断',async()=>{
  const a=restoreManaged(managedTask({errorMessage:'HTTP 503; Cookie: session=owned-fixture-session; csrftoken=owned-fixture-csrf\nSet-Cookie: session=owned-fixture-set-cookie; Path=/; HttpOnly\nrequest failed; upstream unavailable'}));
  await waitFor(()=>expect(a.container.querySelector('[data-slot="copy-decision-error"]')).not.toBeNull());
  const text=a.container.querySelector('[data-slot="decision-error-detail"]')!.textContent!;
  expect(text).toContain('HTTP 503');expect(text).toContain('request failed');expect(a.container.textContent).not.toMatch(/owned-fixture-session|owned-fixture-csrf|owned-fixture-set-cookie/);
  fireEvent.click(a.container.querySelector('[data-slot="copy-decision-error"]')!);await waitFor(()=>expect(state.copiedText).toBe(text));expect(state.copiedText).not.toMatch(/owned-fixture-session|owned-fixture-csrf|owned-fixture-set-cookie/);
  a.unmount();
  const jsonDiagnostic=JSON.stringify({Cookie:'session=owned-json-cookie','Set-Cookie':'session=owned-json-set-cookie',message:'HTTP 503 upstream unavailable',reason:'request failed'});
  const j=restoreManaged(managedTask({errorMessage:jsonDiagnostic}));await waitFor(()=>expect(j.container.querySelector('[data-slot="copy-decision-error"]')).not.toBeNull());
  const jsonText=j.container.querySelector('[data-slot="decision-error-detail"]')!.textContent!;
  expect(jsonText).toContain('HTTP 503');expect(jsonText).toContain('upstream unavailable');expect(jsonText).toContain('request failed');expect(j.container.textContent).not.toMatch(/owned-json-cookie|owned-json-set-cookie/);
  fireEvent.click(j.container.querySelector('[data-slot="copy-decision-error"]')!);await waitFor(()=>expect(state.copiedText).toBe(jsonText));expect(state.copiedText).not.toMatch(/owned-json-cookie|owned-json-set-cookie/);
 });
 it('[T1269] Unix/macOS/Windows绝对路径正文和复制不外泄，保节点原因',async()=>{
  const a=restoreManaged(managedTask({errorMessage:'HTTP 503 input read failed: /Users/fixture-user/Library/private-video.mp4; /private/tmp/owned-fixture/input.mp4; /home/fixture-user/media/source.mov; C:\\Users\\fixture-user\\Videos\\private-source.mp4; D:/private/source.wav; "/Users/fixture user/My Documents/private spaced.mov"; file:///Users/fixture-file-URL/Library/private%20url.wav; \\\\fixture-server\\private-share\\private-unc.mov; node unavailable'}));
  await waitFor(()=>expect(a.container.querySelector('[data-slot="copy-decision-error"]')).not.toBeNull());
  const text=a.container.querySelector('[data-slot="decision-error-detail"]')!.textContent!;
  expect(text).toContain('HTTP 503');expect(text).toContain('input read failed');expect(text).toContain('node unavailable');expect(a.container.textContent).not.toMatch(/fixture-user|owned-fixture\/input|private-source|D:\/private|source\.mov|source\.wav|fixture user|private spaced|fixture-file-URL|private%20url|fixture-server|private-share|private-unc/);
  fireEvent.click(a.container.querySelector('[data-slot="copy-decision-error"]')!);await waitFor(()=>expect(state.copiedText).toBe(text));expect(state.copiedText).not.toMatch(/fixture-user|owned-fixture\/input|private-source|D:\/private|source\.mov|source\.wav|fixture user|private spaced|fixture-file-URL|private%20url|fixture-server|private-share|private-unc/);
 });
});
