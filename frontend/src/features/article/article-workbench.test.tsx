import * as React from 'react';
import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import type {ArticleDocument} from '@creatoros/contract';
const m=vi.hoisted(()=>({getArticle:vi.fn(),getArticleVersion:vi.fn(),createArticleVersion:vi.fn(),createOutput:vi.fn(),getTask:vi.fn(),getArticleCandidate:vi.fn(),adoptArticleCandidate:vi.fn(),openChat:vi.fn(),setWritingContext:vi.fn(),writing:undefined as any,port:null as any,note:null as any}));
vi.mock('@/lib/contract-client',()=>({client:m}));
vi.mock('@/features/draft-workbench/draft-chat-request',async original=>{const real:any=await original();return {...real,useDraftChatRequest:()=>{const context=real.useDraftChatRequest();const registerEditor=React.useCallback((port:any)=>{m.port=port;return context.registerEditor(port);},[context.registerEditor]);return {...context,openChat:m.openChat,readWritingContext:()=>m.writing,setWritingContext:m.setWritingContext,registerEditor};}};});
vi.mock('@/features/reference-editors/noterelay/noterelay-editor',()=>({NoteRelayEditor:(props:any)=>{m.note=props;return <section aria-label="成稿预览"><h2>{props.value.title}</h2>{props.value.sections.map((s:any)=><p key={s.sectionId}>{s.body}</p>)}<button onClick={()=>void props.prepareDelivery()}>测试交付</button></section>;}}));
vi.mock('./doocs-article-editor',()=>({DoocsArticleEditor:()=>null}));
vi.mock('./article-result-actions',()=>({ArticleResultActions:()=>null}));
import {ArticleWorkbench} from './article-workbench';
const empty:ArticleDocument={schemaVersion:1,title:'',summary:'',sections:[],factItems:[],visualBriefs:[],imageUses:[]};
const script={state:'ready' as const,scriptRef:{kind:'project_script' as const,id:'script',versionId:'sv1'},scriptText:'脚本里的原话。\n第二行原样保留。',metadata:{title:'原稿标题',summary:'',tags:[]}};
const initial=()=>({projectId:'p',outputId:'o',artifactId:'a',currentVersionId:'v1',current:structuredClone(empty),versions:[{id:'v1',versionNumber:1,createdAt:'2026-10-15T00:00:00Z',changeSummary:'原稿'}],scriptContext:script});
let latest:ReturnType<typeof initial>;
const props={projectId:'p',projectTitle:'项目',accountId:'a',initialOutputs:[{id:'o',title:'文章'}]};
beforeEach(()=>{vi.clearAllMocks();sessionStorage.clear();localStorage.removeItem('creatoros:current-group');localStorage.setItem('creatoros:current-account','a');m.writing=undefined;latest=initial();m.getArticle.mockImplementation(async()=>structuredClone(latest));m.getArticleVersion.mockImplementation(async({params})=>({versionId:params.versionId,document:structuredClone(latest.current)}));m.createArticleVersion.mockImplementation(async({body})=>{latest={...latest,currentVersionId:'v2',current:structuredClone(body.document)};return {versionId:'v2',document:latest.current};});m.getTask.mockResolvedValue({status:'running'});});
afterEach(()=>{cleanup();vi.unstubAllGlobals();sessionStorage.clear();});
async function ready(){await screen.findByText(/脚本里的原话/);}
it('只展示承接成稿，移除二次输入和精调，重组保存读回后发送平台请求',async()=>{
 render(<ArticleWorkbench {...props}/>);await ready();expect(screen.queryAllByRole('textbox')).toHaveLength(0);expect(screen.queryByText('添加段落')).toBeNull();expect(m.createArticleVersion).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button',{name:'重新组织内容'}));await waitFor(()=>expect(m.openChat).toHaveBeenCalledOnce());expect(m.createArticleVersion).toHaveBeenCalledOnce();expect(m.createArticleVersion.mock.calls[0]![0].body.document.sections[0]).toMatchObject({body:script.scriptText,sourceRefs:[script.scriptRef]});expect(m.getArticleVersion).toHaveBeenCalledWith(expect.objectContaining({params:{outputId:'o',versionId:'v2'}}));expect(m.openChat).toHaveBeenCalledWith(expect.objectContaining({autoSend:true,prefill:expect.stringContaining('公众号文章')}));
});
it('已有平台正文/图片/版式保留，脚本更新只由AI请求读取',async()=>{
 const current={...empty,title:'独立成稿',sections:[{sectionId:'s',order:0,heading:'段',headingLevel:2,body:'平台已经调整',sourceRefs:[script.scriptRef]}],imageUses:[{sectionId:'s',assetId:'image',assetFileId:'file',sourceKind:'existing' as const,reviewState:'selected' as const}]};latest.current=current;render(<ArticleWorkbench {...props}/>);await screen.findByText('平台已经调整');expect(m.note.value).toEqual(current);await act(async()=>{await m.port.prepareForTurn();});expect(m.createArticleVersion).not.toHaveBeenCalled();expect(m.port.readState().target.selection).toEqual({kind:'article',sectionIds:[]});
});
it('保存UNKNOWN后阻止发消息，恢复同一请求和完整正文',async()=>{
 m.createArticleVersion.mockRejectedValueOnce(new Error('网络中断'));render(<ArticleWorkbench {...props}/>);await ready();fireEvent.click(screen.getByRole('button',{name:'重新组织内容'}));await screen.findByRole('alert');expect(m.openChat).not.toHaveBeenCalled();const original=m.createArticleVersion.mock.calls[0]![0];fireEvent.click(screen.getByRole('button',{name:'恢复保存并核对'}));await waitFor(()=>expect(m.createArticleVersion).toHaveBeenCalledTimes(2));expect(m.createArticleVersion.mock.calls[1]![0]).toEqual(original);await waitFor(()=>expect(screen.getByText('当前成稿已保存')).toBeVisible());
});
it('指定版本内容不匹配保留恢复记录，不能继续AI重组',async()=>{
 m.getArticleVersion.mockImplementation(async({params})=>({versionId:params.versionId,document:{...latest.current,summary:'被改过'}}));render(<ArticleWorkbench {...props}/>);await ready();fireEvent.click(screen.getByRole('button',{name:'重新组织内容'}));await screen.findByRole('alert');expect(m.openChat).not.toHaveBeenCalled();expect(Object.keys(sessionStorage).some(k=>k.includes('article:request:'))).toBe(true);
});
it('原稿空或读失败不发空白重组，仍可查看已有平台稿',async()=>{
 latest={...latest,scriptContext:{...script,state:'unavailable',scriptText:''} as any,current:{...empty,title:'保留文章'}};render(<ArticleWorkbench {...props}/>);await screen.findByText('保留文章');expect(screen.getByRole('button',{name:'重新组织内容'})).toBeDisabled();expect(screen.getByRole('link',{name:'前往脚本撰写原稿'})).toHaveAttribute('href','/projects/p');expect(m.createArticleVersion).not.toHaveBeenCalled();
});
it('保留明确选择的品牌与资料文件版本，不隐式读取项目全库',async()=>{
 m.writing={schemaVersion:1,brandProfileVersionId:'brand-old',sourceAssets:[{assetId:'source',assetFileId:'file-original'}]};render(<ArticleWorkbench {...props} activeBrandProfile={{id:'brand-current',versionNumber:2,oneLiner:'当前身份'}}/>);await ready();const target=await m.port.prepareForTurn();expect(target.writingContext).toEqual(m.writing);
});
it('多个作品不暗选，无效初始ID不回退另一篇',async()=>{
 const r=render(<ArticleWorkbench {...props} initialOutputs={[{id:'o',title:'甲'},{id:'other',title:'乙'}]} initialOutputId="missing"/>);expect(m.getArticle).not.toHaveBeenCalled();expect(screen.getByRole('combobox',{name:'选择文章'})).toHaveValue('');r.unmount();render(<ArticleWorkbench {...props} initialOutputs={[{id:'o',title:'甲'},{id:'other',title:'乙'}]}/>);expect(m.getArticle).not.toHaveBeenCalled();fireEvent.change(screen.getByRole('combobox',{name:'选择文章'}),{target:{value:'o'}});await ready();expect(m.getArticle).toHaveBeenCalledWith(expect.objectContaining({params:{outputId:'o'}}));
});
it('历史查看读取指定版本，不把当前承接稿当历史稿',async()=>{
 render(<ArticleWorkbench {...props}/>);await ready();m.getArticleVersion.mockResolvedValue({versionId:'v1',document:{...empty,title:'真正旧版'}});const d=screen.getByText('历史版本').closest('details')!;d.open=true;fireEvent(d,new Event('toggle'));fireEvent.click(screen.getByRole('button',{name:'查看此版'}));await screen.findByText('真正旧版');expect(m.getArticleVersion).toHaveBeenCalledWith(expect.objectContaining({params:{outputId:'o',versionId:'v1'}}));
});
it('部分完成保留原任务ID，重新打开只核对原任务不读取或采用未就绪候选',async()=>{
 sessionStorage.setItem('creatoros:article-task:o','original-task');m.getTask.mockResolvedValue({status:'partial'});const r=render(<ArticleWorkbench {...props}/>);await screen.findByText(/本次文章生成部分完成/);expect(sessionStorage.getItem('creatoros:article-task:o')).toBe('original-task');r.unmount();render(<ArticleWorkbench {...props}/>);await screen.findByText(/本次文章生成部分完成/);expect(m.getTask).toHaveBeenCalledTimes(2);expect(m.getArticleCandidate).not.toHaveBeenCalled();expect(m.adoptArticleCandidate).not.toHaveBeenCalled();expect(m.createArticleVersion).not.toHaveBeenCalled();
});

