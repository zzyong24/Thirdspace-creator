import * as React from 'react';
import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({getProject:vi.fn(),listProjects:vi.fn(),listOutputs:vi.fn(),getOutputProduction:vi.fn(),listSegments:vi.fn(),resolveScript:vi.fn(),loadScript:vi.fn()}));
vi.mock('@/lib/session.server',()=>({resolveSession:async()=>({ctx:{userId:'u',groupId:'g',accountId:null}})}));
vi.mock('@/lib/contract-client.server',()=>({createServerClient:()=>m}));
vi.mock('@/features/production/production-editor-entry',()=>({ProductionEditorEntry:()=>null}));
vi.mock('@/features/production/production-output-data',async original=>({...await original<typeof import('@/features/production/production-output-data')>(),resolveProductionScriptArtifactId:m.resolveScript}));
vi.mock('@/features/script/script-editor-data',()=>({loadScriptEditorData:m.loadScript}));
import Page from './page';
type EntryProps=React.ComponentProps<typeof import('@/features/production/production-editor-entry').ProductionEditorEntry>;
beforeEach(()=>{vi.clearAllMocks();m.getProject.mockResolvedValue({id:'p',title:'项目',briefDetail:{orientation:'portrait'}});m.listProjects.mockResolvedValue([]);m.listOutputs.mockResolvedValue([{id:'o',title:'视频',contentType:'video'}]);m.resolveScript.mockResolvedValue('s');m.loadScript.mockResolvedValue({sections:[{heading:'',body:'口播稿'}],versions:[{}]});m.getOutputProduction.mockResolvedValue({id:'production',status:'drafting'});m.listSegments.mockResolvedValue([{}]);});
it('明确项目ID只验证一次项目归属，不读取项目列表',async()=>{
 const element=await Page({params:Promise.resolve({projectId:'p'}),searchParams:Promise.resolve({outputId:'o'})}) as React.ReactElement<EntryProps>;
 expect(m.getProject).toHaveBeenCalledOnce();expect(m.listProjects).not.toHaveBeenCalled();expect(element.props).toMatchObject({projectId:'p',projectTitle:'项目',scriptText:'口播稿',orientation:'portrait',initialStatus:'drafting',initialSegmentCount:1});
});
it('脚本读取被阻塞时，制作状态和分场读取已经开始',async()=>{
 let finish!:(value:string|null)=>void;m.resolveScript.mockReturnValue(new Promise(resolve=>{finish=resolve;}));
 const pending=Page({params:Promise.resolve({projectId:'p'}),searchParams:Promise.resolve({outputId:'o'})});
 await vi.waitFor(()=>expect(m.resolveScript).toHaveBeenCalledOnce());await vi.waitFor(()=>expect(m.getOutputProduction).toHaveBeenCalledOnce(),{timeout:300});
 expect(m.listSegments).toHaveBeenCalledOnce();finish('s');await pending;
});
it('旧slug分页回退后仍验证匹配项目归属，复用项目详情',async()=>{
 m.getProject.mockImplementation(async({params}:{params:{projectId:string}})=>{if(params.projectId==='old-title')throw Error('旧链接');return {id:'p',title:'Old Title'};});
 m.listProjects.mockImplementation(async({query}:{query:{page:number}})=>query.page===1?Array.from({length:100},(_,i)=>({id:`x-${i}`,title:`X ${i}`})):[{id:'p',title:'Old Title'}]);
 const element=await Page({params:Promise.resolve({projectId:'old-title'})}) as React.ReactElement<EntryProps>;
 expect(m.listProjects).toHaveBeenCalledTimes(2);expect(m.getProject).toHaveBeenCalledTimes(2);expect(element.props.projectId).toBe('p');
});
it('跨组项目拒绝进入工作台，未知输出不读取正文或制作状态',async()=>{
 m.getProject.mockRejectedValue(Object.assign(Error('不存在'),{code:'OwnershipError'}));
 const hidden=await Page({params:Promise.resolve({projectId:'p'})}) as React.ReactElement<{'data-page':string}>;
 expect(hidden.props['data-page']).toBe('project-cross-account-404');expect(m.listOutputs).not.toHaveBeenCalled();
 m.getProject.mockResolvedValue({id:'p',title:'项目'});
 await Page({params:Promise.resolve({projectId:'p'}),searchParams:Promise.resolve({outputId:'wrong'})});expect(m.resolveScript).not.toHaveBeenCalled();expect(m.getOutputProduction).not.toHaveBeenCalled();
});
it('多个视频保留选择页；无作品继续空工作台，读取失败保持局部降级',async()=>{
 m.listOutputs.mockResolvedValue([{id:'o',title:'视频',contentType:'video'},{id:'other',title:'另一条',contentType:'video'}]);
 const selection=await Page({params:Promise.resolve({projectId:'p'})}) as React.ReactElement<{'data-page':string}>;
 expect(selection.props['data-page']).toBe('production-output-selection');expect(m.resolveScript).not.toHaveBeenCalled();
 m.listOutputs.mockResolvedValue([]);const empty=await Page({params:Promise.resolve({projectId:'p'})}) as React.ReactElement<EntryProps>;expect(empty.props.outputId).toBeNull();expect(m.getOutputProduction).not.toHaveBeenCalled();
 m.listOutputs.mockResolvedValue([{id:'o',title:'视频',contentType:'video'}]);m.getOutputProduction.mockRejectedValue(Error('暂不可读'));
 const degraded=await Page({params:Promise.resolve({projectId:'p'})}) as React.ReactElement<EntryProps>;expect(degraded.props).toMatchObject({scriptText:'口播稿',initialStatus:null,initialSegmentCount:0});
});
