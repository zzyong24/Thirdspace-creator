import '@testing-library/jest-dom/vitest';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {render,screen,fireEvent,waitFor,act,cleanup} from '@testing-library/react';
const f=vi.hoisted(()=>({account:'account-a',params:new URLSearchParams(),accountChanged:null as null|(()=>void),read:vi.fn(),save:vi.fn(),tasks:vi.fn(),selector:vi.fn(),download:vi.fn(),confirm:vi.fn(),localOpen:vi.fn(),router:{push:vi.fn(),replace:vi.fn()}}));
vi.mock('next/navigation',()=>({useRouter:()=>f.router,useSearchParams:()=>f.params}));
vi.mock("@/lib/http-transport", async importOriginal => ({...await importOriginal<typeof import("@/lib/http-transport")>(), readCurrentAccountId:()=>f.account}));
vi.mock('@/lib/account-events',()=>({useAccountsChanged:(fn:()=>void)=>{f.accountChanged=fn;}}));
vi.mock('@/lib/copilot-navigation',()=>({openCopilotLocally:(href:string)=>f.localOpen(href)}));
vi.mock('@/lib/contract-client',()=>({client:{getGraphicPost:async()=>({projectId:'p',outputId:'o',artifactId:'art',currentVersionId:'v1',current:graphic()}),getGraphicPostVersion:async()=>({versionId:'v1',document:graphic()}),getProject:async()=>({id:'p',title:'项目'}),listMaterialLinks:async()=>[],getCanvas:(...a:unknown[])=>f.read(...a),saveCanvas:(...a:unknown[])=>f.save(...a),listCanvasNodeTasks:(...a:unknown[])=>f.tasks(...a),listCanvasProposals:async()=>[],listAssets:async()=>[],listProjects:async()=>[],getCanvasGenerationCapabilities:async()=>({modes:[{mode:'text_to_image',available:true,model:'fixture',reason:null}]}),getTask:async()=>({status:'awaiting_confirmation',taskType:'asset.generate',executionTaskId:'exec-a',inputData:{prompt:'原生成描述'}}),getCanvasGenerationMaterial:(...a:unknown[])=>f.selector(...a),getAssetFileDownloadUrl:(...a:unknown[])=>f.download(...a),confirmTask:(...a:unknown[])=>f.confirm(...a)}}));
import {CanvasEditor} from './canvas-editor';
import {MediaPreview} from './infinite-canvas-node';
import {CanvasAssetPicker} from './canvas-asset-picker';
const canvas=()=>({id:'canvas-a',userId:'user-a',accountId:'account-a',title:'原画布',projectId:null,revision:2,document:{schemaVersion:1,viewport:{x:0,y:0,zoom:1},nodes:[{id:'generate-node',type:'image_generation',label:'原生成',position:{x:0,y:0},size:{width:350,height:430},prompt:'原描述',mode:'text_to_image'}],edges:[]},createdAt:'2026-10-02T00:00:00Z',updatedAt:'2026-10-02T00:00:00Z',archivedAt:null});
const graphic=()=>({schemaVersion:1,title:'图文',body:'内容',summary:'',tags:[],ruleSnapshotRef:null,sourceRefs:[],cardBriefs:[{cardId:'page',title:'页',body:'内容',sourceRefs:[]}],imageUses:[]});
const origin={canvasId:'canvas-a',generationLinkId:'link-a',nodeId:'generate-node',attemptId:'attempt-00000000001',inputRevision:2,inputDigest:'a'.repeat(64),taskId:'task-a',resultId:'result-a',executionTaskId:'exec-a',callId:'call-a'};
beforeEach(()=>{f.account='account-a';f.params=new URLSearchParams();sessionStorage.clear();f.accountChanged=null;localStorage.clear();for(const mock of [f.read,f.save,f.tasks,f.selector,f.download,f.confirm,f.localOpen,f.router.push,f.router.replace])mock.mockReset();f.read.mockImplementation(async()=>canvas());f.tasks.mockResolvedValue([]);f.download.mockResolvedValue({url:'/exact-original.png',fileName:'exact-original.png'});f.localOpen.mockReturnValue(true);});afterEach(cleanup);
it('原编辑器从exact selector展示历史file，candidate在原确认前不能放到正式Canvas',async()=>{f.tasks.mockResolvedValue([{id:'link-a',canvasId:'canvas-a',nodeId:'generate-node',attemptId:origin.attemptId,taskId:'task-a',mediaKind:'image',inputRevision:2,resultAssetId:'asset-a',createdAt:'2026-10-02T00:00:00Z'}]);f.selector.mockResolvedValue({status:'available',phase:'candidate',origin,file:{assetId:'asset-a',assetFileId:'original-file'},checksum:'a'.repeat(64),assetType:'image',name:'原结果',assetStatus:'pending',taskStatus:'awaiting_confirmation'});render(<CanvasEditor canvasId="canvas-a"/>);await screen.findByText('最近结果 · 画布版本 2');expect(screen.getByRole('button',{name:'放到画布'})).toBeDisabled();expect(f.download).toHaveBeenCalledWith({params:{assetId:'asset-a',assetFileId:'original-file'},query:undefined,body:undefined});expect(f.confirm).not.toHaveBeenCalled();expect(f.save).not.toHaveBeenCalled();});
it('原canvas初读期间换账号，迟到canvas不能重新渲染旧账号或启原task查询',async()=>{let finish!:(value:unknown)=>void;f.read.mockImplementation(()=>new Promise(r=>{finish=r;}));render(<CanvasEditor canvasId="canvas-a"/>);await waitFor(()=>expect(f.read).toHaveBeenCalledOnce());selectAccount('account-b');act(()=>f.accountChanged?.());await act(async()=>{finish(canvas());});expect(screen.queryByLabelText('画布标题')).toBeNull();expect(f.tasks).not.toHaveBeenCalled();expect(f.router.replace).toHaveBeenCalledWith('/canvases');});
it('保存等待时编导同页弹层仍走本地立即打开，账号变更后迟到save无第二次写',async()=>{let finish!:(value:unknown)=>void;f.save.mockImplementation(()=>new Promise(r=>{finish=r;}));render(<CanvasEditor canvasId="canvas-a"/>);const title=await screen.findByLabelText('画布标题');fireEvent.change(title,{target:{value:'手工标题'}});fireEvent.click(screen.getByRole('button',{name:'保存'}));await waitFor(()=>expect(f.save).toHaveBeenCalledOnce());fireEvent.click(screen.getByRole('button',{name:"编导与详情"}));fireEvent.click(await screen.findByRole('link',{name:'和编导讨论这张画布'}));expect(f.localOpen).toHaveBeenCalledOnce();expect(f.router.push).not.toHaveBeenCalled();selectAccount('account-b');act(()=>f.accountChanged?.());await act(async()=>{finish({...canvas(),title:'手工标题',revision:3});});expect(f.save).toHaveBeenCalledOnce();expect(screen.queryByLabelText('画布标题')).toBeNull();});
it('exact媒体file切换及账号变化不会回写旧URL；缺file诚实不可用',async()=>{let old!:(value:unknown)=>void;f.download.mockImplementationOnce(()=>new Promise(r=>{old=r;}));const view=render(<MediaPreview assetId="asset-a" fileId="old-file" type="image"/>);await waitFor(()=>expect(f.download).toHaveBeenCalledOnce());view.rerender(<MediaPreview assetId="asset-a" fileId="new-file" type="image"/>);await screen.findByAltText('画布图片素材');await act(async()=>{old({url:'/old-url.png',fileName:'old.png'});});expect(screen.getByAltText('画布图片素材')).toHaveAttribute('src','/exact-original.png');view.rerender(<MediaPreview assetId="asset-a" type="image"/>);expect(screen.queryByAltText('画布图片素材')).toBeNull();expect(screen.getByText('预览暂不可用')).toBeInTheDocument();expect(f.download).toHaveBeenCalledTimes(2);});

