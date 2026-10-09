import {act,renderHook,waitFor,cleanup} from '@testing-library/react';
import {afterEach,describe,expect,it,vi} from 'vitest';
import type {ExecutionTaskResourceV2} from '@creatoros/contract';
import type {RadarApi} from './intelligence-workbench-types';
import {useProjectUpgradeQueue,upgradeLabel,upgradeNotice} from './use-project-upgrade-queue';
import {defaultApi} from './intelligence-workbench-api';
import {ENDPOINTS,executionTaskResourceV2} from '@creatoros/contract';

afterEach(cleanup);
const task={id:'upgrade',accountId:'account',ownerId:'item',status:'blocked',errorCode:'BOUND_ASR_RESULT_UNKNOWN',errorMessage:'提交结果未知，须同键对账',createdAt:'2026-09-09'} as ExecutionTaskResourceV2;
describe('升级未知结果处理',()=>{
 it('T-1106 原账号校验失败显示人话，显式重试仍使用原任务',async()=>{
  const old={...task,errorCode:'STALE_WORKSPACE_MEMBERSHIP',errorMessage:'任务缺少冻结账号归属版本，请重新选择目标'};
  expect(upgradeNotice(old)).not.toMatch(/冻结|版本/);
  expect(upgradeNotice(old)).toContain('原账号');
  expect(upgradeNotice(old)).toContain('已完成内容');
  const api={listProjectUpgrades:vi.fn().mockResolvedValue({tasks:[old],total:1}),enqueueProjectUpgrades:vi.fn(),commandTask:vi.fn().mockResolvedValue({})} as unknown as RadarApi;
  const {result}=renderHook(()=>useProjectUpgradeQueue({api,accountId:'account',positioningVersionId:'positioning',setNotice:vi.fn()}));
  await waitFor(()=>expect(result.current.byItem.has('item')).toBe(true));
  await act(()=>result.current.enqueue('item'));
  expect(api.commandTask).toHaveBeenCalledWith(expect.objectContaining({taskId:'upgrade',command:'retry'}));
  expect(api.enqueueProjectUpgrades).not.toHaveBeenCalled();
 });
 it('父任务正常等待子任务不显示故障，真实退避保留原因',()=>{
  const waiting={...task,status:'queued',runtimeStatus:'retry_wait',errorCode:null,errorMessage:null,checkpoint:{stage:'transcribing'}} as ExecutionTaskResourceV2;
  expect(upgradeNotice(waiting)).toBeNull();
  expect(upgradeLabel(waiting)).toBe('AI 转写中');
  expect(upgradeNotice({...waiting,errorCode:'BROWSER_PROFILE_BUSY',errorMessage:'浏览器占用，稍后重试'})).toBe('浏览器占用，稍后重试');
 });
 it.each([false,true])('检查真实逐字稿再决定继续，正文完整=%s',async(done)=>{
  const commandTask=vi.fn().mockResolvedValue({});const setNotice=vi.fn();
  const api={listProjectUpgrades:vi.fn().mockResolvedValue({tasks:[task],total:1}),enqueueProjectUpgrades:vi.fn(),commandTask,getItem:vi.fn().mockResolvedValue({transcript:{status:done?'done':'running',text:done?'真实逐字稿':null}})} as unknown as RadarApi;
  const {result}=renderHook(()=>useProjectUpgradeQueue({api,accountId:'account',positioningVersionId:'positioning',setNotice}));
  await waitFor(()=>expect(result.current.byItem.has('item')).toBe(true));
  await act(()=>result.current.enqueue('item'));
  expect(api.getItem).toHaveBeenCalledWith('item');
  expect(commandTask).toHaveBeenCalledTimes(done?1:0);
  expect(api.enqueueProjectUpgrades).not.toHaveBeenCalled();
  if(!done)expect(setNotice.mock.calls.at(-1)?.[0]).toContain('不会重复提交转写');
 });
 it('不把内部对账术语或普通重试展示为未知转写的处理',()=>{
  expect(upgradeLabel(task)).toBe('检查并继续升级');
  expect(upgradeNotice(task)).toContain('升级已暂停');
  expect(upgradeNotice(task)).not.toContain('同键');
 });
});