// T1062_COMPONENT_PORT_SEAM: 仅本文件既有业务spies；真实scope/epoch/signal/lifecycle不替换。
vi.mock("@/lib/creation-workspace-scope", async importOriginal => {
  const actual = await importOriginal<typeof import("@/lib/creation-workspace-scope")>();
  const {client: componentPorts} = await import("@/lib/contract-client");
  type Workspace = ReturnType<typeof actual.createCreationWorkspace>;
  type Operation = ReturnType<Workspace["capture"]>;
  const views = new WeakMap<Workspace, Workspace>();
  function portClient(base: Operation["client"], capture: () => Operation): Operation["client"] {
    const methods = new Map<PropertyKey, unknown>();
    return new Proxy(base, {
      get(target, key, receiver) {
        const port = Reflect.get(componentPorts, key);
        const original = Reflect.get(target, key, receiver);
        if (typeof port !== "function") return original;
        if (!methods.has(key)) methods.set(key, async (...args: unknown[]) => {
          const operation = capture();
          operation.assertCurrent();
          try { return await Reflect.apply(Reflect.get(componentPorts, key), componentPorts, args); }
          finally { operation.assertCurrent(); }
        });
        return methods.get(key);
      },
    });
  }
  function view(workspace: Workspace): Workspace {
    const cached = views.get(workspace);
    if (cached) return cached;
    const client = portClient(workspace.client, () => workspace.capture());
    const capture = (): Operation => {
      const operation = workspace.capture();
      return Object.freeze({...operation, client: portClient(operation.client, () => operation)});
    };
    const proxy = new Proxy(workspace, {
      get(target, key) {
        if (key === "client") return client;
        if (key === "capture") return capture;
        // Reflect读取原对象getter，signal/epoch始终是原factory当前值；不spread workspace。
        return Reflect.get(target, key, target);
      },
    });
    views.set(workspace, proxy);
    return proxy;
  }
  return {
    ...actual,
    createCreationWorkspace: (...args: Parameters<typeof actual.createCreationWorkspace>) => view(actual.createCreationWorkspace(...args)),
    useCreationWorkspace: (scope: Parameters<typeof actual.useCreationWorkspace>[0]) => view(actual.useCreationWorkspace(scope)),
    useCreationClient: () => view(actual.useCreationWorkspace(actual.useCreationScope())).client,
  };
});
// T1062_COMPONENT_PORT_SEAM_END

