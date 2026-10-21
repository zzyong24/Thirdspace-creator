import {beforeEach,expect,it,vi} from 'vitest';
const scope=vi.hoisted(()=>({group:'g' as string|null,account:null as string|null}));
const api=vi.hoisted(()=>({getGroupOnboarding:vi.fn(),patchGroupOnboarding:vi.fn(),getAccountGroup:vi.fn(),getOnboarding:vi.fn(),patchOnboarding:vi.fn(),getAccount:vi.fn(),listProjects:vi.fn(),getPositioningCenter:vi.fn(),getIntelligenceWorkspace:vi.fn(),listIntelligenceItems:vi.fn()}));
vi.mock('@/lib/contract-client',()=>({client:api}));vi.mock('@/lib/http-transport',()=>({readCurrentGroupId:()=>scope.group,readCurrentAccountId:()=>scope.account}));
import {loadState,saveGroupOnboarding} from './onboarding-data';
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
