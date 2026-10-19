import * as React from 'react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import type {WorkCompositionResource} from '@creatoros/contract';
import {WorkMaterialsPanel} from './work-materials-panel';
const api=vi.hoisted(()=>({listMaterialLinks:vi.fn(),listWorkCompositionMaterials:vi.fn(),getWorkCompositionRequest:vi.fn(),attachWorkCompositionMaterial:vi.fn(),getGraphicPost:vi.fn(),getAsset:vi.fn()}));
vi.mock('@/lib/contract-client',()=>({client:api}));
vi.mock('@/features/projects/work-source-picker',()=>({WorkSourcePicker:()=>null,WorkSourceList:()=>null}));
const composition={compositionId:'composition-a',projectId:'project-a',current:{members:[{member:{kind:'image',outputId:'output-a'}}]}} as WorkCompositionResource;
const body={clientRequestId:'original-request',member:{kind:'image',outputId:'output-a'},target:{kind:'image_card',outputId:'output-a',cardId:'card-a'},expectedOwnerVersion:{kind:'artifact',artifactId:'artifact-a',versionId:'version-a'},file:{assetId:'asset-a',assetFileId:'file-a'},source:null,position:null};
const command={compositionId:'composition-a',operation:'attach',body};
beforeEach(()=>{vi.resetAllMocks();localStorage.clear();api.listMaterialLinks.mockResolvedValue([]);api.listWorkCompositionMaterials.mockResolvedValue([]);});
afterEach(cleanup);
it('默认折叠不读大对象；实际空数据显示0且不猜位置',async()=>{render(<WorkMaterialsPanel composition={composition} accountId="account-a"/>);expect(api.listMaterialLinks).not.toHaveBeenCalled();fireEvent.click(screen.getByText('素材与具体稿面位置'));await waitFor(()=>expect(api.listMaterialLinks).toHaveBeenCalledTimes(1));expect(screen.getByText(/当前可选图片文件 0 个/)).toBeTruthy();expect(screen.getByLabelText('材料目标稿件')).toHaveValue('');expect(api.getGraphicPost).not.toHaveBeenCalled();});
it('刷新恢复先读原完整请求，再重投同body；今日稿面版本不替换冻结版本',async()=>{localStorage.setItem('work-material:account-a:composition-a',JSON.stringify({command}));api.getWorkCompositionRequest.mockResolvedValue({compositionId:'composition-a',operation:'materials.attach',input:body,status:'reserved'});api.attachWorkCompositionMaterial.mockResolvedValue({});render(<WorkMaterialsPanel composition={composition} accountId="account-a"/>);fireEvent.click(await screen.findByText('读取并恢复原材料请求'));await waitFor(()=>expect(api.attachWorkCompositionMaterial).toHaveBeenCalledTimes(1));expect(api.getWorkCompositionRequest.mock.invocationCallOrder[0]).toBeLessThan(api.attachWorkCompositionMaterial.mock.invocationCallOrder[0]!);expect(api.attachWorkCompositionMaterial.mock.calls[0]?.[0].body).toEqual(body);});
it('原回执属于另一组合拒绝，零采用',async()=>{localStorage.setItem('work-material:account-a:composition-a',JSON.stringify({command}));api.getWorkCompositionRequest.mockResolvedValue({compositionId:'other-composition',operation:'materials.attach',input:body,status:'reserved'});render(<WorkMaterialsPanel composition={composition} accountId="account-a"/>);fireEvent.click(await screen.findByText('读取并恢复原材料请求'));await screen.findByRole('alert');expect(api.attachWorkCompositionMaterial).not.toHaveBeenCalled();});
it('采用已确认而刷新失败，只读恢复，不再次写入',async()=>{localStorage.setItem('work-material:account-a:composition-a',JSON.stringify({command}));api.getWorkCompositionRequest.mockResolvedValueOnce({compositionId:'composition-a',operation:'materials.attach',input:body,status:'reserved'}).mockResolvedValue({compositionId:'composition-a',operation:'materials.attach',input:body,status:'committed'});api.attachWorkCompositionMaterial.mockResolvedValue({});api.listWorkCompositionMaterials.mockRejectedValueOnce(Error('refresh failed')).mockResolvedValue([]);render(<WorkMaterialsPanel composition={composition} accountId="account-a"/>);fireEvent.click(await screen.findByText('读取并恢复原材料请求'));await screen.findByText('读取已保存材料与稿件');fireEvent.click(screen.getByText('读取已保存材料与稿件'));await waitFor(()=>expect(screen.queryByText('读取已保存材料与稿件')).not.toBeInTheDocument());expect(api.attachWorkCompositionMaterial).toHaveBeenCalledTimes(1);});
it('scope切换隔离原在途回执；不会写新组合缓存或状态',async()=>{let resolve!:(v:unknown)=>void;localStorage.setItem('work-material:account-a:composition-a',JSON.stringify({command}));api.getWorkCompositionRequest.mockResolvedValue({compositionId:'composition-a',operation:'materials.attach',input:body,status:'reserved'});api.attachWorkCompositionMaterial.mockImplementation(()=>new Promise(r=>resolve=r));const view=render(<WorkMaterialsPanel composition={composition} accountId="account-a"/>);fireEvent.click(await screen.findByText('读取并恢复原材料请求'));await waitFor(()=>expect(api.attachWorkCompositionMaterial).toHaveBeenCalled());view.rerender(<WorkMaterialsPanel composition={{...composition,compositionId:'composition-b'}} accountId="account-a"/>);resolve({});await waitFor(()=>expect(screen.queryByText('读取并恢复原材料请求')).not.toBeInTheDocument());expect(localStorage.getItem('work-material:account-a:composition-b')).toBeNull();expect(api.listWorkCompositionMaterials).not.toHaveBeenCalled();});
it('存储Quota错误不丢当前完整请求，连续点击只一个在途采用',async()=>{localStorage.setItem('work-material:account-a:composition-a',JSON.stringify({command}));api.getWorkCompositionRequest.mockResolvedValue({compositionId:'composition-a',operation:'materials.attach',input:body,status:'reserved'});let reject!:(v:unknown)=>void;api.attachWorkCompositionMaterial.mockImplementation(()=>new Promise((_resolve,r)=>reject=r));render(<WorkMaterialsPanel composition={composition} accountId="account-a"/>);const button=await screen.findByText('读取并恢复原材料请求');const write=vi.spyOn(localStorage,'setItem').mockImplementation(()=>{throw new DOMException('quota','QuotaExceededError');});fireEvent.click(button);fireEvent.click(button);await waitFor(()=>expect(api.attachWorkCompositionMaterial).toHaveBeenCalledTimes(1));reject(Error('ack lost'));await screen.findByRole('alert');expect(screen.getByText(/浏览器存储不可用/)).toBeTruthy();expect(screen.getByText('读取并恢复原材料请求')).toBeTruthy();write.mockRestore();});
it('恢复GET网络失败不扩大成新采用；未知结果仍留原请求',async()=>{localStorage.setItem('work-material:account-a:composition-a',JSON.stringify({command}));api.getWorkCompositionRequest.mockRejectedValue(Error('network'));render(<WorkMaterialsPanel composition={composition} accountId="account-a"/>);fireEvent.click(await screen.findByText('读取并恢复原材料请求'));await screen.findByRole('alert');expect(api.attachWorkCompositionMaterial).not.toHaveBeenCalled();expect(JSON.parse(localStorage.getItem('work-material:account-a:composition-a')!).command.body).toEqual(body);});
it('已知CAS拒绝可明确清本页请求并重新读取位置，原领域记录不删除',async()=>{localStorage.setItem('work-material:account-a:composition-a',JSON.stringify({command}));api.getWorkCompositionRequest.mockResolvedValue({compositionId:'composition-a',operation:'materials.attach',input:body,status:'reserved'});api.attachWorkCompositionMaterial.mockRejectedValue(Object.assign(Error('触点已变'),{code:'ConflictError'}));render(<WorkMaterialsPanel composition={composition} accountId="account-a"/>);fireEvent.click(await screen.findByText('读取并恢复原材料请求'));await screen.findByRole('alert');fireEvent.click(screen.getByText('仅清除此页已拒绝的恢复记录'));expect(localStorage.getItem('work-material:account-a:composition-a')).toBeNull();expect(api.attachWorkCompositionMaterial).toHaveBeenCalledTimes(1);});