// T1062_UNIT_SCOPE_FIXTURE: 显式合成单测选择；不是当前用户/生产default。
import {beforeEach as t1062ScopeBeforeEach, afterEach as t1062ScopeAfterEach} from "vitest";
t1062ScopeBeforeEach(() => {
  window.localStorage.setItem("creatoros:current-group", "t1062-unit-test-group");
  window.localStorage.removeItem("creatoros:current-account");
});
t1062ScopeAfterEach(() => {
  window.localStorage.removeItem("creatoros:current-group");
  window.localStorage.removeItem("creatoros:current-account");
});
// T1062_UNIT_SCOPE_FIXTURE_END

import {DraftChatRequestProvider,useDraftChatRequest} from '@/features/draft-workbench/draft-chat-request';
let actualChat:ReturnType<typeof useDraftChatRequest>;
function ChatPortWitness(){actualChat=useDraftChatRequest();return null;}
it.each(['normal','later-input','unmount'] as const)('T1298 真实Provider与成稿端口同步代次及并发保护：%s',async mode=>{
 latest.current={...latest.current,title:'已保存稿',sections:[{sectionId:'s',order:0,heading:'',headingLevel:2,body:'已保存正文',sourceRefs:[]}]};
 const tree=(shown=true)=><DraftChatRequestProvider><ChatPortWitness/>{shown?<ArticleWorkbench {...props}/>:null}</DraftChatRequestProvider>;const view=render(tree());await screen.findByText('已保存正文');
 const changed={...latest.current,sections:latest.current.sections.map(s=>({...s,body:'本次采用正文'}))};
 const candidate:any={kind:'work.editor.candidate',target:{outputId:'o'},candidate:{kind:'article',document:changed},apply:{operation:'createArticleVersion',outputId:'o',body:{expectedCurrentVersionId:'v1',document:changed}}};
 let finish!:(value:any)=>void;m.createArticleVersion.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));let pending:Promise<any>;act(()=>{pending=actualChat.adoptEditorCandidate(candidate,'t1298-adoption').catch(error=>({error}));});await waitFor(()=>expect(m.createArticleVersion).toHaveBeenCalledOnce());
 const layout:any={schemaVersion:1,editor:'noterelay',editorVersion:'0.1.8',themeId:'default',authorName:'晚到输入',authorBio:'',variables:{},fontSize:16,splitHeading:2,templateId:'default',imageWidths:{},imageRadii:{}};
 if(mode==='later-input')act(()=>m.note.onLayoutChange(layout));if(mode==='unmount')view.rerender(tree(false));latest={...latest,currentVersionId:'v2',current:changed};let result:any;await act(async()=>{finish({versionId:'v2'});result=await pending;});
 if(mode==='normal'){expect(result).toMatchObject({status:'adopted',versionId:'v2'});expect(actualChat.readEditorState()).toMatchObject({dirty:false});expect(screen.getByText('本次采用正文')).toBeVisible();}
 else{expect(result?.status).not.toBe('adopted');if(mode==='later-input'){expect(m.note.value.nativeLayout).toEqual(layout);expect(actualChat.readEditorState()?.dirty).toBe(true);}}
});

