import * as React from 'react';
import type {ArticleDocument} from '@creatoros/contract';
import {it,expect,vi,afterEach} from 'vitest';
import {render,screen,fireEvent,waitFor,cleanup} from '@testing-library/react';
const api=vi.hoisted(()=>({getArticle:vi.fn(),createArticleVersion:vi.fn(),getArticleVersion:vi.fn(),generateArticleCandidate:vi.fn(),listMaterialLinks:vi.fn(async()=>[])}));
vi.mock('@/lib/contract-client',()=>({client:api}));
vi.mock('./doocs-article-editor',()=>({DoocsArticleEditor:({value,onChange}:{value:ArticleDocument;onChange:(document:ArticleDocument)=>void})=><button onClick={()=>onChange({...value,title:'保存期间的新标题'})}>辅助编辑器继续编辑</button>}));
import {ArticleWorkbench} from './article-workbench';
afterEach(()=>{cleanup();vi.clearAllMocks();sessionStorage.clear();});

function reverseObjectKeysDeep<T>(value: T): T {
 if (Array.isArray(value)) return value.map(reverseObjectKeysDeep) as T;
 if (value !== null && typeof value === 'object') return Object.fromEntries(Object.entries(value as Record<string,unknown>).reverse().map(([key,item])=>[key,reverseObjectKeysDeep(item)])) as T;
 return value;
}
it('主生成先保存；辅助编辑器在回执期间新增输入不丢且不拿旧稿继续生成',async()=>{
 const doc={schemaVersion:1,title:'原标题',summary:'',sections:[],factItems:[],visualBriefs:[],imageUses:[]};
 const initial={outputId:'o',artifactId:'art',currentVersionId:'v1',current:doc,versions:[]};
 api.getArticle.mockResolvedValueOnce(initial);
 let finish!:(value:unknown)=>void;
 api.createArticleVersion.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
 api.getArticleVersion.mockImplementation(async()=>({versionId:'v2',document:api.createArticleVersion.mock.calls[0][0].body.document}));
 api.getArticle.mockImplementation(async()=>({...initial,currentVersionId:'v2',current:api.createArticleVersion.mock.calls[0][0].body.document}));
 render(<ArticleWorkbench projectId="p" projectTitle="项目" accountId="a" initialOutputs={[{id:'o',title:'文章'}]}/>);await screen.findByText('当前稿件');
 const detail=screen.getByText('使用 Doocs 编辑器（保留原版式）').closest('details')!;detail.open=true;fireEvent(detail,new Event('toggle'));await screen.findByRole('button',{name:'辅助编辑器继续编辑'});
 fireEvent.change(screen.getByRole('textbox',{name:'标题'}),{target:{value:'准备生成的标题'}});
 fireEvent.click(screen.getByRole('button',{name:'根据脚本扩写文章'}));await waitFor(()=>expect(api.createArticleVersion).toHaveBeenCalledOnce());
 fireEvent.click(screen.getByRole('button',{name:'辅助编辑器继续编辑'}));finish({versionId:'v2'});
 await waitFor(()=>expect(screen.getByRole('textbox',{name:'标题'})).toHaveValue('保存期间的新标题'));
 await waitFor(()=>expect(screen.getByRole('button',{name:'保存修改'})).toBeEnabled());
 expect(api.generateArticleCandidate).not.toHaveBeenCalled();
 expect(screen.getByText(/保存期间的新编辑仍保留/)).toHaveAttribute('role','status');
});
it.each(['concurrent','recover'])('保存 %s 分支同样保留回执等待期间的新输入',async(mode)=>{
 const doc={schemaVersion:1,title:'原标题',summary:'',sections:[],factItems:[],visualBriefs:[],imageUses:[]};
 const initial={outputId:'o',artifactId:'art',currentVersionId:'v1',current:doc,versions:[]};
 api.getArticle.mockResolvedValueOnce(initial);
 let finish!:(value:unknown)=>void;api.createArticleVersion.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
 api.getArticleVersion.mockImplementation(async()=>({versionId:'v2',document:api.createArticleVersion.mock.calls[0][0].body.document}));
 api.getArticle.mockImplementation(async()=>({...initial,currentVersionId:mode==='concurrent'?'v3':'v2',current:api.createArticleVersion.mock.calls[0][0].body.document}));
 render(<ArticleWorkbench projectId="p" projectTitle="项目" accountId="a" initialOutputs={[{id:'o',title:'文章'}]}/>);await screen.findByText('当前稿件');
 const detail=screen.getByText('使用 Doocs 编辑器（保留原版式）').closest('details')!;detail.open=true;fireEvent(detail,new Event('toggle'));await screen.findByRole('button',{name:'辅助编辑器继续编辑'});
 fireEvent.change(screen.getByRole('textbox',{name:'标题'}),{target:{value:'准备生成的标题'}});
 if(mode==='recover'){const prior={...doc,title:'上一笔标题'};sessionStorage.setItem('creatoros:article:request:account:a:o',JSON.stringify({clientRequestId:'prior-request',payloadDigest:JSON.stringify({outputId:'o',expectedCurrentVersionId:'v1',document:prior}),body:{expectedCurrentVersionId:'v1',document:prior}}));}
 fireEvent.click(screen.getByRole('button',{name:'根据脚本扩写文章'}));await waitFor(()=>expect(api.createArticleVersion).toHaveBeenCalledOnce());
 fireEvent.click(screen.getByRole('button',{name:'辅助编辑器继续编辑'}));finish({versionId:'v2'});
 await screen.findByRole('alert');expect(screen.getByRole('textbox',{name:'标题'})).toHaveValue('保存期间的新标题');expect(api.generateArticleCandidate).not.toHaveBeenCalled();
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


it('指定版本读回保留全部字段和值而仅对象键顺序变化时清理恢复记录',async()=>{
 api.getArticle.mockReset();api.createArticleVersion.mockReset();api.getArticleVersion.mockReset();

 const doc:ArticleDocument={schemaVersion:1,title:'原标题',titleSourceRefs:[{kind:'project',id:'p',versionId:'pv1'}],summary:'原摘要',summarySourceRefs:[{kind:'project',id:'p',versionId:'pv1'}],sections:[{sectionId:'s1',order:0,heading:'标题',headingLevel:2,body:'正文',sourceRefs:[{kind:'project',id:'p',versionId:'pv1'}]}],factItems:[],visualBriefs:[{sectionId:'s1',brief:'配图建议'}],imageUses:[],coverImageUse:null,tags:['标签'],imageMatchWarnings:['保留提示'],nativeLayout:undefined};
 const initial={outputId:'o',artifactId:'art',currentVersionId:'v1',current:doc,versions:[]};
 api.getArticle.mockResolvedValueOnce(initial);
 api.createArticleVersion.mockResolvedValueOnce({versionId:'v2'});
 api.getArticleVersion.mockImplementationOnce(async()=>({versionId:'v2',document:reverseObjectKeysDeep(JSON.parse(JSON.stringify(api.createArticleVersion.mock.calls[0][0].body.document)))}));
 api.getArticle.mockImplementationOnce(async()=>{const submitted=api.createArticleVersion.mock.calls[0][0].body.document;return {...initial,currentVersionId:'v2',current:submitted};});
 render(<ArticleWorkbench projectId="p" projectTitle="项目" accountId="a" initialOutputs={[{id:'o',title:'文章'}]}/>);
 await screen.findByText('当前稿件');
 fireEvent.change(screen.getByRole('textbox',{name:'标题'}),{target:{value:'新标题'}});
 fireEvent.click(screen.getByRole('button',{name:'保存修改'}));
 await screen.findByText('稿件已保存为新版本并完成指定版本读回。');
 const submitted=api.createArticleVersion.mock.calls[0][0].body.document;
 expect(reverseObjectKeysDeep(reverseObjectKeysDeep(JSON.parse(JSON.stringify(submitted))))).toEqual({...submitted,nativeLayout:undefined});
 expect(JSON.parse(JSON.stringify(submitted))).not.toHaveProperty('nativeLayout');
 expect(sessionStorage.getItem('creatoros:article:request:account:a:o')).toBeNull();
});

it('指定版本读回任一完整字段值被篡改时仍拒绝并保留恢复记录',async()=>{
 api.getArticle.mockReset();api.createArticleVersion.mockReset();api.getArticleVersion.mockReset();

 const doc:ArticleDocument={schemaVersion:1,title:'原标题',summary:'原摘要',sections:[],factItems:[],visualBriefs:[],imageUses:[]};
 const initial={outputId:'o',artifactId:'art',currentVersionId:'v1',current:doc,versions:[]};
 api.getArticle.mockResolvedValueOnce(initial);
 api.createArticleVersion.mockResolvedValueOnce({versionId:'v2'});
 api.getArticleVersion.mockImplementationOnce(async()=>{const submitted=api.createArticleVersion.mock.calls[0][0].body.document as ArticleDocument;return {versionId:'v2',document:{...submitted,summary:'被篡改摘要'}};});
 render(<ArticleWorkbench projectId="p" projectTitle="项目" accountId="a" initialOutputs={[{id:'o',title:'文章'}]}/>);
 await screen.findByText('当前稿件');
 fireEvent.change(screen.getByRole('textbox',{name:'标题'}),{target:{value:'新标题'}});
 fireEvent.click(screen.getByRole('button',{name:'保存修改'}));
 await screen.findByText('保存回执与指定版本读回不一致，未清理恢复记录。');
 expect(api.getArticle).toHaveBeenCalledOnce();
 const recovery=sessionStorage.getItem('creatoros:article:request:account:a:o');
 expect(recovery).not.toBeNull();
 expect(JSON.parse(recovery!).body.document.title).toBe('新标题');
});


it.each(['version-id','array-order'] as const)('指定版本读回 %s 变化仍严格拒绝',async(kind)=>{
 api.getArticle.mockReset();api.createArticleVersion.mockReset();api.getArticleVersion.mockReset();

 const doc:ArticleDocument={schemaVersion:1,title:'原标题',summary:'原摘要',sections:[{sectionId:'s1',order:0,heading:'第一段',headingLevel:2,body:'正文一',sourceRefs:[]},{sectionId:'s2',order:1,heading:'第二段',headingLevel:2,body:'正文二',sourceRefs:[]}],factItems:[],visualBriefs:[],imageUses:[]};
 const initial={outputId:'o',artifactId:'art',currentVersionId:'v1',current:doc,versions:[]};
 api.getArticle.mockResolvedValueOnce(initial);
 api.createArticleVersion.mockResolvedValueOnce({versionId:'v2'});
 api.getArticleVersion.mockImplementationOnce(async()=>{const submitted=api.createArticleVersion.mock.calls[0][0].body.document as ArticleDocument;return {versionId:kind==='version-id'?'v-other':'v2',document:kind==='array-order'?{...submitted,sections:[...submitted.sections].reverse()}:submitted};});
 render(<ArticleWorkbench projectId="p" projectTitle="项目" accountId="a" initialOutputs={[{id:'o',title:'文章'}]}/>);
 await screen.findByText('当前稿件');
 fireEvent.change(screen.getByRole('textbox',{name:'标题'}),{target:{value:'新标题'}});
 fireEvent.click(screen.getByRole('button',{name:'保存修改'}));
 await screen.findByText('保存回执与指定版本读回不一致，未清理恢复记录。');
 expect(api.getArticle).toHaveBeenCalledOnce();
 expect(sessionStorage.getItem('creatoros:article:request:account:a:o')).not.toBeNull();
});
