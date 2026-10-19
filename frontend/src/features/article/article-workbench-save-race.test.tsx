import * as React from 'react';
import type {ArticleDocument} from '@creatoros/contract';
import {it,expect,vi,afterEach,beforeEach} from 'vitest';
import {act,render,screen,waitFor,cleanup} from '@testing-library/react';
const api=vi.hoisted(()=>({getArticle:vi.fn(),createArticleVersion:vi.fn(),getArticleVersion:vi.fn(),note:null as any,port:null as any}));
vi.mock('@/lib/contract-client',()=>({client:api}));
vi.mock('@/features/draft-workbench/draft-chat-request',async original=>{const real:any=await original();return {...real,useDraftChatRequest:()=>({...real.useDraftChatRequest(),registerEditor:(port:any)=>{api.port=port;return()=>{};}})};});
vi.mock('./doocs-article-editor',()=>({DoocsArticleEditor:()=>null}));
vi.mock('./article-result-actions',()=>({ArticleResultActions:()=>null}));
vi.mock('@/features/reference-editors/noterelay/noterelay-editor',()=>({NoteRelayEditor:(props:any)=>{api.note=props;return <p>测试预览已载入</p>;}}));
import {ArticleWorkbench} from './article-workbench';
const doc:ArticleDocument={schemaVersion:1,title:'原标题',summary:'摘要',sections:[{sectionId:'s1',order:0,heading:'一',headingLevel:2,body:'正文一',sourceRefs:[]},{sectionId:'s2',order:1,heading:'二',headingLevel:2,body:'正文二',sourceRefs:[]}],factItems:[],visualBriefs:[],imageUses:[],tags:['标签'],nativeLayout:undefined};
const layout={schemaVersion:1 as const,editor:'noterelay' as const,editorVersion:'0.1.8' as const,themeId:'default',authorName:'待保存作者',authorBio:'',variables:{},fontSize:16,splitHeading:2 as const,templateId:'default' as const,imageWidths:{},imageRadii:{}};
let latest:any;
beforeEach(()=>{vi.clearAllMocks();latest={outputId:'o',artifactId:'art',currentVersionId:'v1',current:structuredClone(doc),versions:[]};api.getArticle.mockImplementation(async()=>structuredClone(latest));api.createArticleVersion.mockImplementation(async({body})=>{latest={...latest,currentVersionId:'v2',current:structuredClone(body.document)};return{versionId:'v2'};});api.getArticleVersion.mockImplementation(async({params})=>({versionId:params.versionId,document:structuredClone(latest.current)}));});
afterEach(()=>{cleanup();sessionStorage.clear();});
async function ready(){render(<ArticleWorkbench projectId="p" projectTitle="项目" accountId="a" initialOutputs={[{id:'o',title:'文章'}]}/>);await screen.findByText('测试预览已载入');act(()=>api.note.onLayoutChange(layout));}
function reverse<T>(v:T):T{if(Array.isArray(v))return v.map(reverse) as T;if(v&&typeof v==='object')return Object.fromEntries(Object.entries(v).reverse().map(([k,x])=>[k,reverse(x)])) as T;return v;}
it.each(['ordinary','concurrent','recover'] as const)('保存%s分支遇到迟到版式状态仍保留新输入，阻止使用旧稿发送',async(mode)=>{
 await ready();let finish!:(v:any)=>void;api.createArticleVersion.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
 if(mode==='recover'){const prior={...doc,title:'上一笔保存'};sessionStorage.setItem('creatoros:article:request:account:a:o',JSON.stringify({clientRequestId:'original',payloadDigest:JSON.stringify({outputId:'o',expectedCurrentVersionId:'v1',document:prior}),body:{expectedCurrentVersionId:'v1',document:prior}}));}
 let pending!:Promise<unknown>;act(()=>{pending=api.port.prepareForTurn().then(()=>({passed:true}), (error:Error)=>({error:error.message}));});await waitFor(()=>expect(api.createArticleVersion).toHaveBeenCalledOnce());const input=api.createArticleVersion.mock.calls[0]![0];act(()=>api.note.onLayoutChange({...layout,authorName:'保存等待中的新状态'}));latest={...latest,currentVersionId:mode==='concurrent'?'v3':'v2',current:input.body.document};api.getArticleVersion.mockResolvedValue({versionId:'v2',document:input.body.document});await act(async()=>finish({versionId:'v2'}));expect(await pending).toHaveProperty('error');expect(api.note.value.nativeLayout.authorName).toBe('保存等待中的新状态');
 if(mode==='recover')expect(input.body.clientRequestId).toBe('original');
});
it('精确读回只改变对象键序可接受，保留完整字段/数组并清理恢复记录',async()=>{
 await ready();api.getArticleVersion.mockImplementation(async({params})=>({versionId:params.versionId,document:reverse(JSON.parse(JSON.stringify(latest.current)))}));await act(async()=>{expect(await api.note.prepareDelivery()).toBe(true);});expect(sessionStorage.getItem('creatoros:article:request:account:a:o')).toBeNull();expect(api.note.value.sections).toEqual(doc.sections);expect(api.note.value.nativeLayout).toEqual(layout);
});
it.each(['field','version-id','array-order'] as const)('精确读回%s变化必须拒绝并保留同一恢复请求',async(kind)=>{
 await ready();api.getArticleVersion.mockImplementation(async()=>({versionId:kind==='version-id'?'other':'v2',document:kind==='field'?{...latest.current,summary:'被篡改'}:kind==='array-order'?{...latest.current,sections:[...latest.current.sections].reverse()}:latest.current}));await act(async()=>{expect(await api.note.prepareDelivery()).toBe(false);});const saved=sessionStorage.getItem('creatoros:article:request:account:a:o');expect(saved).not.toBeNull();expect(JSON.parse(saved!).body.document.nativeLayout).toEqual(layout);
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
  window.localStorage.removeItem("creatoros:current-group");
  window.localStorage.setItem("creatoros:current-account", "a");
});
t1062ScopeAfterEach(() => {
  window.localStorage.removeItem("creatoros:current-group");
  window.localStorage.removeItem("creatoros:current-account");
});
// T1062_UNIT_SCOPE_FIXTURE_END
