import * as React from 'react';
import {render,screen,fireEvent,waitFor,cleanup} from '@testing-library/react';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
const h=vi.hoisted(()=>({prepareProductionEditorSource:vi.fn(),getProductionEditorSource:vi.fn(),retryProductionEditorSource:vi.fn(),getProductionEditorReceipt:vi.fn(),adoptProductionEditorSource:vi.fn()}));
vi.mock('@/lib/contract-client',()=>({client:h}));
import {NativeSourcePanel} from './native-source-panel';
const document:any={outputId:'output',projectId:'project',revision:4,plan:{editorVersion:3,nativeSources:[]}};
const probe={requestId:'source-request',sourceId:'source',status:'succeeded',probe:{durationTicks:6000,timebase:{num:1,den:1000},hasAudio:true},error:null};
const prepare=vi.fn(async()=>({...document,revision:7})),saved=vi.fn(async(_version:unknown,_action?:unknown)=>{}),recover=vi.fn(async()=>{});
beforeEach(()=>{vi.clearAllMocks();sessionStorage.clear();h.prepareProductionEditorSource.mockResolvedValue(probe);h.getProductionEditorReceipt.mockResolvedValue(null);h.adoptProductionEditorSource.mockResolvedValue({revision:8,plan:document.plan});});afterEach(cleanup);
async function open(){render(<NativeSourcePanel document={document} media={[{mediaId:'native-video',assetId:'asset',assetFileId:'file'}]} metadata={[{mediaId:'native-video',name:'口播原片.mp4',type:'video'}]} disabled={false} prepareDocument={prepare} onSaved={saved} onRecoverConflict={recover}/>);fireEvent.click(screen.getByText('选择视频并检查声音'));fireEvent.click(screen.getByRole('button',{name:'选择视频'}));fireEvent.click(screen.getByRole('button',{name:'预览 口播原片.mp4'}));fireEvent.click(screen.getByRole('button',{name:'选择这段原片'}));await waitFor(()=>expect(screen.queryByRole('dialog')).toBeNull());}
it('真实原片API登记确切native mediaId，不重复添加whole clip，采用前保存当前revision',async()=>{await open();fireEvent.click(screen.getByText('检查视频声音'));await screen.findByText('选用此视频');fireEvent.click(screen.getByText('选用此视频'));await waitFor(()=>expect(saved).toHaveBeenCalled());expect(h.prepareProductionEditorSource.mock.calls[0][0].body).toEqual({assetId:'asset',assetFileId:'file',requestId:expect.any(String)});expect(h.adoptProductionEditorSource.mock.calls[0][0].body).toEqual({sourceRequestId:'source-request',requestId:expect.any(String),expectedRevision:7,mediaId:'native-video',addWholeClip:false});expect(saved.mock.calls[0][1]).toEqual({requestId:h.adoptProductionEditorSource.mock.calls[0][0].body.requestId,expectedRevision:7});});
it('unknown采纳ACK保留完整原输入，重试先读receipt，同ID/body恢复',async()=>{h.adoptProductionEditorSource.mockRejectedValueOnce(Error('原采用未知'));await open();fireEvent.click(screen.getByText('检查视频声音'));fireEvent.click(await screen.findByText('选用此视频'));await screen.findByText('原采用未知');const original=h.adoptProductionEditorSource.mock.calls[0][0].body;fireEvent.click(screen.getByText('恢复原片原请求'));await waitFor(()=>expect(saved).toHaveBeenCalled());expect(h.adoptProductionEditorSource.mock.calls[1][0].body).toEqual(original);expect(h.getProductionEditorReceipt.mock.calls[1][0].params.requestId).toBe(original.requestId);});
it('typed CAS409释放已拒绝的旧采用并显示保留本地稿恢复动作',async()=>{h.adoptProductionEditorSource.mockRejectedValueOnce(Object.assign(Error('版本冲突'),{code:'ConflictError',status:409}));await open();fireEvent.click(screen.getByText('检查视频声音'));fireEvent.click(await screen.findByText('选用此视频'));fireEvent.click(await screen.findByText('保留本地稿，重新核对当前版本'));await waitFor(()=>expect(recover).toHaveBeenCalled());expect(screen.queryByText('恢复原片原请求')).toBeNull();expect(h.adoptProductionEditorSource).toHaveBeenCalledTimes(1);});

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
