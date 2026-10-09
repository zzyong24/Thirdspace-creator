import '@testing-library/jest-dom/vitest';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {render,screen,fireEvent,waitFor,act,cleanup,within} from '@testing-library/react';
const f=vi.hoisted(()=>({account:'account-a',params:new URLSearchParams(),accountChanged:null as null|(()=>void),read:vi.fn(),capabilities:vi.fn(),save:vi.fn(),tasks:vi.fn(),selector:vi.fn(),download:vi.fn(),searchAssets:vi.fn(),generate:vi.fn(),getTask:vi.fn(),confirm:vi.fn(),localOpen:vi.fn(),router:{push:vi.fn(),replace:vi.fn()}}));
vi.mock('next/navigation',()=>({useRouter:()=>f.router,useSearchParams:()=>f.params}));
vi.mock("@/lib/http-transport", async importOriginal => ({...await importOriginal<typeof import("@/lib/http-transport")>(), readCurrentAccountId:()=>f.account}));
vi.mock('@/lib/account-events',()=>({useAccountsChanged:(fn:()=>void)=>{f.accountChanged=fn;}}));
vi.mock('@/lib/copilot-navigation',()=>({openCopilotLocally:(href:string)=>f.localOpen(href)}));
vi.mock('@/lib/contract-client',()=>({client:{getGraphicPost:async()=>({projectId:'p',outputId:'o',artifactId:'art',currentVersionId:'v1',current:graphic()}),getGraphicPostVersion:async()=>({versionId:'v1',document:graphic()}),getProject:async()=>({id:'p',title:'项目'}),listMaterialLinks:async()=>[],getCanvas:(...a:unknown[])=>f.read(...a),saveCanvas:(...a:unknown[])=>f.save(...a),listCanvasNodeTasks:(...a:unknown[])=>f.tasks(...a),listCanvasProposals:async()=>[],listAssets:async()=>[],listProjects:async()=>[],getCanvasGenerationCapabilities:(...a:unknown[])=>f.capabilities(...a),getTask:(...a:unknown[])=>f.getTask(...a),generateCanvasNode:(...a:unknown[])=>f.generate(...a),getCanvasGenerationMaterial:(...a:unknown[])=>f.selector(...a),getAssetFileDownloadUrl:(...a:unknown[])=>f.download(...a),searchAssets:(...a:unknown[])=>f.searchAssets(...a),confirmTask:(...a:unknown[])=>f.confirm(...a)}}));
import {CanvasEditor} from './canvas-editor';
import {MediaPreview} from './infinite-canvas-node';
import {CanvasAssetPicker} from './canvas-asset-picker';
const canvas=()=>({id:'canvas-a',userId:'user-a',accountId:'account-a',title:'原画布',projectId:null,revision:2,document:{schemaVersion:1,viewport:{x:0,y:0,zoom:1},nodes:[{id:'generate-node',type:'image_generation',label:'原生成',position:{x:0,y:0},size:{width:350,height:430},prompt:'原描述',mode:'text_to_image'}],edges:[]},createdAt:'2026-10-02T00:00:00Z',updatedAt:'2026-10-02T00:00:00Z',archivedAt:null});
const graphic=()=>({schemaVersion:1,title:'图文',body:'内容',summary:'',tags:[],ruleSnapshotRef:null,sourceRefs:[],cardBriefs:[{cardId:'page',title:'页',body:'内容',sourceRefs:[]}],imageUses:[]});
const origin={canvasId:'canvas-a',generationLinkId:'link-a',nodeId:'generate-node',attemptId:'attempt-00000000001',inputRevision:2,inputDigest:'a'.repeat(64),taskId:'task-a',resultId:'result-a',executionTaskId:'exec-a',callId:'call-a'};
beforeEach(()=>{f.account='account-a';f.params=new URLSearchParams();sessionStorage.clear();f.accountChanged=null;localStorage.clear();for(const mock of [f.read,f.capabilities,f.save,f.tasks,f.selector,f.download,f.getTask,f.generate,f.confirm,f.localOpen,f.router.push,f.router.replace])mock.mockReset();f.capabilities.mockResolvedValue({modes:[{mode:'text_to_image',available:true,model:'fixture',reason:null}]});f.read.mockImplementation(async()=>canvas());f.tasks.mockResolvedValue([]);f.getTask.mockResolvedValue({status:'awaiting_confirmation',taskType:'asset.generate',executionTaskId:'exec-a',inputData:{prompt:'原生成描述'}});f.download.mockResolvedValue({url:'/exact-original.png',fileName:'exact-original.png'});f.localOpen.mockReturnValue(true);});afterEach(cleanup);
it('原编辑器从exact selector展示历史file，candidate在原确认前不能放到正式Canvas',async()=>{f.tasks.mockResolvedValue([{id:'link-a',canvasId:'canvas-a',nodeId:'generate-node',attemptId:origin.attemptId,taskId:'task-a',mediaKind:'image',inputRevision:2,resultAssetId:'asset-a',createdAt:'2026-10-02T00:00:00Z'}]);f.selector.mockResolvedValue({status:'available',phase:'candidate',origin,file:{assetId:'asset-a',assetFileId:'original-file'},checksum:'a'.repeat(64),assetType:'image',name:'原结果',assetStatus:'pending',taskStatus:'awaiting_confirmation'});render(<CanvasEditor canvasId="canvas-a"/>);await screen.findByText('最近结果 · 画布版本 2');expect(screen.getByRole('button',{name:'放到画布'})).toBeDisabled();expect(f.download).toHaveBeenCalledWith({params:{assetId:'asset-a',assetFileId:'original-file'},query:undefined,body:undefined});expect(f.confirm).not.toHaveBeenCalled();expect(f.save).not.toHaveBeenCalled();});
it('原canvas初读期间换账号，迟到canvas不能重新渲染旧账号或启原task查询',async()=>{let finish!:(value:unknown)=>void;f.read.mockImplementation(()=>new Promise(r=>{finish=r;}));render(<CanvasEditor canvasId="canvas-a"/>);await waitFor(()=>expect(f.read).toHaveBeenCalledOnce());selectAccount('account-b');act(()=>f.accountChanged?.());await act(async()=>{finish(canvas());});expect(screen.queryByLabelText('画布标题')).toBeNull();expect(f.tasks).not.toHaveBeenCalled();expect(f.router.replace).toHaveBeenCalledWith('/canvases');});
it('保存等待时编导同页弹层仍走本地立即打开，账号变更后迟到save无第二次写',async()=>{let finish!:(value:unknown)=>void;f.save.mockImplementation(()=>new Promise(r=>{finish=r;}));render(<CanvasEditor canvasId="canvas-a"/>);const title=await screen.findByLabelText('画布标题');fireEvent.change(title,{target:{value:'手工标题'}});fireEvent.click(screen.getByRole('button',{name:'保存'}));await waitFor(()=>expect(f.save).toHaveBeenCalledOnce());fireEvent.click(screen.getByRole('button',{name:"编导与详情"}));fireEvent.click(await screen.findByRole('link',{name:'和编导讨论这张画布'}));expect(f.localOpen).toHaveBeenCalledOnce();expect(f.router.push).not.toHaveBeenCalled();selectAccount('account-b');act(()=>f.accountChanged?.());await act(async()=>{finish({...canvas(),title:'手工标题',revision:3});});expect(f.save).toHaveBeenCalledOnce();expect(screen.queryByLabelText('画布标题')).toBeNull();});
it('exact媒体file切换及账号变化不会回写旧URL；缺file诚实不可用',async()=>{let old!:(value:unknown)=>void;f.download.mockImplementationOnce(()=>new Promise(r=>{old=r;}));const view=render(<MediaPreview assetId="asset-a" fileId="old-file" type="image"/>);await waitFor(()=>expect(f.download).toHaveBeenCalledOnce());view.rerender(<MediaPreview assetId="asset-a" fileId="new-file" type="image"/>);await screen.findByAltText('画布图片素材');await act(async()=>{old({url:'/old-url.png',fileName:'old.png'});});expect(screen.getByAltText('画布图片素材')).toHaveAttribute('src','/exact-original.png');view.rerender(<MediaPreview assetId="asset-a" type="image"/>);expect(screen.queryByAltText('画布图片素材')).toBeNull();expect(screen.getByText('预览暂不可用')).toBeInTheDocument();expect(f.download).toHaveBeenCalledTimes(2);});

