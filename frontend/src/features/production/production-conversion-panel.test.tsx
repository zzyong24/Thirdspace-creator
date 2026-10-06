import * as React from "react";
import {cleanup,fireEvent,render,screen,waitFor} from "@testing-library/react";
import {afterEach,beforeEach,expect,it,vi} from "vitest";
import type {ProductionEditorDocument} from "@creatoros/contract";
const api=vi.hoisted(()=>({getProductionEditorReceipt:vi.fn(),getAsset:vi.fn(),prepareProductionEditorSource:vi.fn(),getProductionEditorSource:vi.fn(),prepareProductionEditorConversion:vi.fn(),adoptProductionEditorConversion:vi.fn()}));
vi.mock("@/lib/contract-client",()=>({client:api}));vi.mock("./production-resource-operations",()=>({uploadProductionAsset:vi.fn()}));
import {ProductionConversionPanel} from "./production-conversion-panel";
const doc=(revision=3)=>({outputId:"output-a",projectId:"project-a",productionId:"prod-a",revision,state:"legacy",unsupportedFields:[],plan:{renderProps:{talkingHead:{file:"asset-a"}}}} as ProductionEditorDocument);
const candidate={requestId:"conversion-request-a",conversionDigest:`sha256:${"a".repeat(64)}`,baseRevision:3,plan:{mainTrack:{clips:[]},overlayDraft:{scenes:[]}},warnings:["旧方案完整留存"]};
beforeEach(()=>{sessionStorage.clear();Object.values(api).forEach(fn=>fn.mockReset());});afterEach(cleanup);
it("候选准备丢回复后刷新复用原完整请求，不写旧方案",async()=>{api.prepareProductionEditorConversion.mockRejectedValueOnce(Error("丢回复"));const first=render(<ProductionConversionPanel document={doc()} onSaved={vi.fn()}/>);fireEvent.click(screen.getByRole("button",{name:"核对无主口播方案"}));await screen.findByRole("alert");const body=api.prepareProductionEditorConversion.mock.calls[0][0];first.unmount();api.prepareProductionEditorConversion.mockResolvedValue(candidate);render(<ProductionConversionPanel document={doc(4)} onSaved={vi.fn()}/>);fireEvent.click(await screen.findByRole("button",{name:"恢复原转换候选"}));await screen.findByText("旧方案完整留存");expect(api.prepareProductionEditorConversion.mock.calls[1][0]).toEqual(body);expect(body.body.expectedRevision).toBe(3);expect(api.adoptProductionEditorConversion).not.toHaveBeenCalled();});
it("采纳丢回复后刷新复用digest、原revision与请求号",async()=>{api.prepareProductionEditorConversion.mockResolvedValue(candidate);api.adoptProductionEditorConversion.mockRejectedValueOnce(Error("丢回复"));const first=render(<ProductionConversionPanel document={doc()} onSaved={vi.fn()}/>);fireEvent.click(screen.getByRole("button",{name:"核对无主口播方案"}));fireEvent.click(await screen.findByRole("button",{name:"采纳转换并打开粗剪"}));await screen.findByRole("alert");const original=api.adoptProductionEditorConversion.mock.calls[0][0];first.unmount();const onSaved=vi.fn();api.adoptProductionEditorConversion.mockResolvedValue({revision:4});render(<ProductionConversionPanel document={doc(5)} onSaved={onSaved}/>);fireEvent.click(await screen.findByRole("button",{name:"恢复原转换采纳"}));await waitFor(()=>expect(onSaved).toHaveBeenCalledOnce());expect(api.adoptProductionEditorConversion.mock.calls[1][0]).toEqual(original);expect(original.body).toMatchObject({expectedRevision:3,conversionDigest:candidate.conversionDigest});});
it("原片冻结后刷新保留旧版本，读取不重新准备探针",async()=>{api.getAsset.mockResolvedValue({currentFileId:"file-a"});api.prepareProductionEditorSource.mockResolvedValue({status:"queued"});const first=render(<ProductionConversionPanel document={doc()} onSaved={vi.fn()}/>);fireEvent.click(screen.getByRole("button",{name:"核对旧方案当前原片"}));await screen.findByText("原片核验：等待核验");const source=api.prepareProductionEditorSource.mock.calls[0][0];first.unmount();api.getProductionEditorSource.mockResolvedValue({status:"succeeded"});api.prepareProductionEditorConversion.mockResolvedValue(candidate);render(<ProductionConversionPanel document={doc(4)} onSaved={vi.fn()}/>);fireEvent.click(await screen.findByRole("button",{name:"读取原片核验状态"}));await screen.findByText("原片核验：核验完成");fireEvent.click(screen.getByRole("button",{name:"核对转换候选"}));await screen.findByText("旧方案完整留存");expect(api.prepareProductionEditorSource).toHaveBeenCalledOnce();expect(api.prepareProductionEditorConversion.mock.calls[0][0].body).toMatchObject({expectedRevision:3,mainSourceRequestId:source.body.requestId,mode:"capture-current-original"});});
it("损坏缓存不触发任何变更请求",async()=>{sessionStorage.setItem("production-conversion:project-a:output-a",JSON.stringify({expectedRevision:3,prepare:{mode:"empty",requestId:"bad"}}));render(<ProductionConversionPanel document={doc()} onSaved={vi.fn()}/>);await screen.findByRole("button",{name:"核对旧方案当前原片"});expect(api.prepareProductionEditorConversion).not.toHaveBeenCalled();expect(api.adoptProductionEditorConversion).not.toHaveBeenCalled();});
it("切换作品立刻清除原候选，原在途回复不能写回新作品",async()=>{let resolve!:(value:typeof candidate)=>void;api.prepareProductionEditorConversion.mockImplementation(()=>new Promise(r=>{resolve=r;}));const view=render(<ProductionConversionPanel document={doc()} onSaved={vi.fn()}/>);fireEvent.click(screen.getByRole("button",{name:"核对无主口播方案"}));await waitFor(()=>expect(api.prepareProductionEditorConversion).toHaveBeenCalledOnce());view.rerender(<ProductionConversionPanel document={{...doc(),outputId:"output-b"}} onSaved={vi.fn()}/>);expect(screen.queryByRole("button",{name:"恢复原转换候选"})).not.toBeInTheDocument();resolve(candidate);await waitFor(()=>expect(screen.queryByText("旧方案完整留存")).not.toBeInTheDocument());expect(api.adoptProductionEditorConversion).not.toHaveBeenCalled();});
it("明确版本冲突可重新选择；原采纳回执存在时先打开已保存工程",async()=>{api.prepareProductionEditorConversion.mockResolvedValue(candidate);api.adoptProductionEditorConversion.mockRejectedValue(Object.assign(Error("版本冲突"),{code:"ConflictError"}));api.getProductionEditorReceipt.mockResolvedValue({revision:4});const onSaved=vi.fn();render(<ProductionConversionPanel document={doc()} onSaved={onSaved}/>);fireEvent.click(screen.getByRole("button",{name:"核对无主口播方案"}));fireEvent.click(await screen.findByRole("button",{name:"采纳转换并打开粗剪"}));await screen.findByRole("alert");fireEvent.click(await screen.findByRole("button",{name:"结束本次核对，重新选择"}));await waitFor(()=>expect(onSaved).toHaveBeenCalledOnce());expect(api.getProductionEditorReceipt).toHaveBeenCalledOnce();expect(api.adoptProductionEditorConversion).toHaveBeenCalledOnce();});
it("采纳回复未知时不能放弃原输入重新提交",async()=>{api.prepareProductionEditorConversion.mockResolvedValue(candidate);api.adoptProductionEditorConversion.mockRejectedValue(Error("网络断开"));render(<ProductionConversionPanel document={doc()} onSaved={vi.fn()}/>);fireEvent.click(screen.getByRole("button",{name:"核对无主口播方案"}));fireEvent.click(await screen.findByRole("button",{name:"采纳转换并打开粗剪"}));await screen.findByRole("alert");expect(screen.queryByRole("button",{name:"结束本次核对，重新选择"})).not.toBeInTheDocument();});

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