it("T1300 重组只读取一次有效latest/exact，不额外前读当前稿",async()=>{
 latest.current={...latest.current,title:"已存",sections:[{sectionId:"s",order:0,heading:"",headingLevel:2,body:"已存正文",sourceRefs:[]}]};render(<ArticleWorkbench {...props}/>);await screen.findByText("已存正文");m.getArticle.mockClear();m.getArticleVersion.mockClear();fireEvent.click(screen.getByRole("button",{name:"重新组织内容"}));await waitFor(()=>expect(m.openChat).toHaveBeenCalledOnce());expect(m.getArticle).toHaveBeenCalledTimes(1);expect(m.getArticleVersion).toHaveBeenCalledTimes(1);
});

it("T1300 requireScript只约束重组当次latest，普通对话无脚本门槛",async()=>{
 latest.current={...latest.current,title:"已存",sections:[{sectionId:"s",order:0,heading:"",headingLevel:2,body:"已存正文",sourceRefs:[]}]};render(<ArticleWorkbench {...props}/>);await screen.findByText("已存正文");latest={...latest,scriptContext:{...script,state:"empty",scriptText:""} as any};await act(async()=>{expect(await m.port.prepareForTurn()).toMatchObject({outputId:"o"});});await expect(m.port.prepareForTurn({requireScript:true})).rejects.toThrow(/脚本/);expect(m.openChat).not.toHaveBeenCalled();expect(m.createArticleVersion).not.toHaveBeenCalled();
});