it('图文返回点击立刻保存dirty内容，收到成功回执才导航',async()=>{f.params=new URLSearchParams({graphicPageContext:'handle'});sessionStorage.setItem('creatoros-graphic-page:account-a:handle',JSON.stringify({accountId:'account-a',projectId:'p',outputId:'o',cardId:'page',baseVersionId:'v1',artifactId:'art',canvasId:'canvas-a',nodeId:'generate-node',expectedFile:null}));f.read.mockResolvedValue({...canvas(),projectId:'p'});let finish!:(v:unknown)=>void;f.save.mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));render(<CanvasEditor canvasId="canvas-a"/>);fireEvent.change(await screen.findByLabelText('画布标题'),{target:{value:'返回前未保存修改'}});fireEvent.click(await screen.findByRole('link',{name:'返回原组图'}));await waitFor(()=>expect(f.save).toHaveBeenCalledOnce());expect(f.save.mock.calls[0]![0].body.title).toBe('返回前未保存修改');expect(f.router.push).not.toHaveBeenCalled();await act(async()=>{finish({...canvas(),projectId:'p',title:'返回前未保存修改',revision:3});});await waitFor(()=>expect(f.router.push).toHaveBeenCalledWith('/projects/p/outputs/o/image'));});
it('图文返回保存失败保留dirty画布且不导航',async()=>{f.params=new URLSearchParams({graphicPageContext:'handle'});sessionStorage.setItem('creatoros-graphic-page:account-a:handle',JSON.stringify({accountId:'account-a',projectId:'p',outputId:'o',cardId:'page',baseVersionId:'v1',artifactId:'art',canvasId:'canvas-a',nodeId:'generate-node',expectedFile:null}));f.read.mockResolvedValue({...canvas(),projectId:'p'});f.save.mockRejectedValue(Error('真实保存失败'));render(<CanvasEditor canvasId="canvas-a"/>);fireEvent.change(await screen.findByLabelText('画布标题'),{target:{value:'未保存标题'}});fireEvent.click(await screen.findByRole('link',{name:'返回原组图'}));await screen.findByText('真实保存失败');expect(f.router.push).not.toHaveBeenCalled();expect(screen.getByLabelText('画布标题')).toHaveValue('未保存标题');});
it('网络保存失败用中文反馈并保留修改，用户重试成功才显示已保存',async()=>{
 f.save.mockRejectedValue(new TypeError('Failed to fetch'));render(<CanvasEditor canvasId="canvas-a"/>);
 fireEvent.change(await screen.findByLabelText('画布标题'),{target:{value:'网络失败仍保留的标题'}});fireEvent.click(screen.getByRole('button',{name:'保存'}));
 await screen.findByText('网络连接不稳定,请检查网络后重试。');expect(screen.getByText('保存失败',{exact:true})).toBeInTheDocument();expect(screen.queryByText('Failed to fetch')).toBeNull();
 expect(screen.getByLabelText('画布标题')).toHaveValue('网络失败仍保留的标题');expect(f.router.push).not.toHaveBeenCalled();expect(f.generate).not.toHaveBeenCalled();expect(f.confirm).not.toHaveBeenCalled();
 f.save.mockResolvedValue({...canvas(),title:'网络失败仍保留的标题',revision:3});fireEvent.click(screen.getByRole('button',{name:'保存'}));
 await screen.findByText('已保存',{exact:true});expect(screen.getByLabelText('画布标题')).toHaveValue('网络失败仍保留的标题');expect(f.save.mock.calls.at(-1)![0].body).toMatchObject({expectedRevision:2,title:'网络失败仍保留的标题'});
});


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
 f.searchAssets.mockResolvedValue({items:[asset],nextCursor:null});const inserted=vi.fn();render(<CanvasAssetPicker assets={[asset]} hasMore={false} loadingMore={false} onLoadMore={vi.fn()} onInsert={inserted} onClose={vi.fn()}/>);
 await screen.findByAltText('中性图片');expect(f.download).toHaveBeenCalledWith(expect.objectContaining({params:{assetId:'asset-exact',assetFileId:'file-exact'}}));
 fireEvent.click(screen.getByRole('button',{name:'放到画布'}));await waitFor(()=>expect(inserted).toHaveBeenCalledWith(expect.objectContaining(asset)));vi.unstubAllGlobals();
});

