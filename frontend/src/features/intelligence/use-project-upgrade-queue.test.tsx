import {StrictMode} from 'react';
import {act,renderHook,waitFor,cleanup} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import type {ProjectPreparationResource} from '@creatoros/contract';
import type {RadarApi} from './intelligence-workbench-types';
import {useProjectUpgradeQueue} from './use-project-upgrade-queue';
vi.setConfig({testTimeout:120000,hookTimeout:120000});
afterEach(()=>{cleanup();vi.useRealTimers();vi.restoreAllMocks();});
const prep=(projectId:string,active=false):ProjectPreparationResource=>({projectId,origin:'radar',registration:'registered',preparationTaskId:`parent-${projectId}`,revision:1,sourceReferences:[],candidates:[],availableActions:[],lastError:null,steps:[{name:'transcript',required:true,reasonCode:'REAL_CHECKPOINT',status:active?'running':'done',revision:0,childTaskId:'original-child',businessTaskId:null,inputDigest:'original',outputReferences:[],startedAt:null,completedAt:null,lastError:null,availableActions:[]}]});
const props=(api:RadarApi,items:Array<{id:string;projectId?:string}>=[])=>({api,groupId:'group-a',items,positioningVersionId:null,setNotice:vi.fn()});
it('T1382 挂载只读既有250个项目映射，不扫描或创建旧升级队列',async()=>{
 const ensureProject=vi.fn(),getProjectPreparation=vi.fn(async(id:string)=>prep(id)),items=Array.from({length:250},(_,i)=>({id:`item-${i}`,projectId:`project-${i}`}));
 const api={ensureProject,getProjectPreparation} as unknown as RadarApi;
 const {result}=renderHook(()=>useProjectUpgradeQueue(props(api,items)));
 await waitFor(()=>expect(result.current.byItem.size).toBe(250));expect(result.current.byItem.get('item-249')?.projectId).toBe('project-249');expect(ensureProject).not.toHaveBeenCalled();
});
it('T1382 无定位也可ensure，A未返回仍可提交B，双击A只提交一次',async()=>{
 const ensureProject=vi.fn(()=>new Promise(()=>{})),api={ensureProject} as unknown as RadarApi;
 const {result}=renderHook(()=>useProjectUpgradeQueue(props(api)));
 act(()=>{void result.current.enqueue('a');void result.current.enqueue('a');void result.current.enqueue('b');});
 expect(ensureProject).toHaveBeenCalledTimes(2);expect(ensureProject).toHaveBeenNthCalledWith(1,{source:'radar',itemId:'a',idempotencyKey:expect.any(String)});
});
it('T1382 ensure响应未知保原动作键，用户再次点击读取同一项目且不自动重发',async()=>{
 const ensureProject=vi.fn().mockRejectedValueOnce(Error('响应丢失')).mockResolvedValue({project:{id:'p'},preparationTaskId:null}),api={ensureProject} as unknown as RadarApi;
 const {result}=renderHook(()=>useProjectUpgradeQueue(props(api)));
 await act(()=>result.current.enqueue('a'));expect(ensureProject).toHaveBeenCalledTimes(1);await act(()=>result.current.enqueue('a'));
 expect(ensureProject.mock.calls[1]).toEqual(ensureProject.mock.calls[0]);expect(result.current.byItem.get('a')?.projectId).toBe('p');await act(()=>result.current.enqueue('a'));expect(ensureProject).toHaveBeenCalledTimes(2);
});
it('T1382 原未知结果只给既有项目入口，雷达不重试/恢复或提交转写',async()=>{
 const unknown={...prep('p'),steps:[{...prep('p').steps[0]!,status:'unknown_result' as const,availableActions:['check_result' as const]}]},ensureProject=vi.fn(),commandTask=vi.fn(),enqueueTranscript=vi.fn();
 const api={ensureProject,commandTask,enqueueTranscript,getProjectPreparation:vi.fn().mockResolvedValue(unknown)} as unknown as RadarApi;
 const {result}=renderHook(()=>useProjectUpgradeQueue(props(api,[{id:'a',projectId:'p'}])));
 await waitFor(()=>expect(result.current.byItem.get('a')?.preparation?.steps[0]?.status).toBe('unknown_result'));await act(()=>result.current.enqueue('a'));
 expect(ensureProject).not.toHaveBeenCalled();expect(commandTask).not.toHaveBeenCalled();expect(enqueueTranscript).not.toHaveBeenCalled();
});
it('T1382 慢GET唤醒合并一次，hidden暂停，visible恢复只读',async()=>{
 vi.useFakeTimers();let hidden=false;vi.spyOn(document,'hidden','get').mockImplementation(()=>hidden);
 let release!:(value:ProjectPreparationResource)=>void;const getProjectPreparation=vi.fn().mockImplementationOnce(()=>new Promise(resolve=>{release=resolve;})).mockResolvedValue(prep('p'));
 const api={getProjectPreparation} as unknown as RadarApi;renderHook(()=>useProjectUpgradeQueue(props(api,[{id:'a',projectId:'p'}])));
 await act(async()=>{window.dispatchEvent(new Event('focus'));window.dispatchEvent(new Event('focus'));});expect(getProjectPreparation).toHaveBeenCalledTimes(1);
 await act(async()=>{release(prep('p'));});expect(getProjectPreparation).toHaveBeenCalledTimes(2);
 await act(async()=>{hidden=true;document.dispatchEvent(new Event('visibilitychange'));await vi.advanceTimersByTimeAsync(120000);});expect(getProjectPreparation).toHaveBeenCalledTimes(2);
 await act(async()=>{hidden=false;document.dispatchEvent(new Event('visibilitychange'));});expect(getProjectPreparation).toHaveBeenCalledTimes(3);
});
it('T1382 只轮询活跃准备，单项错误不饿死下一项目，完成后停轮询',async()=>{
 vi.useFakeTimers();vi.spyOn(document,'hidden','get').mockReturnValue(false);
 let initial=true;const getProjectPreparation=vi.fn(async(id:string)=>{if(initial)return prep(id,id!=='done');if(id==='bad')throw Error('单项读取失败');return prep(id);});
 const api={getProjectPreparation} as unknown as RadarApi,{result}=renderHook(()=>useProjectUpgradeQueue(props(api,[{id:'x',projectId:'done'},{id:'a',projectId:'bad'},{id:'b',projectId:'good'}])));
 await act(async()=>{await vi.advanceTimersByTimeAsync(0);});initial=false;getProjectPreparation.mockClear();await act(async()=>{await vi.advanceTimersByTimeAsync(3000);});
 expect(getProjectPreparation.mock.calls.map(([id])=>id)).toEqual(['bad','good']);expect(result.current.byItem.get('b')?.preparation?.steps[0]?.status).toBe('done');
});
it('T1382 A→B→A与卸载丢弃旧ensure和GET回执，不导航或污染提示',async()=>{
 let release!:(v:unknown)=>void;const ensureProject=vi.fn(()=>new Promise(resolve=>{release=resolve;})),getProjectPreparation=vi.fn().mockResolvedValue(prep('new')),notice=vi.fn();
 const api={ensureProject,getProjectPreparation} as unknown as RadarApi;
 const {result,rerender,unmount}=renderHook(({groupId})=>useProjectUpgradeQueue({...props(api),groupId,setNotice:notice}),{initialProps:{groupId:'group-a'}});
 act(()=>{void result.current.enqueue('old');});rerender({groupId:'group-b'});rerender({groupId:'group-a'});
 await act(async()=>{release({project:{id:'old-project'},preparationTaskId:null});});expect(result.current.byItem.size).toBe(0);expect(notice).not.toHaveBeenCalled();
 act(()=>{void result.current.enqueue('late');});unmount();await act(async()=>{release({project:{id:'late-project'},preparationTaskId:null});});expect(notice).not.toHaveBeenCalled();
});

it('T1382 StrictMode重挂观察仍读取已有项目，旧响应不占新周期',async()=>{
 let firstResolve!:(value:ProjectPreparationResource)=>void;const getProjectPreparation=vi.fn().mockImplementationOnce(()=>new Promise<ProjectPreparationResource>(resolve=>{firstResolve=resolve;})).mockResolvedValue(prep('p'));
 const api={getProjectPreparation} as unknown as RadarApi;
 const {result}=renderHook(()=>useProjectUpgradeQueue(props(api,[{id:'i',projectId:'p'}])),{wrapper:StrictMode});
 try{expect(getProjectPreparation).toHaveBeenCalledTimes(1);}finally{await act(async()=>{firstResolve(prep('p',true));});}
 await waitFor(()=>expect(result.current.byItem.get('i')?.preparation?.projectId).toBe('p'));expect(result.current.byItem.get('i')?.preparing).toBe(false);expect(getProjectPreparation).toHaveBeenCalledTimes(2);
});
