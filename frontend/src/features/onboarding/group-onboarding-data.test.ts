import {beforeEach,expect,it,vi} from 'vitest';
const scope=vi.hoisted(()=>({group:'g' as string|null,account:null as string|null}));
const api=vi.hoisted(()=>({getGroupOnboarding:vi.fn(),patchGroupOnboarding:vi.fn(),getAccountGroup:vi.fn(),getOnboarding:vi.fn(),patchOnboarding:vi.fn(),getAccount:vi.fn(),listProjects:vi.fn(),getPositioningCenter:vi.fn(),getIntelligenceWorkspace:vi.fn(),listIntelligenceItems:vi.fn()}));
vi.mock('@/lib/contract-client',()=>({client:api}));vi.mock('@/lib/http-transport',()=>({readCurrentGroupId:()=>scope.group,readCurrentAccountId:()=>scope.account}));
import {loadRadarSignals,loadState,saveGroupOnboarding} from './onboarding-data';
import {deriveGuidedSteps} from './onboarding-steps';
const record=()=>({groupId:'g',accountId:null,origin:null,hidden:false,collapsed:true,completedSteps:[] as string[],updatedAt:null});
beforeEach(()=>{vi.clearAllMocks();localStorage.clear();scope.group='g';scope.account=null;api.getGroupOnboarding.mockResolvedValue(record());api.patchGroupOnboarding.mockImplementation(async({body})=>({...record(),...body}));api.getAccountGroup.mockResolvedValue({id:'g',members:[]});api.listProjects.mockResolvedValue([]);api.getPositioningCenter.mockResolvedValue({profile:null});api.getIntelligenceWorkspace.mockResolvedValue({sources:[]});api.listIntelligenceItems.mockResolvedValue([]);});
it('空组也读取真实group偏好和真实成员数量，完全不读取伪账号',async()=>{const value=await loadState();expect(value).toMatchObject({groupId:'g',accountId:null,memberCount:0});expect(api.getGroupOnboarding).toHaveBeenCalledWith({params:{groupId:'g'},query:undefined,body:undefined});expect(api.getAccount).not.toHaveBeenCalled();expect(api.getOnboarding).not.toHaveBeenCalled();expect(api.getIntelligenceWorkspace.mock.calls[0][0].query).toEqual({});});
it.each(['manual','topic','radar','assistant','quick_create','imported'])('T1382 纯组 %s 只投影真实创建或导入信号',async(source)=>{
 api.listProjects.mockResolvedValue([{source}]);
 const state=await loadState();
 expect(state).toMatchObject({groupId:'g',accountId:null,hasCreatedProject:source!=='imported',hasImportedWorks:source==='imported'});
 expect(state.completedSteps?.includes('first-project')).toBe(source!=='imported');
 expect(api.getAccount).not.toHaveBeenCalled();expect(api.getOnboarding).not.toHaveBeenCalled();
});
it('T1382 纯组没有项目时创建与导入信号均为false，不伪完成',async()=>{
 const state=await loadState();expect(state).toMatchObject({hasCreatedProject:false,hasImportedWorks:false});
 expect(state.completedSteps).not.toContain('first-project');
});
it('组保存使用真实group ID，切组迟到资料不写新组，即使accountId一直null',async()=>{let finish!:(v:unknown)=>void;api.listProjects.mockReturnValue(new Promise(done=>{finish=done;}));const pending=loadState();await vi.waitFor(()=>expect(api.listProjects).toHaveBeenCalled());scope.group='h';finish([{source:'manual'}]);await expect(pending).rejects.toThrow('WORKSPACE_CHANGED');expect(api.patchGroupOnboarding).not.toHaveBeenCalled();await expect(saveGroupOnboarding('g',{hidden:true})).rejects.toThrow('WORKSPACE_CHANGED');});
it('已隐藏的group引导不查项目雷达，也不把平台成员当成已扫码身份',async()=>{api.getGroupOnboarding.mockResolvedValue({...record(),hidden:true});expect((await loadState()).preferences?.hidden).toBe(true);expect(api.listProjects).not.toHaveBeenCalled();expect(api.getIntelligenceWorkspace).not.toHaveBeenCalled();});
it('组真实成员只统计未转出有效成员，成员相同也不从旧account偏好复制',async()=>{api.getAccountGroup.mockResolvedValue({id:'g',members:[{id:'1',accountId:'real1',leftAt:null,status:'active'},{id:'2',accountId:'real2',leftAt:'2026-10-03',status:'active'},{id:'3',accountId:'real3',leftAt:null,status:'archived'}]});expect(await loadState()).toMatchObject({memberCount:1});expect(api.getAccount).not.toHaveBeenCalled();expect(api.patchOnboarding).not.toHaveBeenCalled();});
it('A到B再回A的工作区代数变化也使旧资料失效，不自动补写过期origin',async()=>{let resolve!:(v:unknown)=>void;api.listProjects.mockReturnValue(new Promise(done=>{resolve=done;}));const pending=loadState();await vi.waitFor(()=>expect(api.listProjects).toHaveBeenCalled());scope.group='h';window.dispatchEvent(new CustomEvent('creatoros:accounts-changed',{detail:{groupId:'h'}}));scope.group='g';window.dispatchEvent(new CustomEvent('creatoros:accounts-changed',{detail:{groupId:'g'}}));resolve([{source:'imported'}]);await expect(pending).rejects.toThrow('WORKSPACE_CHANGED');expect(api.patchGroupOnboarding).not.toHaveBeenCalled();});

