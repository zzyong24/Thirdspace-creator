import * as React from 'react';
import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {ENDPOINTS,type PredictionLockState} from '@creatoros/contract';
const mocks=vi.hoisted(()=>({refresh:vi.fn(),command:vi.fn(),read:vi.fn(),start:vi.fn(),confirm:vi.fn(),createOutput:vi.fn(),createAITask:vi.fn(),listPredictions:vi.fn(),lockPrediction:vi.fn()}));
vi.mock('next/navigation',()=>({useRouter:()=>({refresh:mocks.refresh})}));
vi.mock('@/lib/contract-client',()=>({client:{readPredictionLockSource:mocks.read,startPredictionLock:mocks.start,confirmTask:mocks.confirm,createOutput:mocks.createOutput,createAITask:mocks.createAITask,listPredictions:mocks.listPredictions,lockPrediction:mocks.lockPrediction}}));
import {ChatDiagnosisCard} from './chat-result-cards';
const source={conversationId:'conversation-1',sourceMessageId:'message-1',toolCallId:'tool-1'};
const blind={outputId:null,projectId:'page-project',projectTitle:'页面VM不是原卡来源',source};
const diagnosis={dimensions:[{key:'hook',score:4,reason:'开头清楚',suggestion:'保持'}],verdict:'可发',mainIssues:[],priorityFixes:['核对结尾']};
function state(status:PredictionLockState['status'],extra:Partial<PredictionLockState>={}):PredictionLockState{return {policyVersion:1,source,status,subjectId:'original-output',projectId:'original-project',baselineDigest:'digest-original',baseline:{artifactId:'script-1',versionId:'version-2',sha256:'hash-original'},diagnoseTaskId:null,resultId:null,predictionId:null,task:null,...extra};}
function pending(){return state('awaiting_confirmation',{diagnoseTaskId:'task-original',resultId:'result-original',task:task('awaiting_confirmation') as any});}
const requests:Array<{input:any;init:RequestInit}>=[];
const task=(status:string)=>({id:'task-original',userId:'user-1',projectId:'original-project',contentOutputId:'original-output',taskType:'calibration.diagnose',status,inputData:{},modelKey:'controlled',idempotencyKey:'key-original',attemptId:'attempt-original-12345',requestFingerprint:'sha256:'+'a'.repeat(64),retryOfTaskId:null,requestedAt:'2026-10-17T00:00:00.000Z',startedAt:null,completedAt:null,errorMessage:null});
const props={diagnosis,blindPredict:blind,pollIntervalMs:0};
async function enabled(label='锁定为盲预测'){await waitFor(()=>expect((screen.getByText(label) as HTMLButtonElement).disabled).toBe(false));}
function oldWritesNever(){for(const name of ['createOutput','createAITask','listPredictions','lockPrediction'] as const)expect(mocks[name]).not.toHaveBeenCalled();}
afterEach(()=>{cleanup();localStorage.clear();vi.unstubAllGlobals();});
beforeEach(()=>{vi.resetAllMocks();localStorage.clear();localStorage.setItem('creatoros:current-group','group-original');localStorage.setItem('creatoros:current-account','filtered-account');requests.length=0;
 vi.stubGlobal('fetch',vi.fn(async(_url:unknown,init:RequestInit)=>{const packet=JSON.parse(init.body as string);requests.push({input:packet,init});const method=packet.id===ENDPOINTS.readPredictionLockSource.id?mocks.read:packet.id===ENDPOINTS.startPredictionLock.id?mocks.start:packet.id===ENDPOINTS.confirmTask.id?mocks.confirm:packet.id===ENDPOINTS.commandExecutionTasks.id?mocks.command:null;if(!method)throw Error('UNEXPECTED_ENDPOINT_'+packet.id);const value=await method(packet.input);return Response.json({data:value,meta:{requestId:'controlled-test'}});}));mocks.read.mockResolvedValue(state('available'));mocks.start.mockResolvedValue(state('running',{diagnoseTaskId:'task-original',task:task('running') as any}));mocks.confirm.mockResolvedValue(task('succeeded'));});
