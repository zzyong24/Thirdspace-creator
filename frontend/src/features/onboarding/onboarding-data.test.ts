import {beforeEach,describe,expect,it,vi} from "vitest";
const current=vi.hoisted(()=>vi.fn<()=>string|null>(()=>"a"));
const publicReads=vi.hoisted(()=>vi.fn());
const client=vi.hoisted(()=>({getOnboarding:vi.fn(),patchOnboarding:vi.fn(),getAccount:vi.fn(),listProjects:vi.fn(),getPositioningCenter:vi.fn(),getIntelligenceWorkspace:vi.fn(),listIntelligenceItems:vi.fn(),statusDouyin:vi.fn()}));
vi.mock("@/lib/contract-client",()=>({client}));
vi.mock("@/lib/http-transport",()=>({readCurrentAccountId:current,readCurrentGroupId:()=>null,createHttpTransport:()=>({request:publicReads})}));
import {loadState,loadProjectSignals,loadRadarSignals,saveOnboarding} from './onboarding-data';
import {deriveGuidedSteps} from './onboarding-steps';
const record=()=>({accountId:"a",origin:null,hidden:false,collapsed:true,completedSteps:[] as string[],updatedAt:null});
beforeEach(()=>{vi.clearAllMocks();window.localStorage.clear();current.mockReturnValue('a');client.getOnboarding.mockResolvedValue(record());client.patchOnboarding.mockImplementation(async({body})=>({...record(),...body}));client.getAccount.mockResolvedValue({id:'a'});client.listProjects.mockResolvedValue([]);client.getPositioningCenter.mockResolvedValue({profile:null});client.getIntelligenceWorkspace.mockResolvedValue({sources:[]});client.listIntelligenceItems.mockResolvedValue([]);});
it.each(['manual','topic','radar','assistant','quick_create'])('T-1382 %s 是真实创建信号，与导入作品信号分开',async(source)=>{
 client.listProjects.mockResolvedValue([{source}]);
 await expect(loadProjectSignals()).resolves.toEqual({hasCreatedProject:true,hasImportedWorks:false});
},120000);
describe('T-964 引导真实数据与持久进度',()=>{
 it('绑定来自账号记录，登录探测不参与，端口存储清空不撤销后端里程碑',async()=>{
  client.getOnboarding.mockResolvedValue({...record(),completedSteps:['import-account','first-project'],updatedAt:'2026-09-13'});
  const s=await loadState();expect(s.douyinLoggedIn).toBe(true);expect(s.completedSteps).toContain('first-project');expect(client.statusDouyin).not.toHaveBeenCalled();
 });
 it('实际全量返回的1005件作品不重复请求且能发现尾部手动项目',async()=>{
  client.listProjects.mockResolvedValue([...Array.from({length:1004},()=>({source:'imported'})),{source:'manual'}]);
  await expect(loadProjectSignals()).resolves.toEqual({hasImportedWorks:true,hasCreatedProject:true});expect(client.listProjects).toHaveBeenCalledTimes(1);
 });
 it('1005件全历史作品也只读取一次，不陷入翻页循环',async()=>{
  client.listProjects.mockResolvedValue(Array.from({length:1005},()=>({source:'imported'})));
  await expect(loadProjectSignals()).resolves.toEqual({hasImportedWorks:true,hasCreatedProject:false});expect(client.listProjects).toHaveBeenCalledTimes(1);
 });
 it('永久关闭后不再启动信号扫描',async()=>{
  client.getOnboarding.mockResolvedValue({...record(),hidden:true});expect((await loadState()).preferences?.hidden).toBe(true);expect(client.listProjects).not.toHaveBeenCalled();
 });
 it('切换账号的旧读取不得写入新账号',async()=>{
  let resolve!:(v:unknown)=>void;client.listProjects.mockReturnValue(new Promise(r=>{resolve=r;}));const pending=loadState();await vi.waitFor(()=>expect(client.listProjects).toHaveBeenCalled());current.mockReturnValue('b');resolve([{source:'manual'}]);await expect(pending).rejects.toThrow('ACCOUNT_CHANGED');expect(client.patchOnboarding).not.toHaveBeenCalled();await expect(saveOnboarding('a',{hidden:true})).rejects.toThrow('ACCOUNT_CHANGED');
 });
 it('数据读取失败不撤销已完成步骤',async()=>{
  client.getOnboarding.mockResolvedValue({...record(),completedSteps:['first-project'],updatedAt:'2026-09-13'});client.listProjects.mockRejectedValue(Error('offline'));expect((await loadState()).completedSteps).toContain('first-project');
 });
 it('保存失败可识别且不假称落库',async()=>{
  client.patchOnboarding.mockRejectedValue(Error('offline'));expect((await loadState()).persistenceError).toContain('暂未保存');
 });
 it('旧全局偏好仅迁入第一个当前账号',async()=>{
  window.localStorage.setItem('creatoros:onboarding:hidden','1');expect((await loadState()).preferences?.hidden).toBe(true);expect(window.localStorage.getItem('creatoros:onboarding:legacy-migrated-account')).toBe('a');current.mockReturnValue('b');client.getOnboarding.mockResolvedValue({...record(),accountId:'b'});client.getAccount.mockResolvedValue({id:'b'});client.patchOnboarding.mockImplementation(async({body})=>({...record(),accountId:'b',...body}));expect((await loadState()).preferences?.hidden).toBe(false);
 });
});