it('独立回归：已ACK但读取失败，实际刷新后仍只读，不再重发采用',async()=>{localStorage.setItem('work-material:account-a:composition-a',JSON.stringify({command}));api.getWorkCompositionRequest.mockResolvedValueOnce({compositionId:'composition-a',operation:'materials.attach',input:body,status:'reserved'}).mockResolvedValue({compositionId:'composition-a',operation:'materials.attach',input:body,status:'committed'});api.attachWorkCompositionMaterial.mockResolvedValue({});api.listWorkCompositionMaterials.mockRejectedValueOnce(Error('refresh failed')).mockResolvedValue([]);const first=render(<WorkMaterialsPanel composition={composition} accountId="account-a"/>);fireEvent.click(await screen.findByText('读取并恢复原材料请求'));await screen.findByText('读取已保存材料与稿件');first.unmount();render(<WorkMaterialsPanel composition={composition} accountId="account-a"/>);const recovery=await screen.findByRole('button',{name:/读取.*材料.*稿件|读取并恢复原材料请求/});fireEvent.click(recovery);await waitFor(()=>expect(api.listWorkCompositionMaterials).toHaveBeenCalledTimes(2));expect(api.attachWorkCompositionMaterial).toHaveBeenCalledTimes(1);});

it('旧缓存无ACK但原已提交回执明确成功，只读原稿面',async()=>{localStorage.setItem('work-material:account-a:composition-a',JSON.stringify({command}));api.getWorkCompositionRequest.mockResolvedValue({compositionId:'composition-a',operation:'materials.attach',input:body,status:'committed'});render(<WorkMaterialsPanel composition={composition} accountId="account-a"/>);fireEvent.click(await screen.findByText('读取并恢复原材料请求'));await waitFor(()=>expect(api.listWorkCompositionMaterials).toHaveBeenCalledOnce());expect(api.attachWorkCompositionMaterial).not.toHaveBeenCalled();});

