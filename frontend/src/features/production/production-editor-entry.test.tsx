import * as React from "react";
import {cleanup,render,screen,waitFor,fireEvent} from "@testing-library/react";
import {afterEach,expect,it,vi} from "vitest";
const api=vi.hoisted(()=>({getProductionEditor:vi.fn(),nativeDisposed:vi.fn()}));
vi.mock("@/lib/contract-client",()=>({client:api}));
vi.mock("./production-workbench",()=>({ProductionWorkbench:()=> <p>备料</p>}));
vi.mock("./rough-cut-workbench",()=>({RoughCutWorkbench:({initial}:{initial:{outputId:string}})=> <p>粗剪 {initial.outputId}</p>}));
vi.mock("./production-visual-editor",()=>({ProductionVisualEditor:()=> <p>旧剪辑</p>}));
vi.mock("./production-conversion-panel",()=>({ProductionConversionPanel:()=> <p>转换</p>}));
vi.mock("@/features/reference-editors/video-reference-workbench",()=>({VideoReferenceWorkbench:({initial,onOriginal}:{initial:{outputId:string};onOriginal:()=>void})=>{React.useEffect(()=>()=>api.nativeDisposed(),[]);return <div><p>开源剪辑 {initial.outputId}</p><button onClick={onOriginal}>原方案与粗剪</button></div>;}}));
import {ProductionEditorEntry} from "./production-editor-entry";
import {ProjectVideoSessionContext} from "@/features/reference-editors/project-video-session-registry";
const props={projectId:"project-a",projectTitle:"验收",scriptText:null,outputId:"output-a",initialStatus:null,initialSegmentCount:0};
afterEach(()=>{cleanup();api.getProductionEditor.mockReset();});
it("没有视频作品时不等待共享剪辑会话接管",()=>{const host={attach:vi.fn(()=>()=>{})};render(<ProjectVideoSessionContext.Provider value={host}><ProductionEditorEntry {...props} outputId={null}/></ProjectVideoSessionContext.Provider>);expect(screen.getByText("备料")).toBeInTheDocument();expect(screen.queryByText("正在恢复当前剪辑工作台…")).not.toBeInTheDocument();expect(host.attach).not.toHaveBeenCalled();});
it("切换作品立即隐藏旧工程，新作品读取失败显示错误",async()=>{api.getProductionEditor.mockResolvedValueOnce({outputId:"output-a",state:"empty",revision:0,plan:null});const view=render(<ProductionEditorEntry {...props}/>);await screen.findByText("开源剪辑 output-a");let reject!:(value:Error)=>void;api.getProductionEditor.mockImplementation(()=>new Promise((_r,j)=>{reject=j;}));view.rerender(<ProductionEditorEntry {...props} outputId="output-b"/>);expect(screen.queryByText("开源剪辑 output-a")).not.toBeInTheDocument();await waitFor(()=>expect(api.getProductionEditor).toHaveBeenCalledTimes(2));reject(Error("新作品读取失败"));await screen.findByRole("alert");expect(screen.getByRole("alert")).toHaveTextContent("新作品读取失败");});

it("开源工作台默认打开且原粗剪与返回入口可达",async()=>{api.getProductionEditor.mockResolvedValue({outputId:"output-a",state:"editable",revision:1,plan:{editorVersion:2}});render(<ProductionEditorEntry {...props}/>);await screen.findByText("开源剪辑 output-a");fireEvent.click(screen.getByRole("button",{name:"原方案与粗剪"}));await screen.findByText("粗剪 output-a");fireEvent.click(screen.getByRole("button",{name:"返回剪辑工作台"}));await screen.findByText("开源剪辑 output-a");});

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

it("切回原制作页再返回保留同一剪辑实例，不用重新加载替代未保存稿",async()=>{
 api.nativeDisposed.mockClear();api.getProductionEditor.mockResolvedValue({outputId:"output-a",projectId:"project-a",state:"editable",revision:1,plan:{editorVersion:2}});render(<ProductionEditorEntry {...props}/>);
 await screen.findByText("开源剪辑 output-a");fireEvent.click(screen.getByRole("button",{name:"原方案与粗剪"}));await screen.findByText("粗剪 output-a");expect(api.nativeDisposed).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole("button",{name:"返回剪辑工作台"}));expect(api.getProductionEditor).toHaveBeenCalledTimes(1);
});
