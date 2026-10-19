import '@testing-library/jest-dom/vitest';
import type * as React from 'react';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {render,screen,waitFor,act,cleanup,fireEvent} from '@testing-library/react';
const f=vi.hoisted(()=>({account:'account-a',params:new URLSearchParams(),read:vi.fn()}));
vi.mock('next/navigation',()=>({useSearchParams:()=>f.params}));
vi.mock("@/lib/http-transport", async importOriginal => ({...await importOriginal<typeof import("@/lib/http-transport")>(), readCurrentAccountId:()=>f.account}));
vi.mock('@/lib/contract-client',()=>({client:{getWorkCompositionCanvasContext:(...args:unknown[])=>f.read(...args),listMaterialLinks:async()=>[],listWorkCompositionMaterials:async()=>[]}}));
vi.mock('@/features/projects/work-source-picker',()=>({WorkSourcePicker:({onSelect}:{onSelect:(v:unknown)=>void})=><button onClick={()=>onSelect({kind:'work_basis_version',compositionId:'composition-a',artifactId:'basis-composition-a',versionId:'basis-version-composition-a',selectionDigest:'a'.repeat(64),selection:{mode:'whole'}})}>选择原真实来源</button>,WorkSourceList:()=>null}));
vi.mock('@/features/projects/work-materials-client',()=>({parseMaterialCommand:()=>null,executeMaterial:vi.fn(),readPublicationSlot:vi.fn(),readMaterialSlots:async()=>[{id:'moments:actual',label:'原朋友圈图片位置',member:{kind:'moments',momentsId:'moments-composition-a'},target:{kind:'moments_images',momentsId:'moments-composition-a'},version:{kind:'artifact',artifactId:'artifact-composition-a',versionId:'version-composition-a'},files:[],occupiedUnknown:false,mediaType:'image'}]}));
import {WorkMaterialsPanel} from '@/features/projects/work-materials-panel';
import {CanvasWorkContext,storeWorkCanvasContext} from './work-canvas-context';
import {workCanvasContext} from '@creatoros/contract';
const context=(id:string)=>workCanvasContext.parse({compositionId:id,member:{kind:'moments',momentsId:`moments-${id}`},ownerVersion:{kind:'artifact',artifactId:`artifact-${id}`,versionId:`version-${id}`},source:{kind:'work_basis_version',compositionId:id,artifactId:`basis-${id}`,versionId:`basis-version-${id}`,selectionDigest:'a'.repeat(64),selection:{mode:'whole'}},target:{kind:'moments_images',momentsId:`moments-${id}`},availability:'available',reasonCode:null});
function cache(account:string,project:string,id:string,handle:string){sessionStorage.setItem(`creatoros-work-canvas:${account}:${id}:${handle}`,JSON.stringify({projectId:project,context:context(id)}));f.params=new URLSearchParams({compositionId:id,workContext:handle});}
beforeEach(()=>{f.account='account-a';f.params=new URLSearchParams();f.read.mockReset();sessionStorage.clear();});afterEach(cleanup);
it('已核对scope切换新项目和组合立即隐藏旧成功与旧返回链接，失败仍可独立编辑',async()=>{cache('account-a','project-a','composition-a','handle-a');f.read.mockResolvedValueOnce(context('composition-a'));const view=render(<CanvasWorkContext accountId="account-a" projectId="project-a"/>);await screen.findByText(/已核对原稿/);expect(screen.getByRole('link').getAttribute('href')).toContain('project-a/work?compositionId=composition-a');let reject!:(reason:Error)=>void;f.read.mockImplementationOnce(()=>new Promise((_r,j)=>{reject=j;}));cache('account-a','project-b','composition-b','handle-b');view.rerender(<CanvasWorkContext accountId="account-a" projectId="project-b"/>);expect(screen.queryByText(/已核对原稿/)).toBeNull();expect(screen.queryByRole('link')).toBeNull();await waitFor(()=>expect(f.read).toHaveBeenCalledTimes(2));await act(async()=>{reject(Error('新上下文失效'));});await screen.findByText(/新上下文失效/);expect(screen.queryByRole('link')).toBeNull();});
it('迟到旧账号和handle读取不能覆盖新scope，返回链接只用新真实组合',async()=>{let old!:(value:unknown)=>void;cache('account-a','project-a','composition-a','handle-a');f.read.mockImplementationOnce(()=>new Promise(r=>{old=r;}));const view=render(<CanvasWorkContext accountId="account-a" projectId="project-a"/>);await waitFor(()=>expect(f.read).toHaveBeenCalledOnce());selectAccount('account-b');cache('account-b','project-b','composition-b','handle-b');f.read.mockResolvedValueOnce(context('composition-b'));view.rerender(<CanvasWorkContext accountId="account-b" projectId="project-b"/>);await screen.findByText(/已核对原稿/);await act(async()=>{old(context('composition-a'));});expect(screen.getByRole('link').getAttribute('href')).toBe('/projects/project-b/work?compositionId=composition-b');});
it('相同账号项目组合更换handle不能显示旧success，外来response身份拒绝',async()=>{cache('account-a','project-a','composition-a','handle-a');f.read.mockResolvedValueOnce(context('composition-a'));const view=render(<CanvasWorkContext accountId="account-a" projectId="project-a"/>);await screen.findByText(/已核对原稿/);let next!:(value:unknown)=>void;cache('account-a','project-a','composition-a','handle-b');f.read.mockImplementationOnce(()=>new Promise(r=>{next=r;}));view.rerender(<CanvasWorkContext accountId="account-a" projectId="project-a"/>);expect(screen.queryByRole('link')).toBeNull();await waitFor(()=>expect(f.read).toHaveBeenCalledTimes(2));await act(async()=>{next(context('foreign-composition'));});await screen.findByText(/原作品身份不一致/);expect(screen.queryByRole('link')).toBeNull();});
it('当前账号变化或context移除后不展示已核对，也不会修改正式作品',async()=>{cache('account-a','project-a','composition-a','handle-a');let finish!:(value:unknown)=>void;f.read.mockImplementationOnce(()=>new Promise(r=>{finish=r;}));const view=render(<CanvasWorkContext accountId="account-a" projectId="project-a"/>);await waitFor(()=>expect(f.read).toHaveBeenCalledOnce());selectAccount('account-b');await act(async()=>{finish(context('composition-a'));});await screen.findByText(/工作区已切换/);expect(screen.queryByRole('link')).toBeNull();f.params=new URLSearchParams();view.rerender(<CanvasWorkContext accountId="account-b" projectId="project-b"/>);expect(screen.queryByLabelText('作品画布上下文')).toBeNull();expect(f.read).toHaveBeenCalledOnce();});
it('临时cache URL不携带正文，跨账号存储拒绝',()=>{const href=storeWorkCanvasContext('account-a','project-a',context('composition-a'));expect(href).toMatch(/^\/canvases\?projectId=project-a&compositionId=composition-a&workContext=/);expect(href).not.toContain('basis');selectAccount('account-b');expect(()=>storeWorkCanvasContext('account-a','project-a',context('composition-a'))).toThrow('当前工作区已变化');});

