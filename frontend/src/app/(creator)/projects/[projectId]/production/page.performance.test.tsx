import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({session:vi.fn(),getProject:vi.fn(),listProjects:vi.fn(),getOutput:vi.fn(),listOutputs:vi.fn(),getOutputProduction:vi.fn(),listSegments:vi.fn(),resolveScript:vi.fn(),loadScript:vi.fn()}));
vi.mock('next/navigation',()=>({redirect:(href:string)=>{throw Error('REDIRECT:'+href);},notFound:()=>{throw Error('NOT_FOUND');}}));
vi.mock('@/lib/session.server',()=>({resolveSession:m.session}));
vi.mock('@/lib/contract-client.server',()=>({createServerClient:()=>m}));
vi.mock('@/features/production/production-editor-entry',()=>({ProductionEditorEntry:()=>{throw Error('不能挂载隐藏制作台');}}));
vi.mock('@/features/script/script-editor-data',()=>({loadScriptEditorData:m.loadScript}));
import Page from './page';
beforeEach(()=>{vi.clearAllMocks();m.session.mockResolvedValue({ctx:{userId:'u',groupId:'g',accountId:null}});m.getProject.mockResolvedValue({id:'p',title:'项目'});m.listProjects.mockResolvedValue([]);m.getOutput.mockResolvedValue({id:'o',projectId:'p',contentType:'video'});m.listOutputs.mockResolvedValue([{id:'o',projectId:'p',contentType:'video'}]);});
function noCreationReads(){expect(m.getOutputProduction).not.toHaveBeenCalled();expect(m.listSegments).not.toHaveBeenCalled();expect(m.loadScript).not.toHaveBeenCalled();}
it('T1464 已归属视频旧制作链接回脚本，不读写制作状态',async()=>{
 await expect(Page({params:Promise.resolve({projectId:'p'}),searchParams:Promise.resolve({outputId:'o'})})).rejects.toThrow('REDIRECT:/projects/p');
 expect(m.getProject).toHaveBeenCalledOnce();expect(m.getOutput).toHaveBeenCalledWith({params:{outputId:'o'},query:undefined,body:undefined});expect(m.listProjects).not.toHaveBeenCalled();noCreationReads();
});
it('T1464 无指定视频的旧项目直接回脚本，不预约作品或读取制作状态',async()=>{
 await expect(Page({params:Promise.resolve({projectId:'p'})})).rejects.toThrow('REDIRECT:/projects/p');expect(m.getOutput).not.toHaveBeenCalled();expect(m.listOutputs).not.toHaveBeenCalled();noCreationReads();
});
it('T1464 跨项目或跨组视频不能借跳转绕过归属',async()=>{
 m.getOutput.mockResolvedValue({id:'o',projectId:'other',contentType:'video'});await expect(Page({params:Promise.resolve({projectId:'p'}),searchParams:Promise.resolve({outputId:'o'})})).rejects.toThrow('NOT_FOUND');noCreationReads();
 m.getProject.mockRejectedValue(Object.assign(Error('不可读'),{code:'OwnershipError'}));const rejected=await Page({params:Promise.resolve({projectId:'p'})});expect(rejected?.props['data-page']).toBe('project-cross-account-404');noCreationReads();
});
it('T1464 未登录或项目读取失败不暴露制作台',async()=>{
 m.session.mockResolvedValue(null);await expect(Page({params:Promise.resolve({projectId:'p'})})).rejects.toThrow('NOT_FOUND');expect(m.getProject).not.toHaveBeenCalled();noCreationReads();
});
it('T1464 旧slug解析后仍核验真实项目并回其脚本',async()=>{
 m.getProject.mockImplementation(async({params}:{params:{projectId:string}})=>{if(params.projectId==='old-title')throw Error('旧链接');return {id:'p',title:'Old Title'};});m.listProjects.mockResolvedValue([{id:'p',title:'Old Title'}]);
 await expect(Page({params:Promise.resolve({projectId:'old-title'})})).rejects.toThrow('REDIRECT:/projects/p');expect(m.getProject).toHaveBeenCalledTimes(2);noCreationReads();
});