it('T1303 真实owner首次谱系在外部版式回调编辑又改回后不可复活',async()=>{
 const layout:any={schemaVersion:1,editor:'noterelay',editorVersion:'0.1.8',themeId:'default',authorName:'原作者',authorBio:'',variables:{},fontSize:16,splitHeading:2,templateId:'default',imageWidths:{},imageRadii:{}};latest.current.nativeLayout=layout;render(<DraftChatRequestProvider><ChatPortWitness/><ArticleWorkbench {...props}/></DraftChatRequestProvider>);await waitFor(()=>expect(m.note?.value.sections[0]?.body).toBe(script.scriptText));
 const candidate:any={kind:'work.creation.member',member:'article',proposal:{target:{projectId:'p',scriptSourceRef:script.scriptRef,articleMember:{outputId:'o',artifactId:'a',baseVersionId:'v1'}},scriptSourceRef:script.scriptRef}};
 expect(await m.port.admitCandidate(candidate)).not.toBeNull();act(()=>m.note.onLayoutChange({...layout,authorName:'受控回调新值'}));act(()=>m.note.onLayoutChange(layout));expect(m.note.value.nativeLayout).toEqual(layout);expect(await m.port.admitCandidate(candidate)).toBeNull();await expect(actualChat.adoptEditorCandidate(candidate,'original-key')).rejects.toThrow(/未保存/);expect(m.createArticleVersion).not.toHaveBeenCalled();
});
it('T1303 派生准入只读等待时真实owner新回调输入保留，零保存',async()=>{
 render(<DraftChatRequestProvider><ChatPortWitness/><ArticleWorkbench {...props}/></DraftChatRequestProvider>);await waitFor(()=>expect(m.note?.value.sections[0]?.body).toBe(script.scriptText));let finish!:(v:any)=>void;m.getArticle.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));const candidate:any={kind:'work.creation.member',member:'article',proposal:{target:{projectId:'p',scriptSourceRef:script.scriptRef,articleMember:{outputId:'o',artifactId:'a',baseVersionId:'v1'}},scriptSourceRef:script.scriptRef}};let pending!:Promise<any>;act(()=>{pending=actualChat.adoptEditorCandidate(candidate,'same-request').catch(error=>error);});await waitFor(()=>expect(finish).toBeTypeOf('function'));const layout:any={schemaVersion:1,editor:'noterelay',editorVersion:'0.1.8',themeId:'default',authorName:'等待期间的受控回调',authorBio:'',variables:{},fontSize:16,splitHeading:2,templateId:'default',imageWidths:{},imageRadii:{}};act(()=>m.note.onLayoutChange(layout));await act(async()=>finish(structuredClone(latest)));expect(await pending).toBeInstanceOf(Error);expect(m.note.value.nativeLayout).toEqual(layout);expect(m.createArticleVersion).not.toHaveBeenCalled();
});