const benchmarkSources=(count:number)=>Array.from({length:count},(_,index)=>({id:`source-${index}`,type:'creator_profile',monitorEnabled:true,status:'active'}));

it('T1403 24个对标源逐个读取，最多一条在途，全部成功为空才判无选题',async()=>{
 api.getIntelligenceWorkspace.mockResolvedValue({sources:benchmarkSources(24)});
 let active=0,maxActive=0;
 api.listIntelligenceItems.mockImplementation(async()=>{active++;maxActive=Math.max(maxActive,active);await Promise.resolve();active--;return [];});
 expect(await loadRadarSignals()).toEqual({hasBenchmarkMonitor:true,hasBenchmarkTopic:false});
 expect(api.listIntelligenceItems).toHaveBeenCalledTimes(24);expect(maxActive).toBe(1);
 expect(api.listIntelligenceItems.mock.calls.map(([input])=>input.query.sourceId)).toEqual(benchmarkSources(24).map(source=>source.id));
});

it('T1403 首个真实converted命中立即停止，不读取后续源或非对标源',async()=>{
 api.getIntelligenceWorkspace.mockResolvedValue({sources:[{id:'rss',type:'rss'},...benchmarkSources(24),{id:'share',type:'shared_item'}]});
 api.listIntelligenceItems.mockImplementation(async({query})=>query.sourceId==='source-1'?[{item:{id:'converted'}}]:[]);
 expect(await loadRadarSignals()).toEqual({hasBenchmarkMonitor:true,hasBenchmarkTopic:true});
 expect(api.listIntelligenceItems.mock.calls.map(([input])=>input.query)).toEqual(['source-0','source-1'].map(sourceId=>({sourceId,page:1,pageSize:1,sort:'newest',topicState:'converted'})));
});

it('T1403 只有非对标源不扫描items，也不把它们判为已监控对标',async()=>{
 api.getIntelligenceWorkspace.mockResolvedValue({sources:[{id:'rss',type:'rss',monitorEnabled:true,status:'active'}]});
 expect(await loadRadarSignals()).toEqual({hasBenchmarkMonitor:false,hasBenchmarkTopic:false});expect(api.listIntelligenceItems).not.toHaveBeenCalled();
});

it('T1403 已完成对标选题沿持久里程碑判done，跳过items但仍读取未完成监控信号',async()=>{
 api.getGroupOnboarding.mockResolvedValue({...record(),completedSteps:['benchmark-topic']});
 api.getIntelligenceWorkspace.mockResolvedValue({sources:benchmarkSources(24).map(source=>({...source,monitorEnabled:false}))});
 const state=await loadState();
 expect(api.getIntelligenceWorkspace).toHaveBeenCalledTimes(1);expect(api.listIntelligenceItems).not.toHaveBeenCalled();
 expect(state.hasBenchmarkMonitor).toBe(false);expect(state.hasBenchmarkTopic).toBeUndefined();
 expect(deriveGuidedSteps(state).find(step=>step.key==='benchmark-topic')?.done).toBe(true);
 expect(api.patchGroupOnboarding).not.toHaveBeenCalled();
});

const unreadSourceResults=[
 {name:'请求失败',read:()=>Promise.reject(Error('offline'))},
 {name:'返回undefined',read:async()=>undefined},
 {name:'返回null',read:async()=>null},
 {name:'返回对象',read:async()=>({})},
];

it.each(unreadSourceResults)('T1403 某源$name且其余为空时选题未知，不能落库为完成',async({read})=>{
 api.getIntelligenceWorkspace.mockResolvedValue({sources:benchmarkSources(2).map(source=>({...source,monitorEnabled:false}))});
 api.listIntelligenceItems.mockImplementationOnce(read).mockResolvedValueOnce([]);
 const state=await loadState();expect(state.hasBenchmarkTopic).toBeUndefined();expect(state.hasBenchmarkMonitor).toBe(false);
 expect(api.listIntelligenceItems).toHaveBeenCalledTimes(2);expect(api.patchGroupOnboarding).not.toHaveBeenCalled();
});

it.each(unreadSourceResults)('T1403 前一个源$name后另一个真实命中仍可证明存在选题',async({read})=>{
 api.getIntelligenceWorkspace.mockResolvedValue({sources:benchmarkSources(3)});
 api.listIntelligenceItems.mockImplementationOnce(read).mockResolvedValueOnce([{item:{id:'converted'}}]);
 expect((await loadRadarSignals()).hasBenchmarkTopic).toBe(true);expect(api.listIntelligenceItems).toHaveBeenCalledTimes(2);
});

it.each(['switch','aba'] as const)('T1403 items读取中%s后拒绝旧结果，不再请求下一源或写进度',async(change)=>{
 api.getIntelligenceWorkspace.mockResolvedValue({sources:benchmarkSources(2)});
 let finish!:(rows:unknown[])=>void;
 api.listIntelligenceItems.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
 const pending=loadState();const outcome=pending.then(()=>null,error=>error);
 await vi.waitFor(()=>expect(api.listIntelligenceItems).toHaveBeenCalled());
 scope.group='h';window.dispatchEvent(new CustomEvent('creatoros:accounts-changed',{detail:{groupId:'h'}}));
 if(change==='aba'){scope.group='g';window.dispatchEvent(new CustomEvent('creatoros:accounts-changed',{detail:{groupId:'g'}}));}
 finish([]);
 expect(await outcome).toMatchObject({message:expect.stringContaining('WORKSPACE_CHANGED')});
 expect(api.listIntelligenceItems).toHaveBeenCalledTimes(1);expect(api.patchGroupOnboarding).not.toHaveBeenCalled();
});