it('图文返回点击立刻保存dirty内容，收到成功回执才导航',async()=>{f.params=new URLSearchParams({graphicPageContext:'handle'});sessionStorage.setItem('creatoros-graphic-page:account-a:handle',JSON.stringify({accountId:'account-a',projectId:'p',outputId:'o',cardId:'page',baseVersionId:'v1',artifactId:'art',canvasId:'canvas-a',nodeId:'generate-node',expectedFile:null}));f.read.mockResolvedValue({...canvas(),projectId:'p'});let finish!:(v:unknown)=>void;f.save.mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));render(<CanvasEditor canvasId="canvas-a"/>);fireEvent.change(await screen.findByLabelText('画布标题'),{target:{value:'返回前未保存修改'}});fireEvent.click(await screen.findByRole('link',{name:'返回原组图'}));await waitFor(()=>expect(f.save).toHaveBeenCalledOnce());expect(f.save.mock.calls[0]![0].body.title).toBe('返回前未保存修改');expect(f.router.push).not.toHaveBeenCalled();await act(async()=>{finish({...canvas(),projectId:'p',title:'返回前未保存修改',revision:3});});await waitFor(()=>expect(f.router.push).toHaveBeenCalledWith('/projects/p/outputs/o/image'));});
it('图文返回保存失败保留dirty画布且不导航',async()=>{f.params=new URLSearchParams({graphicPageContext:'handle'});sessionStorage.setItem('creatoros-graphic-page:account-a:handle',JSON.stringify({accountId:'account-a',projectId:'p',outputId:'o',cardId:'page',baseVersionId:'v1',artifactId:'art',canvasId:'canvas-a',nodeId:'generate-node',expectedFile:null}));f.read.mockResolvedValue({...canvas(),projectId:'p'});f.save.mockRejectedValue(Error('真实保存失败'));render(<CanvasEditor canvasId="canvas-a"/>);fireEvent.change(await screen.findByLabelText('画布标题'),{target:{value:'未保存标题'}});fireEvent.click(await screen.findByRole('link',{name:'返回原组图'}));await screen.findByText('真实保存失败');expect(f.router.push).not.toHaveBeenCalled();expect(screen.getByLabelText('画布标题')).toHaveValue('未保存标题');});