const panelComposition={compositionId:'composition-a',projectId:'project-a',current:{members:[{member:{kind:'moments',momentsId:'moments-composition-a'}}]}} as React.ComponentProps<typeof WorkMaterialsPanel>['composition'];
async function selectPanel(){fireEvent.click(screen.getByText('素材与具体稿面位置'));await screen.findByText(/当前可选图片文件 0 个/);fireEvent.change(screen.getByLabelText('材料目标稿件'),{target:{value:'0'}});await screen.findByRole('option',{name:'原朋友圈图片位置'});fireEvent.change(screen.getByLabelText('材料位置'),{target:{value:'moments:actual'}});fireEvent.click(screen.getByText('明确记录保存稿来源（可选）'));fireEvent.click(screen.getByText('选择原真实来源'));}
it('原Materials panel仅有真实路由port才显示carry；明确选择后核对exact全部body再导航',async()=>{const navigate=vi.fn();f.read.mockResolvedValue(context('composition-a'));render(<WorkMaterialsPanel composition={panelComposition} accountId="account-a" onOpenCanvas={navigate}/>);await selectPanel();fireEvent.click(screen.getByRole('button',{name:'带此稿件、位置与来源进入画布'}));await waitFor(()=>expect(navigate).toHaveBeenCalledOnce());const c=context('composition-a');expect(f.read).toHaveBeenCalledWith({params:{compositionId:'composition-a'},query:undefined,body:{member:c.member,ownerVersion:c.ownerVersion,target:c.target,source:c.source}});expect(navigate.mock.calls[0]![0]).toMatch(/^\/canvases\?projectId=project-a&compositionId=composition-a&workContext=/);});
it('原Materials carry返回foreign上下文或不可用则零缓存/导航，原选择保留',async()=>{const navigate=vi.fn();f.read.mockResolvedValueOnce(context('foreign-composition')).mockResolvedValueOnce({...context('composition-a'),availability:'unavailable',reasonCode:'CANVAS_NOT_ASSEMBLED'});render(<WorkMaterialsPanel composition={panelComposition} accountId="account-a" onOpenCanvas={navigate}/>);await selectPanel();fireEvent.click(screen.getByRole('button',{name:'带此稿件、位置与来源进入画布'}));await screen.findByText('画布上下文不属于原明确稿件与来源');expect(sessionStorage.length).toBe(0);expect(navigate).not.toHaveBeenCalled();fireEvent.click(screen.getByRole('button',{name:'带此稿件、位置与来源进入画布'}));await screen.findByText('画布暂未接通，当前稿件和来源选择保留');expect(navigate).not.toHaveBeenCalled();expect(screen.getByLabelText('材料位置')).toHaveValue('moments:actual');});

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

it('同组平台筛选保留原真实上下文一次核对，切组旧handle零重读',async()=>{
 localStorage.setItem('creatoros:current-group','group-a');const href=storeWorkCanvasContext(null,'project-a',context('composition-a'));f.params=new URLSearchParams(href.split('?')[1]);f.read.mockResolvedValue(context('composition-a'));
 const view=render(<CanvasWorkContext accountId="account-a" projectId="project-a"/>);await screen.findByText(/已核对原稿/);expect(f.read).toHaveBeenCalledOnce();
 await act(async()=>{selectAccount('account-b');window.dispatchEvent(new Event('creatoros:accounts-changed'));});view.rerender(<CanvasWorkContext accountId="account-b" projectId="project-a"/>);expect(screen.getByText(/已核对原稿/)).toBeInTheDocument();expect(screen.getByRole('link').getAttribute('href')).toBe('/projects/project-a/work?compositionId=composition-a');expect(f.read).toHaveBeenCalledOnce();
 await act(async()=>{localStorage.setItem('creatoros:current-group','group-b');window.dispatchEvent(new Event('creatoros:accounts-changed'));});await screen.findByText(/作品上下文不属于此项目/);expect(screen.queryByRole('link')).toBeNull();expect(f.read).toHaveBeenCalledOnce();
});
