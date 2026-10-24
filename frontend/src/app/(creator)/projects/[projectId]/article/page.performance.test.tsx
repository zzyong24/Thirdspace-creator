import * as React from 'react';
import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({getProject:vi.fn(),listOutputs:vi.fn(),getArticle:vi.fn(),getPositioningCenter:vi.fn()}));
vi.mock('@/lib/session.server',()=>({resolveSession:async()=>({ctx:{userId:'u',groupId:'g',accountId:null}})}));
vi.mock('@/lib/contract-client.server',()=>({createServerClient:()=>m}));
vi.mock('@/features/article/article-workbench',()=>({ArticleWorkbench:()=>null}));
vi.mock('@/features/projects/project-output-home',()=>({ProjectOutputHome:()=>null}));
vi.mock('next/navigation',()=>({notFound:()=>{throw Error('NOT_FOUND');},redirect:(url:string)=>{throw Error(`REDIRECT:${url}`);}}));
import Page from './page';
type WorkbenchProps=React.ComponentProps<typeof import('@/features/article/article-workbench').ArticleWorkbench>;
type HomeProps=React.ComponentProps<typeof import('@/features/projects/project-output-home').ProjectOutputHome>;
beforeEach(()=>{vi.clearAllMocks();m.getProject.mockResolvedValue({id:'p',title:'项目'});m.listOutputs.mockResolvedValue([{id:'o',title:'文章',contentType:'article'}]);m.getArticle.mockResolvedValue({projectId:'p',outputId:'o'});m.getPositioningCenter.mockResolvedValue({currentStatement:null});});
it('正文和定位并行开始；未完成定位不阻塞路由返回，并复用正文首读',async()=>{
 m.getPositioningCenter.mockReturnValue(new Promise(()=>{}));
 const pending=Page({params:Promise.resolve({projectId:'p'}),searchParams:Promise.resolve({outputId:'o'})});
 await vi.waitFor(()=>expect(m.getPositioningCenter).toHaveBeenCalledOnce());
 expect(m.getArticle).toHaveBeenCalledOnce();
 const element=await pending as React.ReactElement<WorkbenchProps>;
 expect(element.props.initialArticleRead).toMatchObject({scopeKey:'group:g',projectId:'p',outputId:'o'});
 expect(await element.props.initialArticleRead!.result).toMatchObject({article:{projectId:'p',outputId:'o'}});
 expect(element.props.brandProfileRead!.scopeKey).toBe('group:g');
});
it('未验证输出不读取正文或定位，跨项目参数不能进入工作台',async()=>{
 await expect(Page({params:Promise.resolve({projectId:'p'}),searchParams:Promise.resolve({outputId:'other'})})).rejects.toThrow('NOT_FOUND');
 expect(m.getArticle).not.toHaveBeenCalled();expect(m.getPositioningCenter).not.toHaveBeenCalled();
});
it('没有显式输出时保留多作品选择与唯一作品深链',async()=>{
 await expect(Page({params:Promise.resolve({projectId:'p'})})).rejects.toThrow('REDIRECT:/projects/p/article?outputId=o');
 m.listOutputs.mockResolvedValue([{id:'o',title:'文章',contentType:'article'},{id:'other',title:'另一篇',contentType:'article'}]);
 const element=await Page({params:Promise.resolve({projectId:'p'})}) as React.ReactElement<HomeProps>;
 expect(element.props.initialOutputs).toHaveLength(2);expect(m.getArticle).not.toHaveBeenCalled();
});