describe('T-1073 雷达完整历史与低频发现',()=>{
 const row=(id:string,status='succeeded')=>({id,userId:'synthetic-user',accountId:'account',groupId:null,kind:'radar_project_upgrade',ownerType:'item_import',ownerId:id,status,priority:1,idempotencyKey:id,checkpoint:null,leaseOwner:null,leaseExpiresAt:null,heartbeatAt:null,attempt:0,maxAttempts:3,errorCode:null,errorMessage:null,costEstimate:null,createdAt:'2026-10-07T00:00:00Z',updatedAt:'2026-10-07T00:00:00Z'});
 it('真实Radar HTTP adapter首次保留250条，空闲30秒不重复扫描，60秒内发现外部新增',async()=>{
  vi.useFakeTimers();vi.spyOn(document,'hidden','get').mockReturnValue(false);
  const rows=Array.from({length:250},(_,i)=>row(`history-${i}`));
  expect(executionTaskResourceV2.safeParse(rows[0])).toMatchObject({success:true});
  const reads:Array<{id:string;input:{query:{page:number}}}>=[];
  vi.stubGlobal('fetch',vi.fn(async(_url,init:RequestInit)=>{
   const request=JSON.parse(init.body as string);reads.push(request);
   const page=request.input.query?.page??1;
   return new Response(JSON.stringify({data:rows.slice((page-1)*100,page*100),meta:{requestId:'synthetic',page,pageSize:100,total:rows.length}}),{status:200});
  }));
  const api=defaultApi({accountId:'account'});
  const {result}=renderHook(()=>useProjectUpgradeQueue({api,accountId:'account',positioningVersionId:null,setNotice:vi.fn()}));
  await act(async()=>{await vi.advanceTimersByTimeAsync(30000);});
  expect(result.current.tasks).toHaveLength(250);expect(reads).toHaveLength(3);
  rows.push(row('external-task','queued'));
  await act(async()=>{await vi.advanceTimersByTimeAsync(30000);});
  expect(result.current.byItem.get('external-task')?.id).toBe('external-task');
  expect(reads.filter(r=>r.id===ENDPOINTS.listExecutionTasks.id)).toHaveLength(6);
  console.log(JSON.stringify({case:'radar-http-history',history:250,readsAt30s:3,externalDiscoveredByMs:60000,total:result.current.tasks.length}));
 });
 it('慢读取中多次唤醒只补一次；隐藏不扫，focus/visible恢复完整历史',async()=>{
  vi.useFakeTimers();let hidden=false;vi.spyOn(document,'hidden','get').mockImplementation(()=>hidden);
  let release!: (v:unknown)=>void;
  const listProjectUpgrades=vi.fn().mockImplementationOnce(()=>new Promise(resolve=>{release=resolve;})).mockResolvedValue({tasks:[],total:0});
  const api={listProjectUpgrades} as unknown as RadarApi;
  renderHook(()=>useProjectUpgradeQueue({api,accountId:'account',positioningVersionId:null,setNotice:vi.fn()}));
  await act(async()=>{window.dispatchEvent(new Event('focus'));window.dispatchEvent(new Event('focus'));document.dispatchEvent(new Event('visibilitychange'));});
  expect(listProjectUpgrades).toHaveBeenCalledTimes(1);
  await act(async()=>{release({tasks:[],total:0});await vi.advanceTimersByTimeAsync(0);});
  expect(listProjectUpgrades).toHaveBeenCalledTimes(2);
  await act(async()=>{hidden=true;document.dispatchEvent(new Event('visibilitychange'));await vi.advanceTimersByTimeAsync(120000);});
  expect(listProjectUpgrades).toHaveBeenCalledTimes(2);
  await act(async()=>{hidden=false;document.dispatchEvent(new Event('visibilitychange'));});
  expect(listProjectUpgrades).toHaveBeenCalledTimes(3);
 });
 it('真实公共HTTP adapter只观察活跃原任务，单项错误不饿死其他任务',async()=>{
  vi.useFakeTimers();vi.spyOn(document,'hidden','get').mockReturnValue(false);
  const rows=[...Array.from({length:250},(_,i)=>row(`finished-${i}`)),row('active-first','running'),row('active-second','running')];
  const reads:Array<{id:string;input:{query:{page:number;ownerId?:string}}}>=[];
  vi.stubGlobal('fetch',vi.fn(async(_url,init:RequestInit)=>{
   const request=JSON.parse(init.body as string);reads.push(request);
   if(request.input.query.ownerId){
    if(request.input.query.ownerId==='active-first')throw new Error('合成单项读取失败');
    return new Response(JSON.stringify({data:[row('active-second')],meta:{requestId:'synthetic',page:1,pageSize:100,total:1}}),{status:200});
   }
   const page=request.input.query.page;
   return new Response(JSON.stringify({data:rows.slice((page-1)*100,page*100),meta:{requestId:'synthetic',page,pageSize:100,total:rows.length}}),{status:200});
  }));
  const api=defaultApi({accountId:'account'});
  const {result}=renderHook(()=>useProjectUpgradeQueue({api,accountId:'account',positioningVersionId:null,setNotice:vi.fn()}));
  await act(async()=>{await vi.advanceTimersByTimeAsync(3000);});
  expect(reads.filter(r=>r.id===ENDPOINTS.listExecutionTasks.id&&!r.input.query.ownerId)).toHaveLength(3);
  expect(reads.filter(r=>r.input.query.ownerId).map(r=>r.input.query.ownerId)).toEqual(['active-first','active-second']);
  expect(reads.every(r=>r.id===ENDPOINTS.listExecutionTasks.id)).toBe(true);
  expect(result.current.tasks).toHaveLength(252);expect(result.current.total).toBe(252);
  expect(result.current.byItem.get('active-second')).toMatchObject({id:'active-second',status:'succeeded'});
 });
 it('enqueue合并在途后的立即发现，切scope或卸载拒绝旧响应',async()=>{
  vi.useFakeTimers();vi.spyOn(document,'hidden','get').mockReturnValue(false);
  let release!:(value:{tasks:ExecutionTaskResourceV2[];total:number})=>void;
  const added=row('enqueued','queued') as ExecutionTaskResourceV2;
  const api={listProjectUpgrades:vi.fn().mockImplementationOnce(()=>new Promise(resolve=>{release=resolve;})).mockResolvedValue({tasks:[added],total:1}),enqueueProjectUpgrades:vi.fn().mockResolvedValue({tasks:[added]})} as unknown as RadarApi;
  const {result,rerender,unmount}=renderHook(({accountId})=>useProjectUpgradeQueue({api,accountId,positioningVersionId:'positioning',setNotice:vi.fn()}),{initialProps:{accountId:'account'}});
  await act(async()=>{await result.current.enqueue('enqueued');});
  expect(api.listProjectUpgrades).toHaveBeenCalledTimes(1);
  await act(async()=>{release({tasks:[],total:0});});
  expect(api.listProjectUpgrades).toHaveBeenCalledTimes(2);
  expect(result.current.byItem.get('enqueued')?.id).toBe('enqueued');
  let oldReply!:(value:{tasks:ExecutionTaskResourceV2[];total:number})=>void;
  (api.listProjectUpgrades as ReturnType<typeof vi.fn>).mockImplementationOnce(()=>new Promise(resolve=>{oldReply=resolve;}));
  await act(async()=>{window.dispatchEvent(new Event('focus'));});
  (api.listProjectUpgrades as ReturnType<typeof vi.fn>).mockResolvedValue({tasks:[],total:0});
  rerender({accountId:'other-account'});
  await act(async()=>{oldReply({tasks:[added],total:99});});
  expect(result.current.tasks).toHaveLength(0);expect(result.current.total).toBe(0);
  unmount();
  const count=(api.listProjectUpgrades as ReturnType<typeof vi.fn>).mock.calls.length;
  await act(async()=>{await vi.advanceTimersByTimeAsync(120000);window.dispatchEvent(new Event('focus'));});
  expect(api.listProjectUpgrades).toHaveBeenCalledTimes(count);
 });
});