it('同组切换平台保留共享exact预览，不重复读取文件',async()=>{localStorage.setItem('creatoros:current-group','group-a');const view=render(<MediaPreview assetId="asset-a" fileId="exact-file" type="image"/>);await screen.findByAltText('画布图片素材');await act(async()=>{selectAccount('account-b');window.dispatchEvent(new Event('creatoros:accounts-changed'));});view.rerender(<MediaPreview assetId="asset-a" fileId="exact-file" type="image"/>);expect(screen.getByAltText('画布图片素材')).toHaveAttribute('src','/exact-original.png');expect(f.download).toHaveBeenCalledOnce();});
it('切换账号组立即隐藏旧exact预览，迟到URL不能覆盖新组文件',async()=>{localStorage.setItem('creatoros:current-group','group-a');let finish!:(value:unknown)=>void;f.download.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;})).mockResolvedValueOnce({url:'/new-group.png',fileName:'new.png'});render(<MediaPreview assetId="asset-a" fileId="exact-file" type="image"/>);await waitFor(()=>expect(f.download).toHaveBeenCalledOnce());await act(async()=>{localStorage.setItem('creatoros:current-group','group-b');window.dispatchEvent(new Event('creatoros:accounts-changed'));});await waitFor(()=>expect(screen.getByAltText('画布图片素材')).toHaveAttribute('src','/new-group.png'));await act(async()=>{finish({url:'/old-group.png',fileName:'old.png'});});expect(screen.getByAltText('画布图片素材')).toHaveAttribute('src','/new-group.png');expect(f.download).toHaveBeenCalledTimes(2);});

function selectAccount(account:string){f.account=account;window.localStorage.setItem("creatoros:current-account",account);}

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
  window.localStorage.setItem("creatoros:current-account", "account-a");
});
t1062ScopeAfterEach(() => {
  window.localStorage.removeItem("creatoros:current-group");
  window.localStorage.removeItem("creatoros:current-account");
});
// T1062_UNIT_SCOPE_FIXTURE_END

it('素材卡以真实currentFileId读取exact预览，插入仍返回同一冻结素材',async()=>{
 vi.stubGlobal('IntersectionObserver',undefined);const asset={id:'asset-exact',name:'中性图片',assetType:'image',currentFileId:'file-exact'};
 const inserted=vi.fn();render(<CanvasAssetPicker assets={[asset]} hasMore={false} loadingMore={false} onLoadMore={vi.fn()} onInsert={inserted} onClose={vi.fn()}/>);
 await screen.findByAltText('画布图片素材');expect(f.download).toHaveBeenCalledWith(expect.objectContaining({params:{assetId:'asset-exact',assetFileId:'file-exact'}}));
 fireEvent.click(screen.getByRole('button',{name:/图片 · 中性图片 · 放到画布/}));expect(inserted).toHaveBeenCalledWith(asset);vi.unstubAllGlobals();
});