const runningLink=()=>({id:'link-a',canvasId:'canvas-a',nodeId:'generate-node',attemptId:origin.attemptId,taskId:'task-a',mediaKind:'image',inputRevision:2,resultAssetId:null,createdAt:'2026-10-02T00:00:00Z'});
function ratioFailureCanvas(groupRatio:string,taskRatio:string|null){
 const base=canvas(),group={id:'ratio-group',name:'画幅恢复组',libraryKind:'xhs',aspectRatio:groupRatio,caption:'原配文',pageOrder:['generate-node'],templateSnapshot:{id:'ratio-template',name:'原风格',version:1,prompt:'原描述',visualMode:'graphic',requiredIdentity:false},generationAttempts:{'generate-node':origin.attemptId}};
 let persisted={...base,document:{...base.document,visualGroups:[group]}};
 f.read.mockImplementation(async()=>persisted);f.save.mockImplementation(async request=>{persisted={...persisted,revision:persisted.revision+1,document:request.body.document};return persisted;});
 f.tasks.mockResolvedValue([runningLink()]);f.getTask.mockResolvedValue({status:'failed',errorMessage:'原生成失败',inputData:{prompt:'原描述',mode:'text_to_image',...(taskRatio?{aspectRatio:taskRatio}:{})}});
 f.selector.mockResolvedValue({status:'not_ready',reason:'生成失败',canvasId:origin.canvasId,generationLinkId:origin.generationLinkId,nodeId:origin.nodeId,attemptId:origin.attemptId,inputRevision:origin.inputRevision,inputDigest:origin.inputDigest,taskId:origin.taskId});f.generate.mockResolvedValue({...runningLink(),id:'new-ratio-link',taskId:'new-ratio-task'});
 return {before:persisted,read:()=>persisted};
}
it('T1141 旧节点失败页按当前明确组画幅比较，相同新输入可单页重试',async()=>{
 ratioFailureCanvas('3:4','3:4');render(<CanvasEditor canvasId='canvas-a'/>);fireEvent.click(await screen.findByRole('button',{name:/^图文与发布/},{timeout:120000}));
 fireEvent.click(await screen.findByRole('button',{name:'只重试这一页'},{timeout:120000}));
 await waitFor(()=>expect(f.generate.mock.calls.length>0||Boolean(screen.queryByText('这一页的内容已修改。请用节点上的“生成”明确再创作，失败恢复只使用原内容。'))).toBe(true),{timeout:120000});
 expect(f.generate).toHaveBeenCalledOnce();
 expect(f.generate.mock.calls[0]![0].body).toMatchObject({expectedRevision:3});expect(f.generate.mock.calls[0]![0].body.attemptId).not.toBe(origin.attemptId);
 expect(f.save.mock.calls[0]![0].body.document.nodes[0]).not.toHaveProperty('aspectRatio');expect(f.confirm).not.toHaveBeenCalled();
},120000);
it('T1141 组画幅已修改时保留失败原任务，不悄悄再次生成',async()=>{
 const state=ratioFailureCanvas('16:9','3:4');render(<CanvasEditor canvasId='canvas-a'/>);fireEvent.click(await screen.findByRole('button',{name:/^图文与发布/},{timeout:120000}));
 fireEvent.click(await screen.findByRole('button',{name:'只重试这一页'},{timeout:120000}));
 await screen.findByText('这一页的内容已修改。请用节点上的“生成”明确再创作，失败恢复只使用原内容。',{}, {timeout:120000});
 expect(f.generate).not.toHaveBeenCalled();expect(f.save).not.toHaveBeenCalled();expect(state.read()).toEqual(state.before);
},120000);
it('T1141 原失败输入未保存比例时明确再创作，不能把旧null视为当前组比例',async()=>{
 const state=ratioFailureCanvas('3:4',null);render(<CanvasEditor canvasId='canvas-a'/>);fireEvent.click(await screen.findByRole('button',{name:/^图文与发布/},{timeout:120000}));
 fireEvent.click(await screen.findByRole('button',{name:'只重试这一页'},{timeout:120000}));
 await waitFor(()=>expect(f.generate.mock.calls.length>0||Boolean(screen.queryByText('原任务未保存页组画幅，请用节点上的生成按当前画幅重新创作'))).toBe(true),{timeout:120000});
 expect(screen.getByText('原任务未保存页组画幅，请用节点上的生成按当前画幅重新创作')).toBeInTheDocument();
 expect(f.generate).not.toHaveBeenCalled();expect(f.save).not.toHaveBeenCalled();expect(state.read()).toEqual(state.before);expect(f.confirm).not.toHaveBeenCalled();
},120000);
it('生成任务排队及运行时锁定按钮，读取失败也不能再次提交',async()=>{
 f.tasks.mockResolvedValue([runningLink()]);f.getTask.mockResolvedValue({status:'running',inputData:{}});f.selector.mockResolvedValue({status:'unavailable',reason:'生成尚未完成',...origin});
 render(<CanvasEditor canvasId="canvas-a"/>);await waitFor(()=>expect(screen.getByRole('button',{name:'生成中…'})).toBeDisabled());fireEvent.click(screen.getByRole('button',{name:'生成中…'}));expect(f.generate).not.toHaveBeenCalled();
});
it('有候选再次生成先确认，取消无新提交，确认只提交一次',async()=>{
 f.tasks.mockResolvedValue([runningLink()]);f.selector.mockResolvedValue({status:'available',phase:'candidate',origin,file:{assetId:'asset-a',assetFileId:'original-file'},checksum:'a'.repeat(64),assetType:'image',name:'原结果',assetStatus:'pending',taskStatus:'awaiting_confirmation'});
 render(<CanvasEditor canvasId="canvas-a"/>);await screen.findByText('最近结果 · 画布版本 2');fireEvent.click(screen.getByRole('button',{name:'生成'}));await screen.findByRole('dialog',{name:'重新生成图片？'});expect(f.generate).not.toHaveBeenCalled();fireEvent.click(screen.getByRole('button',{name:'取消'}));expect(f.generate).not.toHaveBeenCalled();
});
it('已有连线读取上游候选精确文件填下游默认参考，保留手动参考',async()=>{
 const base=canvas();f.read.mockResolvedValue({...base,document:{...base.document,nodes:[...base.document.nodes,{id:'downstream',type:'video_generation',label:'下游',position:{x:500,y:0},prompt:'镜头',mode:'image_to_video',size:{width:350,height:430}},{id:'manual',type:'image_generation',label:'手选',position:{x:900,y:0},prompt:'手选',mode:'image_to_image',referenceAssetId:'manual-asset',referenceFileId:'manual-file',size:{width:350,height:430}}],edges:[{id:'edge',source:'generate-node',target:'downstream'},{id:'manual-edge',source:'generate-node',target:'manual'}]}});f.save.mockImplementation(async request=>({...base,revision:3,document:request.body.document}));
 f.tasks.mockResolvedValue([runningLink()]);f.selector.mockResolvedValue({status:'available',phase:'candidate',origin,file:{assetId:'asset-a',assetFileId:'original-file'},checksum:'a'.repeat(64),assetType:'image',name:'原结果',assetStatus:'pending',taskStatus:'awaiting_confirmation'});render(<CanvasEditor canvasId="canvas-a"/>);await waitFor(()=>expect(f.download).toHaveBeenCalledWith(expect.objectContaining({params:{assetId:'asset-a',assetFileId:'original-file'}})));fireEvent.click(screen.getByRole('button',{name:'保存'}));await waitFor(()=>expect(f.save).toHaveBeenCalled());const nodes=f.save.mock.calls.at(-1)![0].body.document.nodes;expect(nodes.find((n:any)=>n.id==='downstream')).toMatchObject({referenceAssetId:'asset-a',referenceFileId:'original-file',mode:'image_to_video'});expect(nodes.find((n:any)=>n.id==='manual')).toMatchObject({referenceAssetId:'manual-asset',referenceFileId:'manual-file'});expect(f.confirm).not.toHaveBeenCalled();
});
it('画布素材缩略图不显示名称和规格，保留可访问预览与选用',async()=>{
 vi.stubGlobal('IntersectionObserver',undefined);const asset={id:'a',name:'很长的图片文件名.jpg',assetType:'image',currentFileId:'f'};f.searchAssets.mockResolvedValue({items:[asset],nextCursor:null});render(<CanvasAssetPicker assets={[]} hasMore={false} loadingMore={false} onLoadMore={vi.fn()} onInsert={vi.fn()} onClose={vi.fn()}/>);await screen.findByRole('button',{name:'预览 很长的图片文件名.jpg'});expect(screen.queryByText('很长的图片文件名.jpg')).toBeNull();expect(screen.getByRole('button',{name:'放到画布'})).toBeEnabled();vi.unstubAllGlobals();
});

