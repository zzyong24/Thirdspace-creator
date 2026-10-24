import * as React from 'react';
import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import type {DraftEditorPort} from '@/features/draft-workbench/draft-chat-request';
import type {ArticleInitialRead,ArticleBrandProfileRead} from './article-workbench';
import type {ArticleDocument} from '@creatoros/contract';
type NoteProps=React.ComponentProps<typeof import('@/features/reference-editors/noterelay/noterelay-editor').NoteRelayEditor>;
type InitialResult=Awaited<ArticleInitialRead['result']>;
const m=vi.hoisted(()=>({getArticle:vi.fn(),getArticleVersion:vi.fn(),setWritingContext:vi.fn(),readWritingContext:vi.fn(),notifyEditorChanged:vi.fn(),notifyEditorReady:vi.fn(),registerEditor:vi.fn(),port:null as DraftEditorPort|null,note:null as NoteProps|null,scope:{groupId:'g',accountId:null as string|null}}));
vi.mock('@/lib/contract-client',()=>({client:m}));
vi.mock('@/lib/creation-workspace-scope',()=>({useCreationScope:()=>m.scope,useCreationClient:()=>m,creationScopeKey:(s:{groupId:string|null;accountId:string|null})=>s.groupId?`group:${s.groupId}`:`account:${s.accountId}`}));
vi.mock('@/features/draft-workbench/draft-chat-request',async original=>{const actual=await original<typeof import('@/features/draft-workbench/draft-chat-request')>();return {...actual,useDraftChatRequest:()=>m};});
vi.mock('@/features/reference-editors/noterelay/noterelay-editor',()=>({NoteRelayEditor:(p:NoteProps)=>{m.note=p;return <p>{p.value.title}</p>;}}));
vi.mock('./doocs-article-editor',()=>({DoocsArticleEditor:()=>null}));
vi.mock('./article-result-actions',()=>({ArticleResultActions:()=>null}));
import {ArticleWorkbench} from './article-workbench';
const article=()=>({projectId:'p',outputId:'o',artifactId:'a',currentVersionId:'v',current:{schemaVersion:1 as const,title:'首读文章',summary:'',sections:[],factItems:[],visualBriefs:[],imageUses:[]},versions:[]});
const props={projectId:'p',projectTitle:'项目',initialOutputs:[{id:'o',title:'文章'}],initialOutputId:'o'};
const initialRead=(result:Promise<InitialResult>,scopeKey='group:g')=>({scopeKey,projectId:'p',outputId:'o',result});
beforeEach(()=>{vi.clearAllMocks();m.scope={groupId:'g',accountId:null};m.readWritingContext.mockReturnValue(undefined);m.getArticle.mockResolvedValue(article());m.getArticleVersion.mockResolvedValue({versionId:'v',document:article().current});m.registerEditor.mockImplementation(p=>{m.port=p;return ()=>{};});});
afterEach(cleanup);
it('服务端首读直接显示正文，定位悬挂期间不重复getArticle，不提前写入中性风格',async()=>{
 const view=render(<ArticleWorkbench {...props} initialArticleRead={initialRead(Promise.resolve({article:article()}))} brandProfileRead={{scopeKey:'group:g',result:new Promise(()=>{})}}/>);
 await screen.findByText('首读文章');expect(m.getArticle).not.toHaveBeenCalled();expect(m.setWritingContext).not.toHaveBeenCalled();
 await expect(m.port!.prepareForTurn()).rejects.toThrow(/定位/);
 expect(screen.getByRole('button',{name:'重新组织内容'})).toBeDisabled();view.unmount();
});
it('定位迟到更新写作上下文但不覆盖期间输入，也不重读正文',async()=>{
 let resolveBrand!:(x:Awaited<ArticleBrandProfileRead['result']>)=>void;
 render(<ArticleWorkbench {...props} initialArticleRead={initialRead(Promise.resolve({article:article()}))} brandProfileRead={{scopeKey:'group:g',result:new Promise(resolve=>{resolveBrand=resolve;})}}/>);
 await screen.findByText('首读文章');const layout:Parameters<NoteProps['onLayoutChange']>[0]={schemaVersion:1,editor:'noterelay',editorVersion:'0.1.8',themeId:'default',authorName:'新输入',authorBio:'',variables:{},fontSize:16,splitHeading:2,templateId:'default',imageWidths:{},imageRadii:{}};
 act(()=>m.note!.onLayoutChange(layout));await act(async()=>resolveBrand({id:'brand',versionNumber:2,oneLiner:'身份'}));
 await waitFor(()=>expect(m.setWritingContext).toHaveBeenLastCalledWith('group:g','p',expect.objectContaining({brandProfileVersionId:'brand'})));
 expect(m.note!.value.nativeLayout).toEqual(layout);expect(m.getArticle).not.toHaveBeenCalled();
});
it('同一会话收到刷新首读不能覆盖尚未保存输入',async()=>{
 const view=render(<ArticleWorkbench {...props} initialArticleRead={initialRead(Promise.resolve({article:article()}))}/>);
 await screen.findByText('首读文章');const layout:Parameters<NoteProps['onLayoutChange']>[0]={schemaVersion:1,editor:'noterelay',editorVersion:'0.1.8',themeId:'default',authorName:'保留本地输入',authorBio:'',variables:{},fontSize:16,splitHeading:2,templateId:'default',imageWidths:{},imageRadii:{}};act(()=>m.note!.onLayoutChange(layout));
 view.rerender(<ArticleWorkbench {...props} initialArticleRead={initialRead(Promise.resolve({article:{...article(),current:{...article().current,title:'刷新旧稿'}}}))}/>);
 await act(async()=>{});expect(m.note!.value.nativeLayout).toEqual(layout);expect(screen.queryByText('刷新旧稿')).toBeNull();expect(m.getArticle).not.toHaveBeenCalled();
});
it.each([null,'explicit'])('作者明确选择（%s）优先于迟到的当前定位',async brand=>{
 m.readWritingContext.mockReturnValue({schemaVersion:1,brandProfileVersionId:brand,sourceAssets:[]});
 render(<ArticleWorkbench {...props} initialArticleRead={initialRead(Promise.resolve({article:article()}))} brandProfileRead={{scopeKey:'group:g',result:Promise.resolve({id:'current',versionNumber:2,oneLiner:'当前'})}}/>);
 await screen.findByText('首读文章');await waitFor(()=>expect(m.setWritingContext).toHaveBeenCalled());
 expect(m.setWritingContext).toHaveBeenLastCalledWith('group:g','p',expect.objectContaining({brandProfileVersionId:brand}));
});
it('首读scope不符时走当前端口；项目或输出不符的首读不能显示',async()=>{
 const view=render(<ArticleWorkbench {...props} initialArticleRead={initialRead(Promise.resolve({article:{...article(),current:{...article().current,title:'其他工作区'}}}),'group:other')}/>);
 await screen.findByText('首读文章');expect(m.getArticle).toHaveBeenCalledOnce();expect(screen.queryByText('其他工作区')).toBeNull();view.unmount();
 render(<ArticleWorkbench {...props} initialArticleRead={initialRead(Promise.resolve({article:{...article(),projectId:'other'}}))}/>);
 await screen.findByRole('alert');expect(screen.queryByText('首读文章')).toBeNull();
});
it('卸载后拒绝旧首读迟到回填',async()=>{
 let finish!:(x:InitialResult)=>void;
 render(<ArticleWorkbench {...props} initialOutputs={[...props.initialOutputs,{id:'other',title:'另一篇'}]} initialArticleRead={initialRead(new Promise(resolve=>{finish=resolve;}))}/>);
 // 首读期间导航保持锁定；卸载模拟真实路由切换，迟到正文不能显示。
 cleanup();await act(async()=>finish({article:article()}));expect(screen.queryByText('首读文章')).toBeNull();expect(m.notifyEditorReady).not.toHaveBeenCalled();
});
it('正文首读失败可局部重试，重试真正读取当前文章',async()=>{
 render(<ArticleWorkbench {...props} initialArticleRead={initialRead(Promise.resolve({error:'正文读取失败'}))}/>);
 await screen.findByRole('alert');expect(m.getArticle).not.toHaveBeenCalled();fireEvent.click(screen.getByRole('button',{name:'重新读取文章'}));
 await screen.findByText('首读文章');expect(m.getArticle).toHaveBeenCalledOnce();
});
it('离开后再次选择初始作品会重新读取，不能重放已过时的服务端首读',async()=>{
 m.getArticle.mockImplementation(async({params})=>({...article(),outputId:params.outputId,current:{...article().current,title:params.outputId==='other'?'另一篇正文':'初始文章新版本'}}));
 render(<ArticleWorkbench {...props} initialOutputs={[...props.initialOutputs,{id:'other',title:'另一篇'}]} initialArticleRead={initialRead(Promise.resolve({article:article()}))}/>);
 await screen.findByText('首读文章');fireEvent.change(screen.getByRole('combobox',{name:'选择文章'}),{target:{value:'other'}});await screen.findByText('另一篇正文');
 fireEvent.change(screen.getByRole('combobox',{name:'选择文章'}),{target:{value:'o'}});await screen.findByText('初始文章新版本');expect(m.getArticle).toHaveBeenCalledTimes(2);
});
it('空白文章首读依旧承接脚本且不写库',async()=>{
 const data={...article(),current:{...article().current,title:''},scriptContext:{state:'ready' as const,scriptRef:{kind:'project_script' as const,id:'s',versionId:'sv'},scriptText:'脚本承接正文',metadata:{title:'脚本标题',summary:'',tags:[]}}};
 render(<ArticleWorkbench {...props} initialArticleRead={initialRead(Promise.resolve({article:data}))}/>);
 await screen.findByText('脚本标题');expect((m.note!.value as ArticleDocument).sections[0]!.body).toBe('脚本承接正文');expect(m.getArticle).not.toHaveBeenCalled();
});