it('独立回归：已卸载的原回执晚到，不复活新窗口已完成并清除的恢复记录',async()=>{localStorage.setItem('work-material:account-a:composition-a',JSON.stringify({command}));let resolve!:(v:unknown)=>void;const receipt={compositionId:'composition-a',operation:'materials.attach',input:body,status:'committed'};api.getWorkCompositionRequest.mockImplementationOnce(()=>new Promise(r=>resolve=r)).mockResolvedValue(receipt);const first=render(<WorkMaterialsPanel composition={composition} accountId="account-a"/>);fireEvent.click(await screen.findByText('读取并恢复原材料请求'));await waitFor(()=>expect(api.getWorkCompositionRequest).toHaveBeenCalledTimes(1));first.unmount();render(<WorkMaterialsPanel composition={composition} accountId="account-a"/>);fireEvent.click(await screen.findByText('读取并恢复原材料请求'));await waitFor(()=>expect(localStorage.getItem('work-material:account-a:composition-a')).toBeNull());resolve(receipt);await Promise.resolve();await Promise.resolve();expect(localStorage.getItem('work-material:account-a:composition-a')).toBeNull();expect(api.attachWorkCompositionMaterial).not.toHaveBeenCalled();});
it('独立回归：缓存已ACK但原回执缺失，只读核对且保留原请求',async()=>{localStorage.setItem('work-material:account-a:composition-a',JSON.stringify({command,ack:true}));api.getWorkCompositionRequest.mockRejectedValue(Object.assign(Error('原回执不可见'),{code:'NotFoundError'}));render(<WorkMaterialsPanel composition={composition} accountId="account-a"/>);fireEvent.click(await screen.findByText('读取已保存材料与稿件'));await screen.findByRole('alert');expect(api.attachWorkCompositionMaterial).not.toHaveBeenCalled();expect(api.listWorkCompositionMaterials).not.toHaveBeenCalled();expect(JSON.parse(localStorage.getItem('work-material:account-a:composition-a')!).command.body).toEqual(body);});

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