describe('原消息盲预测卡的只读恢复与用户确认',()=>{
 it('复盘导航携带原回执项目与预测定位，不跳旧设置页或页面VM项目',async()=>{
  mocks.read.mockResolvedValue(state('locked',{predictionId:'prediction-original'}));render(<ChatDiagnosisCard {...props}/>);
  const link=await screen.findByText('看复盘 →');expect(link).toHaveAttribute('href','/projects/original-project/review?predictionId=prediction-original#prediction-prediction-original');oldWritesNever();
 });
 it('锁定后按具体预测及不可变rubric显示正式六维，复盘链接来自原回执',async()=>{
  const dimensions=Array.from({length:6},(_,i)=>({key:'formal-'+i,label:'正式维度'+i,weight:1/6}));
  const prediction:NonNullable<PredictionLockState['formalPrediction']>['prediction']={id:'prediction-original',userId:'user-1',subjectType:'content_output',subjectId:'original-output',rubricVersionId:'rubric-frozen',predictedMetrics:{diagnosis:{verdict:'正式结论',priorityFixes:[]}},predictedConversion:{dimensions:dimensions.map(d=>({key:d.key,score:3,reason:'已保存理由',suggestion:''}))},predictedScore:3,confidence:'med',status:'locked',lockedAt:'2026-10-17T00:00:00.000Z',createdAt:'2026-10-17T00:00:00.000Z'};
  mocks.read.mockResolvedValue(state('locked',{predictionId:prediction.id,formalPrediction:{prediction,rubric:{id:'rubric-frozen',dimensions}}}));
  render(<ChatDiagnosisCard {...props} diagnosis={{...diagnosis,dimensions:Array.from({length:5},(_,i)=>({key:'旧维'+i,score:5,reason:'旧理由',suggestion:''}))}}/>);
  await screen.findByText('已锁定 · 不可改');
  expect(document.querySelectorAll('[data-slot="chat-diagnosis-dim"]')).toHaveLength(6);
  expect(screen.queryByText('旧维0')).toBeNull();expect(screen.getByText('正式维度5')).toBeTruthy();
  expect(screen.getByText(/加权分：3/)).toBeTruthy();expect(screen.getByText(/rubric-frozen/)).toBeTruthy();
  expect(screen.getByText('看复盘 →')).toHaveAttribute('href','/projects/original-project/review?predictionId=prediction-original#prediction-prediction-original');
  oldWritesNever();
 });
 it('旧locked响应无正式投影时诚实显示不可读，不用初始分数替代',async()=>{
  mocks.read.mockResolvedValue(state('locked',{predictionId:'original-locked'}));render(<ChatDiagnosisCard {...props}/>);
  await screen.findByText('已锁定 · 不可改');expect(screen.getByText(/已锁定评分暂未读取/)).toBeTruthy();expect(screen.queryByText('4 / 5')).toBeNull();oldWritesNever();
 });
 it('非盲预测只读；无来源的旧卡不猜VM output',async()=>{
  const view=render(<ChatDiagnosisCard diagnosis={diagnosis}/>);expect(screen.getByText('4 / 5')).toBeTruthy();expect(mocks.read).not.toHaveBeenCalled();view.rerender(<ChatDiagnosisCard diagnosis={diagnosis} blindPredict={{...blind,source:null}}/>);expect(screen.getByText(/原卡片来源未记录/)).toBeTruthy();expect((screen.getByText('锁定为盲预测') as HTMLButtonElement).disabled).toBe(true);expect(mocks.start).not.toHaveBeenCalled();oldWritesNever();
 });
 it('挂载GET原三元组；用户start→原任务confirm→精确locked，重复点击不新增',async()=>{
  render(<ChatDiagnosisCard {...props}/>);await enabled();expect(mocks.start).not.toHaveBeenCalled();expect(mocks.confirm).not.toHaveBeenCalled();expect(mocks.read).toHaveBeenCalledWith({params:{conversationId:source.conversationId},query:{sourceMessageId:source.sourceMessageId,toolCallId:source.toolCallId},body:undefined});
  expect(new Headers(requests[0]!.init.headers).get('x-group-id')).toBe('group-original');expect(new Headers(requests[0]!.init.headers).has('x-account-id')).toBe(false);
  mocks.read.mockImplementation(async()=>mocks.confirm.mock.calls.length?state('locked',{diagnoseTaskId:'task-original',predictionId:'prediction-original'}):pending());
  await act(async()=>{fireEvent.click(screen.getByText('锁定为盲预测'));fireEvent.click(screen.getByText('锁定为盲预测'));});
  await waitFor(()=>expect(screen.getByText('已锁定 · 不可改')).toBeTruthy());expect(mocks.start).toHaveBeenCalledTimes(1);expect(mocks.start).toHaveBeenCalledWith({params:{conversationId:source.conversationId},query:undefined,body:{sourceMessageId:source.sourceMessageId,toolCallId:source.toolCallId,expectedBaselineDigest:'digest-original',policyVersion:1}});expect(mocks.confirm).toHaveBeenCalledTimes(1);expect(mocks.confirm).toHaveBeenCalledWith({params:{taskId:'task-original'},query:undefined,body:undefined});expect(mocks.refresh).toHaveBeenCalledTimes(1);for(const request of requests){expect(new Headers(request.init.headers).get('x-group-id')).toBe('group-original');expect(new Headers(request.init.headers).has('x-account-id')).toBe(false);}oldWritesNever();
 });
 it('恢复awaiting_confirmation挂载零写，只有用户继续才确认原ID',async()=>{
  mocks.read.mockImplementation(async()=>mocks.confirm.mock.calls.length?state('locked',{predictionId:'receipt-original'}):pending());render(<ChatDiagnosisCard {...props}/>);await enabled('继续锁定');expect(mocks.start).not.toHaveBeenCalled();expect(mocks.confirm).not.toHaveBeenCalled();fireEvent.click(screen.getByText('继续锁定'));await waitFor(()=>expect(screen.getByText('已锁定 · 不可改')).toBeTruthy());expect(mocks.start).not.toHaveBeenCalled();expect(mocks.confirm).toHaveBeenCalledTimes(1);oldWritesNever();
 });
 it('已锁卡重挂载只读原receipt；不确认、不按最新prediction猜锁',async()=>{
  mocks.read.mockResolvedValue(state('locked',{predictionId:'original-locked'}));const view=render(<ChatDiagnosisCard {...props}/>);await screen.findByText('已锁定 · 不可改');view.unmount();render(<ChatDiagnosisCard {...props}/>);await screen.findByText('已锁定 · 不可改');expect(mocks.read).toHaveBeenCalledTimes(2);expect(mocks.start).not.toHaveBeenCalled();expect(mocks.confirm).not.toHaveBeenCalled();expect(mocks.refresh).not.toHaveBeenCalled();oldWritesNever();
 });
 it.each(['legacy_unknown','unknown','missing','failed'] as const)('%s保状态不自动重发',async status=>{
  mocks.read.mockResolvedValue(state(status,{diagnoseTaskId:'task-retained'}));render(<ChatDiagnosisCard {...props}/>);await waitFor(()=>expect(mocks.read).toHaveBeenCalledTimes(1));await act(async()=>{});expect((screen.getByText('锁定为盲预测') as HTMLButtonElement).disabled).toBe(true);expect(mocks.start).not.toHaveBeenCalled();expect(mocks.confirm).not.toHaveBeenCalled();oldWritesNever();
 });
 it('单在途GET，切来源后旧响应不覆盖新卡，也不隐式确认',async()=>{
  let release!:(value:PredictionLockState)=>void;mocks.read.mockImplementationOnce(()=>new Promise(resolve=>{release=resolve}));const view=render(<ChatDiagnosisCard {...props}/>);await waitFor(()=>expect(mocks.read).toHaveBeenCalledTimes(1));const oldSignal=requests[0]!.init.signal;const next={...source,toolCallId:'tool-next'};mocks.read.mockResolvedValue(state('available',{source:next}));view.rerender(<ChatDiagnosisCard {...props} blindPredict={{...blind,source:next}}/>);await waitFor(()=>expect(mocks.read).toHaveBeenCalledTimes(2));expect(oldSignal?.aborted).toBe(true);await act(async()=>release(pending()));await enabled();expect(screen.queryByText('继续锁定')).toBeNull();expect(mocks.confirm).not.toHaveBeenCalled();oldWritesNever();
 });
 it('卸载时原GET返回awaiting仍不确认',async()=>{
  let release!:(value:PredictionLockState)=>void;mocks.read.mockImplementationOnce(()=>new Promise(resolve=>{release=resolve}));const view=render(<ChatDiagnosisCard {...props}/>);await waitFor(()=>expect(mocks.read).toHaveBeenCalledTimes(1));view.unmount();await act(async()=>release(pending()));expect(mocks.confirm).not.toHaveBeenCalled();expect(mocks.start).not.toHaveBeenCalled();
 });
 it('切工作区后旧start回执不可确认或回写，新的GET仍只读',async()=>{
  let release!:(value:PredictionLockState)=>void;mocks.start.mockImplementation(()=>new Promise(resolve=>{release=resolve}));render(<ChatDiagnosisCard {...props}/>);await enabled();fireEvent.click(screen.getByText('锁定为盲预测'));await waitFor(()=>expect(mocks.start).toHaveBeenCalledTimes(1));
  await act(async()=>{localStorage.setItem('creatoros:current-group','group-next');window.dispatchEvent(new Event('creatoros:accounts-changed'));});
  await act(async()=>release(pending()));await enabled();expect(screen.queryByText('继续锁定')).toBeNull();expect(mocks.confirm).not.toHaveBeenCalled();expect(mocks.refresh).not.toHaveBeenCalled();oldWritesNever();
 });
 it('基线冲突保原错误，不新建output、不重发start',async()=>{
  mocks.start.mockRejectedValue(Error('原稿基线已经变化'));render(<ChatDiagnosisCard {...props}/>);await enabled();fireEvent.click(screen.getByText('锁定为盲预测'));await screen.findByText('原稿基线已经变化');expect(mocks.start).toHaveBeenCalledTimes(1);expect(mocks.confirm).not.toHaveBeenCalled();expect((screen.getByText('锁定为盲预测') as HTMLButtonElement).disabled).toBe(true);oldWritesNever();
 });
 it('原任务两次合法retry换新key；同次未知重试保同key，成功后才能清除',async()=>{
  mocks.read.mockResolvedValue(state('failed',{diagnoseTaskId:'task-original',task:{...task('failed'),executionTaskId:'execution-original',runtimeStatus:'failed'} as any}));mocks.command.mockRejectedValueOnce(Error('命令结果未知')).mockResolvedValue({tasks:[]});render(<ChatDiagnosisCard {...props}/>);
  const retry=await screen.findByText('重试原任务');fireEvent.click(retry);await screen.findByText('命令结果未知');await waitFor(()=>expect((retry as HTMLButtonElement).disabled).toBe(false));fireEvent.click(retry);await waitFor(()=>expect(mocks.command).toHaveBeenCalledTimes(2));await waitFor(()=>expect((retry as HTMLButtonElement).disabled).toBe(false));expect(mocks.command.mock.calls[1]![0].body.idempotencyKey).toBe(mocks.command.mock.calls[0]![0].body.idempotencyKey);
  fireEvent.click(retry);await waitFor(()=>expect(mocks.command).toHaveBeenCalledTimes(3));expect(mocks.command.mock.calls[2]![0].body.idempotencyKey).not.toBe(mocks.command.mock.calls[1]![0].body.idempotencyKey);expect(mocks.start).not.toHaveBeenCalled();expect(mocks.confirm).not.toHaveBeenCalled();oldWritesNever();
 });
 it('原任务命令跨scope返回不回写；旧signal中止且新scope立即只读',async()=>{
  let release!:(value:unknown)=>void;mocks.read.mockResolvedValue(state('failed',{diagnoseTaskId:'task-original',task:{...task('failed'),executionTaskId:'execution-original',runtimeStatus:'failed'} as any}));mocks.command.mockImplementation(()=>new Promise(resolve=>{release=resolve}));render(<ChatDiagnosisCard {...props}/>);fireEvent.click(await screen.findByText('重试原任务'));await waitFor(()=>expect(mocks.command).toHaveBeenCalledTimes(1));const commandSignal=requests.find(row=>row.input.id===ENDPOINTS.commandExecutionTasks.id)!.init.signal;
  mocks.read.mockResolvedValue(state('available'));await act(async()=>{localStorage.setItem('creatoros:current-group','group-next');window.dispatchEvent(new Event('creatoros:accounts-changed'));});await enabled();expect(commandSignal?.aborted).toBe(true);const count=mocks.read.mock.calls.length;await act(async()=>release({tasks:[]}));expect(mocks.read).toHaveBeenCalledTimes(count);expect(screen.queryByText('重试原任务')).toBeNull();expect(mocks.refresh).not.toHaveBeenCalled();expect(mocks.confirm).not.toHaveBeenCalled();
 });
 it('服务返回其它source拒绝，不将串卡receipt视为锁定',async()=>{
  mocks.read.mockResolvedValue(state('locked',{source:{...source,toolCallId:'foreign'}}));render(<ChatDiagnosisCard {...props}/>);await screen.findByText(/锁定回执不匹配/);expect(screen.queryByText('已锁定 · 不可改')).toBeNull();expect(mocks.confirm).not.toHaveBeenCalled();oldWritesNever();
 });
});