it('41条旧终态不锁死合法节点，也不把历史预览限制当作在途真相',async()=>{f.tasks.mockResolvedValue(Array.from({length:41},(_,i)=>({...runningLink(),id:'link-'+i,taskId:'task-'+i,attemptId:'old-attempt-'+i})));f.getTask.mockResolvedValue({status:'failed',inputData:{}});f.selector.mockRejectedValue(Error('无可读结果'));render(<CanvasEditor canvasId='canvas-a'/>);await waitFor(()=>expect(f.getTask).toHaveBeenCalledTimes(41));await waitFor(()=>expect(screen.getByRole('button',{name:/^生成$/})).toBeEnabled());});
it('未知提交保留原attempt，核对入口复用同键；明确预约前拒绝释放按钮',async()=>{f.generate.mockRejectedValueOnce(Error('未知网络回执')).mockRejectedValueOnce(Object.assign(Error('原输入已编辑'),{status:409}));render(<CanvasEditor canvasId='canvas-a'/>);await waitFor(()=>expect(screen.getByRole('button',{name:/^生成$/})).toBeEnabled());fireEvent.click(screen.getByRole('button',{name:/^生成$/}));await screen.findByText('未知网络回执');const first=f.generate.mock.calls[0]![0].body;fireEvent.click(screen.getByRole('button',{name:'编导与详情'}));fireEvent.click(await screen.findByRole('button',{name:/核对原提交/}));await screen.findByText('原输入已编辑');expect(f.generate.mock.calls[1]![0].body).toEqual(first);await waitFor(()=>expect(screen.getAllByRole('button',{name:/^生成$/})[0]).toBeEnabled());});

it('连线默认参考只填一次，用户切回文生图不会被强制改回',async()=>{const base=canvas();f.read.mockResolvedValue({...base,document:{...base.document,nodes:[{id:'source',type:'image',label:'图片',assetId:'source-asset',fileId:'source-file',position:{x:0,y:0}},...base.document.nodes],edges:[{id:'explicit-edge',source:'source',target:'generate-node'}]}});f.save.mockImplementation(async request=>({...base,revision:3,document:request.body.document}));render(<CanvasEditor canvasId='canvas-a'/>);const mode=await screen.findByRole('combobox',{name:'生成模式'});await waitFor(()=>expect(mode).toHaveValue('image_to_image'));fireEvent.change(mode,{target:{value:'text_to_image'}});await waitFor(()=>expect(mode).toHaveValue('text_to_image'));expect(f.confirm).not.toHaveBeenCalled();});