it('T1345零身份必须实际确认完整零组零旧账号后才投影首组引导',async()=>{
 current.mockReturnValue(null);publicReads.mockImplementation(async(endpoint,input)=>({data:[],meta:{requestId:'first-user',page:1,pageSize:1,total:0}}));
 expect(await loadState()).toMatchObject({needsFirstGroup:true});expect(publicReads).toHaveBeenCalledTimes(2);
 expect(publicReads.mock.calls.find(([ep])=>ep.id==='accountGroups.list')?.[1].query).toMatchObject({includeArchived:true});
});
it('T1345已有组或旧账号的无身份恢复不误当新用户，读取错误不假装零',async()=>{
 current.mockReturnValue(null);publicReads.mockImplementation(async(endpoint)=>{const rows=endpoint.id==='accountGroups.list'?[{id:'existing',userId:'u',name:'已有组',status:'archived',version:1,members:[],createdAt:'2026-10-01T00:00:00Z',updatedAt:'2026-10-01T00:00:00Z'}]:[];return {data:rows,meta:{requestId:'existing-user',page:1,pageSize:1,total:rows.length}};});
 expect(await loadState()).toMatchObject({needsFirstGroup:false});publicReads.mockRejectedValueOnce(Error('groups offline'));await expect(loadState()).rejects.toThrow('groups offline');
});

it('T1403 旧账号读取仍带真实accountId，失败不伪称无对标选题',async()=>{
 client.getIntelligenceWorkspace.mockResolvedValue({sources:[{id:'benchmark',type:'creator_profile',monitorEnabled:true,status:'active'}]});
 client.listIntelligenceItems.mockRejectedValue(Error('offline'));
 expect(await loadRadarSignals()).toEqual({hasBenchmarkMonitor:true,hasBenchmarkTopic:undefined});
 expect(client.listIntelligenceItems).toHaveBeenCalledWith({params:undefined,query:{accountId:'a',sourceId:'benchmark',page:1,pageSize:1,sort:'newest',topicState:'converted'},body:undefined});
});

it('T1403 旧账号的已完成对标选题不重扫，当前信号保持未知且里程碑保留',async()=>{
 client.getOnboarding.mockResolvedValue({...record(),completedSteps:['import-account','benchmark-topic']});
 client.getIntelligenceWorkspace.mockResolvedValue({sources:[{id:'benchmark',type:'creator_profile',monitorEnabled:false,status:'active'}]});
 const state=await loadState();expect(client.listIntelligenceItems).not.toHaveBeenCalled();expect(state.hasBenchmarkTopic).toBeUndefined();
 expect(deriveGuidedSteps(state).find(step=>step.key==='benchmark-topic')?.done).toBe(true);expect(client.patchOnboarding).not.toHaveBeenCalled();
});