it('41条历史的旧候选仍可按需读取原文件，后续状态刷新保留原selection',async()=>{
 const rows=Array.from({length:41},(_,i)=>({...runningLink(),id:'link-'+i,taskId:'task-'+i,attemptId:'old-attempt-'+i}));
 f.tasks.mockResolvedValue(rows);f.getTask.mockImplementation(async request=>({status:request.params.taskId==='task-0'?'running':'awaiting_confirmation',inputData:{}}));f.selector.mockImplementation(async request=>({status:'not_ready',reason:'无可读结果',canvasId:'canvas-a',generationLinkId:request.params.generationLinkId,nodeId:'generate-node',taskId:'task-'+request.params.generationLinkId.slice(5),attemptId:'old-attempt-'+request.params.generationLinkId.slice(5),inputRevision:2,inputDigest:'a'.repeat(64)}));
 render(<CanvasEditor canvasId='canvas-a'/>);await waitFor(()=>expect(f.getTask).toHaveBeenCalledTimes(41));fireEvent.click(screen.getByRole('button',{name:/^编导与详情/}));
 const button=await screen.findByRole('button',{name:'读取这一生成的原文件'});
 f.selector.mockResolvedValue({status:'available',phase:'candidate',origin:{...origin,generationLinkId:'link-40',taskId:'task-40',attemptId:'old-attempt-40'},file:{assetId:'asset-a',assetFileId:'old-exact-file'},checksum:'a'.repeat(64),assetType:'image',name:'旧结果',assetStatus:'pending',taskStatus:'awaiting_confirmation'});
 fireEvent.click(button);await screen.findByRole('button',{name:'下载结果'});expect(f.selector).toHaveBeenLastCalledWith(expect.objectContaining({params:{canvasId:'canvas-a',generationLinkId:'link-40'}}));
 await waitFor(()=>expect(f.getTask.mock.calls.length).toBeGreaterThan(42),{timeout:120_000});expect(screen.getByRole('button',{name:'下载结果'})).toBeEnabled();
},120_000);

// T1108：正式保存回执与持久引用选择；原测试正文不改。
const referenceChoiceKey='creatoros-canvas-references:account:account-a:canvas-a';
// T1149：只替换本文件既有业务端口，原workspace生命周期与全部断言保留。
function aspectGroupCanvas(ratio='3:4',selectedMode='text_to_image'){
 const base=canvas();let persisted:any={...base,document:{...base.document,nodes:[
  {...base.document.nodes[0],mode:selectedMode,...(selectedMode==='image_to_image'?{referenceAssetId:'manual-asset',referenceFileId:'manual-exact'}:{})},
  {...base.document.nodes[0],id:'peer-node',label:'组内参考页',position:{x:500,y:0},mode:'image_to_image',referenceAssetId:'peer-asset',referenceFileId:'peer-exact',prompt:'组内描述',aspectRatio:ratio},
  {id:'static-node',type:'image',label:'静态原图',position:{x:900,y:0},size:{width:380,height:300},assetId:'static-asset',fileId:'static-exact'},
  {...base.document.nodes[0],id:'outside-node',label:'另一组',position:{x:1300,y:0},aspectRatio:'16:9',prompt:'组外描述'}],
  edges:[{id:'unchanged-edge',source:'generate-node',target:'outside-node'}],visualGroups:[
  {id:'aspect-group',name:'统一画幅组',libraryKind:'xhs',aspectRatio:ratio,caption:'保留配文',pageOrder:['generate-node','peer-node','static-node'],templateSnapshot:{id:'template-a',name:'原风格',version:1,prompt:'原描述',visualMode:'graphic',requiredIdentity:false},generationAttempts:{}},
  {id:'outside-group',name:'另一组',libraryKind:'xhs',aspectRatio:'16:9',caption:'另一配文',pageOrder:['outside-node'],templateSnapshot:{id:'template-b',name:'另一风格',version:1,prompt:'另描述',visualMode:'graphic',requiredIdentity:false},generationAttempts:{}}]}};
 const before=structuredClone(persisted);f.read.mockImplementation(async()=>persisted);f.save.mockImplementation(async request=>{persisted={...persisted,title:request.body.title,revision:persisted.revision+1,document:request.body.document};return persisted;});
 f.searchAssets.mockResolvedValue({items:[],nextCursor:null});f.generate.mockImplementation(async request=>({...runningLink(),nodeId:request.params.nodeId,taskId:'task-'+request.params.nodeId,attemptId:request.body.attemptId}));
 return {before,read:()=>persisted};
}
function aspectCapabilities(text:string[]|undefined=['3:4','16:9'],image:string[]|undefined=['3:4','16:9']){return {modes:[{mode:'text_to_image',available:true,model:'text-fixture',reason:null,...(text?{aspectRatios:text}:{})},{mode:'image_to_image',available:true,model:'image-fixture',reason:null,...(image?{aspectRatios:image}:{})}]};}
async function aspectInspector(){const nodes=await screen.findAllByTestId('canvas-node',{}, {timeout:120000});const selected=nodes.find(el=>el.dataset.nodeId==='generate-node')!;fireEvent.pointerDown(selected);fireEvent.click(screen.getByRole('button',{name:'编导与详情'}));return screen.findByRole('combobox',{name:'画幅'},{timeout:120000});}
it('T1149 用户改一页画幅后整组图片一致，静态与组外内容精确保留',async()=>{
 const state=aspectGroupCanvas();f.capabilities.mockResolvedValue(aspectCapabilities());render(<CanvasEditor canvasId='canvas-a'/>);const ratio=await aspectInspector();fireEvent.change(ratio,{target:{value:'16:9'}});fireEvent.click(screen.getByRole('button',{name:'保存'}));await screen.findByText('已保存',{exact:true},{timeout:120000});
 const saved=state.read().document;expect(saved.visualGroups[0]).toEqual({...state.before.document.visualGroups[0],aspectRatio:'16:9'});expect(saved.nodes.filter((x:any)=>['generate-node','peer-node'].includes(x.id)).map((x:any)=>x.aspectRatio)).toEqual(['16:9','16:9']);
 expect(saved.nodes.find((x:any)=>x.id==='static-node')).toEqual(state.before.document.nodes[2]);expect(saved.nodes.find((x:any)=>x.id==='outside-node')).toEqual(state.before.document.nodes[3]);expect(saved.visualGroups[1]).toEqual(state.before.document.visualGroups[1]);expect(saved.edges).toEqual(state.before.document.edges);
 for(const node of saved.nodes.slice(0,2))expect(node).toEqual({...state.before.document.nodes.find((x:any)=>x.id===node.id),aspectRatio:'16:9'});expect(state.read().revision).toBe(3);expect(f.save).toHaveBeenCalledOnce();expect(f.generate).not.toHaveBeenCalled();expect(f.confirm).not.toHaveBeenCalled();
},120000);
it('T1149 比例取全部生成页能力交集，拒绝不支持与组内空值后仍能保存原文档',async()=>{
 const state=aspectGroupCanvas();f.capabilities.mockResolvedValue(aspectCapabilities(['1:1','3:4','16:9'],['3:4','16:9']));render(<CanvasEditor canvasId='canvas-a'/>);const ratio=await aspectInspector();expect(within(ratio).getByRole('option',{name:/^1:1/})).toBeDisabled();
 fireEvent.change(ratio,{target:{value:'1:1'}});expect(ratio).toHaveValue('3:4');fireEvent.change(ratio,{target:{value:''}});expect(ratio).toHaveValue('3:4');expect(within(ratio).queryByRole('option',{name:'模型默认'})).toBeNull();
 fireEvent.change(screen.getByLabelText('画布标题'),{target:{value:'原文档仍可保存'}});fireEvent.click(screen.getByRole('button',{name:'保存'}));await screen.findByText('已保存',{exact:true},{timeout:120000});expect(state.read().document).toEqual(state.before.document);expect(f.save).toHaveBeenCalledOnce();expect(f.generate).not.toHaveBeenCalled();
},120000);
it.each(['节点卡','Inspector'])('T1149 %s切换不支持组画幅的模式时原引用与模式不变',async entry=>{
 const state=aspectGroupCanvas('16:9','image_to_image');f.capabilities.mockResolvedValue(aspectCapabilities(['3:4'],['3:4','16:9']));render(<CanvasEditor canvasId='canvas-a'/>);
 const card=await screen.findAllByTestId('canvas-node',{}, {timeout:120000});const node=card.find(el=>el.dataset.nodeId==='generate-node')!;let mode=within(node).getByRole('combobox',{name:'生成模式'});
 if(entry==='Inspector'){await aspectInspector();mode=screen.getByRole('combobox',{name:'模式'});}
 fireEvent.change(mode,{target:{value:'text_to_image'}});expect(mode).toHaveValue('image_to_image');fireEvent.change(screen.getByLabelText('画布标题'),{target:{value:'拒绝切换后保存'}});fireEvent.click(screen.getByRole('button',{name:'保存'}));await screen.findByText('已保存',{exact:true},{timeout:120000});expect(state.read().document).toEqual(state.before.document);expect(state.read().document.nodes[0]).toMatchObject({mode:'image_to_image',referenceAssetId:'manual-asset',referenceFileId:'manual-exact'});expect(f.generate).not.toHaveBeenCalled();
},120000);
it('T1149 未明确支持比例与晚到能力不阻断合法保存或偷偷改写已选画幅',async()=>{
 const state=aspectGroupCanvas();let finish!:(v:unknown)=>void;f.capabilities.mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));render(<CanvasEditor canvasId='canvas-a'/>);const ratio=await aspectInspector();fireEvent.change(ratio,{target:{value:'16:9'}});fireEvent.click(screen.getByRole('button',{name:'保存'}));await screen.findByText('已保存',{exact:true},{timeout:120000});expect(state.read().document.visualGroups[0].aspectRatio).toBe('16:9');
 await act(async()=>{finish(aspectCapabilities(['3:4'],['3:4']));});expect(ratio).toHaveValue('16:9');fireEvent.change(screen.getByLabelText('画布标题'),{target:{value:'能力晚到仍保输入'}});fireEvent.click(screen.getByRole('button',{name:'保存'}));await screen.findByText('已保存',{exact:true},{timeout:120000});expect(state.read().document.visualGroups[0].aspectRatio).toBe('16:9');expect(state.read().document.nodes[0].aspectRatio).toBe('16:9');expect(f.save).toHaveBeenCalledTimes(2);expect(f.generate).not.toHaveBeenCalled();
},120000);
it('T1149 组内新生成只跳过明确不支持的页，合法页仍提交且不创建幽灵attempt',async()=>{
 const state=aspectGroupCanvas('16:9');f.capabilities.mockResolvedValue(aspectCapabilities(['3:4'],['16:9']));render(<CanvasEditor canvasId='canvas-a'/>);fireEvent.click(await screen.findByRole('button',{name:/^图文与发布/},{timeout:120000}));fireEvent.change(await screen.findByRole('combobox',{name:'选择封面或图文页组'},{timeout:120000}),{target:{value:'aspect-group'}});fireEvent.click(screen.getByRole('button',{name:'生成未完成页'}));
 await waitFor(()=>expect(f.generate.mock.calls.length).toBeGreaterThan(0),{timeout:120000});await waitFor(()=>expect(screen.getByRole('button',{name:'生成未完成页'})).toBeEnabled(),{timeout:120000});expect(f.generate).toHaveBeenCalledOnce();expect(f.generate.mock.calls[0]![0].params.nodeId).toBe('peer-node');const attempts=state.read().document.visualGroups[0].generationAttempts;expect(attempts).not.toHaveProperty('generate-node');expect(attempts['peer-node']).toBeTruthy();expect(screen.getByRole('alert')).toHaveTextContent('1 页的当前模型不支持其画幅，尚未提交');expect(state.read().document.visualGroups[1]).toEqual(state.before.document.visualGroups[1]);expect(f.confirm).not.toHaveBeenCalled();
},120000);
it.each(['节点卡','Inspector'])('T1149 %s合法切换模式仍沿原逻辑清除手选引用且不改其它页',async entry=>{
 const state=aspectGroupCanvas('3:4','image_to_image');f.capabilities.mockResolvedValue(aspectCapabilities());render(<CanvasEditor canvasId='canvas-a'/>);
 const nodes=await screen.findAllByTestId('canvas-node',{}, {timeout:120000}),node=nodes.find(el=>el.dataset.nodeId==='generate-node')!;let mode=within(node).getByRole('combobox',{name:'生成模式'});
 if(entry==='Inspector'){await aspectInspector();mode=screen.getByRole('combobox',{name:'模式'});}
 fireEvent.change(mode,{target:{value:'text_to_image'}});expect(mode).toHaveValue('text_to_image');fireEvent.click(screen.getByRole('button',{name:'保存'}));await screen.findByText('已保存',{exact:true},{timeout:120000});
 expect(state.read().document.nodes[0]).toEqual({...state.before.document.nodes[0],mode:'text_to_image',referenceAssetId:undefined,referenceFileId:undefined});expect(state.read().document.nodes.slice(1)).toEqual(state.before.document.nodes.slice(1));expect(state.read().document.visualGroups).toEqual(state.before.document.visualGroups);expect(f.generate).not.toHaveBeenCalled();
},120000);
it('T1149 组外仍可选模型默认，不联动任何图片页组',async()=>{
 const base={...canvas(),document:{...canvas().document,nodes:[{...canvas().document.nodes[0],aspectRatio:'3:4'}]}};f.read.mockResolvedValue(base);f.save.mockImplementation(async request=>({...base,revision:3,document:request.body.document}));render(<CanvasEditor canvasId='canvas-a'/>);
 const ratio=await aspectInspector();expect(within(ratio).getByRole('option',{name:'模型默认'})).toBeEnabled();fireEvent.change(ratio,{target:{value:''}});expect(ratio).toHaveValue('');fireEvent.click(screen.getByRole('button',{name:'保存'}));await screen.findByText('已保存',{exact:true},{timeout:120000});expect(f.save.mock.calls[0]![0].body.document.nodes[0].aspectRatio).toBeUndefined();expect(f.generate).not.toHaveBeenCalled();
},120000);
it('T1149 全部新页明确不支持时不保存attempt、不提交，保留原文档并给出操作提示',async()=>{
 const state=aspectGroupCanvas('16:9');f.capabilities.mockResolvedValue(aspectCapabilities(['3:4'],['3:4']));render(<CanvasEditor canvasId='canvas-a'/>);fireEvent.click(await screen.findByRole('button',{name:/^图文与发布/},{timeout:120000}));fireEvent.change(screen.getByRole('combobox',{name:'选择封面或图文页组'}),{target:{value:'aspect-group'}});fireEvent.click(screen.getByRole('button',{name:'生成未完成页'}));
 expect(screen.getByRole('alert')).toHaveTextContent('2 页的当前模型不支持其画幅，尚未提交');expect(state.read().document).toEqual(state.before.document);expect(f.save).not.toHaveBeenCalled();expect(f.generate).not.toHaveBeenCalled();
},120000);
it('T1149 能力变化不重发在途页，混合组只提交新的合法页',async()=>{
 const state=aspectGroupCanvas('16:9');f.capabilities.mockResolvedValue(aspectCapabilities(['3:4'],['16:9']));f.tasks.mockResolvedValue([runningLink()]);f.getTask.mockResolvedValue({status:'queued',inputData:{prompt:'原描述',mode:'text_to_image',aspectRatio:'16:9'}});f.selector.mockResolvedValue({status:'not_ready',reason:'排队中',...origin});
 render(<CanvasEditor canvasId='canvas-a'/>);await screen.findByText('排队中…',{}, {timeout:120000});fireEvent.click(screen.getByRole('button',{name:/^图文与发布/}));fireEvent.change(screen.getByRole('combobox',{name:'选择封面或图文页组'}),{target:{value:'aspect-group'}});fireEvent.click(screen.getByRole('button',{name:'生成未完成页'}));await waitFor(()=>expect(f.generate).toHaveBeenCalledOnce(),{timeout:120000});await waitFor(()=>expect(screen.getByRole('button',{name:'生成未完成页'})).toBeEnabled(),{timeout:120000});expect(f.generate.mock.calls[0]![0].params.nodeId).toBe('peer-node');expect(state.read().document.nodes[0]).toEqual(state.before.document.nodes[0]);expect(state.read().document.visualGroups[0].generationAttempts).not.toHaveProperty('generate-node');expect(f.confirm).not.toHaveBeenCalled();
},120000);
function linkedReferenceCanvas(withFile=true){const base=canvas();return {...base,document:{...base.document,nodes:[{id:'reference-source',type:'image',label:'上游图片',assetId:'source-asset',...(withFile?{fileId:'source-file'}:{}),position:{x:500,y:0}},...base.document.nodes],edges:[{id:'reference-edge',source:'reference-source',target:'generate-node'}]}};}
it('T1108 自动引用保存失败不预记完成，重开按正式画布再保存exact文件',async()=>{
 const base=linkedReferenceCanvas();f.read.mockResolvedValue(base);f.save.mockRejectedValue(Error('中断保存'));
 const view=render(<CanvasEditor canvasId='canvas-a'/>);const mode=await screen.findByRole('combobox',{name:'生成模式'},{timeout:120000});await waitFor(()=>expect(mode).toHaveValue('image_to_image'),{timeout:120000});fireEvent.click(screen.getByRole('button',{name:'保存'}));await screen.findByText('中断保存',{}, {timeout:120000});expect(localStorage.getItem(referenceChoiceKey)).toBeNull();
 view.unmount();f.save.mockReset();f.save.mockImplementation(async request=>({...base,revision:3,document:request.body.document}));render(<CanvasEditor canvasId='canvas-a'/>);const reopened=await screen.findByRole('combobox',{name:'生成模式'},{timeout:120000});await waitFor(()=>expect(reopened).toHaveValue('image_to_image'),{timeout:120000});fireEvent.click(screen.getByRole('button',{name:'保存'}));await screen.findByText('已保存',{}, {timeout:120000});expect(f.save.mock.calls[0]![0].body.document.nodes.find((n:any)=>n.id==='generate-node')).toMatchObject({referenceAssetId:'source-asset',referenceFileId:'source-file'});expect(f.generate).not.toHaveBeenCalled();expect(f.confirm).not.toHaveBeenCalled();
});
it('T1108 已成功保存的手动空引用和文生模式重开保留',async()=>{
 const base=linkedReferenceCanvas();let saved:any;f.read.mockResolvedValue(base);f.save.mockImplementation(async request=>(saved={...base,revision:3,document:request.body.document}));const view=render(<CanvasEditor canvasId='canvas-a'/>);const mode=await screen.findByRole('combobox',{name:'生成模式'},{timeout:120000});await waitFor(()=>expect(mode).toHaveValue('image_to_image'),{timeout:120000});fireEvent.change(mode,{target:{value:'text_to_image'}});fireEvent.click(screen.getByRole('button',{name:'保存'}));await screen.findByText('已保存',{}, {timeout:120000});expect(saved.document.nodes.find((n:any)=>n.id==='generate-node').referenceAssetId).toBeUndefined();view.unmount();f.read.mockResolvedValue(saved);f.save.mockClear();render(<CanvasEditor canvasId='canvas-a'/>);expect(await screen.findByRole('combobox',{name:'生成模式'},{timeout:120000})).toHaveValue('text_to_image');await act(async()=>{});expect(f.save).not.toHaveBeenCalled();expect(f.confirm).not.toHaveBeenCalled();
});
it('T1108 旧抑制不猜清空意图，明确使用连线参考才恢复',async()=>{
 const base=linkedReferenceCanvas();localStorage.setItem(referenceChoiceKey,JSON.stringify(['reference-edge']));f.read.mockResolvedValue(base);f.save.mockImplementation(async request=>({...base,revision:3,document:request.body.document}));render(<CanvasEditor canvasId='canvas-a'/>);const mode=await screen.findByRole('combobox',{name:'生成模式'},{timeout:120000});expect(mode).toHaveValue('text_to_image');fireEvent.click(screen.getByRole('button',{name:'编导与详情'}));fireEvent.click(screen.getByRole('button',{name:'使用连线参考'}));await waitFor(()=>expect(mode).toHaveValue('image_to_image'),{timeout:120000});fireEvent.click(screen.getByRole('button',{name:'保存'}));await screen.findByText('已保存',{}, {timeout:120000});expect(f.save.mock.calls[0]![0].body.document.nodes.find((n:any)=>n.id==='generate-node')).toMatchObject({referenceFileId:'source-file'});expect(f.generate).not.toHaveBeenCalled();expect(f.confirm).not.toHaveBeenCalled();
});
it('T1108 旧连线原图不可用时保留原抑制和文生模式',async()=>{
 const base=linkedReferenceCanvas(false);localStorage.setItem(referenceChoiceKey,JSON.stringify(['reference-edge']));f.read.mockResolvedValue(base);render(<CanvasEditor canvasId='canvas-a'/>);const mode=await screen.findByRole('combobox',{name:'生成模式'},{timeout:120000});fireEvent.click(screen.getByRole('button',{name:'编导与详情'}));fireEvent.click(screen.getByRole('button',{name:'使用连线参考'}));expect(screen.getByText('这条连线的原图片尚不可用，请读取生成状态后再试。')).toBeInTheDocument();expect(mode).toHaveValue('text_to_image');expect(JSON.parse(localStorage.getItem(referenceChoiceKey)!)).toEqual(['reference-edge']);expect(f.save).not.toHaveBeenCalled();expect(f.generate).not.toHaveBeenCalled();
});
it('T1108 跨账号迟到save回执不写引用标记',async()=>{
 const base=linkedReferenceCanvas();let finish!:(v:any)=>void;f.read.mockResolvedValue(base);f.save.mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));render(<CanvasEditor canvasId='canvas-a'/>);await screen.findByRole('combobox',{name:'生成模式'},{timeout:120000});fireEvent.click(screen.getByRole('button',{name:'保存'}));await waitFor(()=>expect(f.save).toHaveBeenCalledOnce(),{timeout:120000});selectAccount('account-b');act(()=>f.accountChanged?.());await act(async()=>{finish({...base,revision:3,document:f.save.mock.calls[0]![0].body.document});});expect(localStorage.getItem(referenceChoiceKey)).toBeNull();expect(f.save).toHaveBeenCalledOnce();
});
it('T1108 新标记与正式输入不匹配时不能抑制默认引用',async()=>{
 const base=linkedReferenceCanvas();const fingerprint=JSON.stringify(['reference-edge','reference-source','generate-node','image_generation','image_to_image','other-asset','other-file']);localStorage.setItem(referenceChoiceKey,JSON.stringify({schema:'canvas-reference-choices/v1',revision:3,resolved:[fingerprint],legacy:[]}));f.read.mockResolvedValue(base);f.save.mockImplementation(async request=>({...base,revision:3,document:request.body.document}));render(<CanvasEditor canvasId='canvas-a'/>);const mode=await screen.findByRole('combobox',{name:'生成模式'},{timeout:120000});await waitFor(()=>expect(mode).toHaveValue('image_to_image'),{timeout:120000});fireEvent.click(screen.getByRole('button',{name:'保存'}));await screen.findByText('已保存',{}, {timeout:120000});expect(f.save.mock.calls[0]![0].body.document.nodes.find((n:any)=>n.id==='generate-node')).toMatchObject({referenceFileId:'source-file'});
});
