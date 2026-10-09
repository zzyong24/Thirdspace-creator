import '@testing-library/jest-dom/vitest';
import * as React from 'react';
import {it,expect,vi,afterEach} from 'vitest';
import {render,screen,fireEvent,cleanup,waitFor} from '@testing-library/react';
import {InfiniteCanvasNode} from './infinite-canvas-node';

vi.mock('@/lib/contract-client',()=>({client:{searchAssets:vi.fn(async()=>({items:[{id:'new',name:'新图',assetType:'image',currentFileId:'new-file'}],nextCursor:null})),getAssetFileDownloadUrl:vi.fn(async()=>({url:'/exact.png'}))}}));
afterEach(cleanup);
function view(){const onPatch=vi.fn();render(<InfiniteCanvasNode item={{id:'node',type:'image_generation',position:{x:0,y:0},label:'页图',prompt:'画面',mode:'image_to_image',referenceAssetId:'old',referenceFileId:'old-file'}} assets={[{id:'old',name:'原图',assetType:'image',currentFileId:'old-file'},{id:'new',name:'新图',assetType:'image',currentFileId:'new-file'}]} selected busy={false} busyResult={false} projectTitle={null} onPatch={onPatch} onSelect={vi.fn()} onStartDrag={vi.fn()} onStartResize={vi.fn()} onStartConnect={vi.fn()} onGenerate={vi.fn()} onInsertResult={vi.fn()} onKeepResult={vi.fn()} onReferenceDrop={vi.fn()}/>);return onPatch;}
it('切换生成模式清掉精确参考，旧file不能残留阻断合法保存',()=>{const patch=view();fireEvent.change(screen.getByRole('combobox',{name:'生成模式'}),{target:{value:'text_to_image'}});expect(patch.mock.calls[0]?.[1]).toHaveProperty('referenceFileId',undefined);expect(patch.mock.calls[0]?.[1]).toHaveProperty('referenceAssetId',undefined);});
it('参考图库确认冻结新资产和精确文件，预览时仍保留旧引用',async()=>{const patch=view();fireEvent.click(screen.getByRole('button',{name:'参考图片'}));fireEvent.click(await screen.findByRole('button',{name:'预览 新图'}));expect(patch).not.toHaveBeenCalled();fireEvent.click(screen.getByRole('button',{name:'使用此素材'}));await waitFor(()=>expect(patch.mock.calls[0]?.[1]).toMatchObject({referenceFileId:'new-file',referenceAssetId:'new'}));});
it('画布参考用缩略图展示，取消保留旧文件且可访问预览仍能确认新文件',async()=>{
 const patch=view();expect(screen.queryByText('原图')).toBeNull();expect(screen.getByText('已选素材')).toBeInTheDocument();
 fireEvent.click(screen.getByRole('button',{name:'参考图片'}));fireEvent.click(await screen.findByRole('button',{name:'预览 新图'}));
 expect(screen.queryByText('新图')).toBeNull();expect(screen.getByText('已选，可预览后使用')).toBeInTheDocument();
 fireEvent.click(screen.getByRole('button',{name:'取消'}));expect(patch).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button',{name:'参考图片'}));fireEvent.click(await screen.findByRole('button',{name:'预览 新图'}));fireEvent.click(screen.getByRole('button',{name:'使用此素材'}));
 await waitFor(()=>expect(patch.mock.calls[0]?.[1]).toMatchObject({referenceFileId:'new-file',referenceAssetId:'new'}));
});

// T1069_EXISTING_PORT_SEAM: 仅本文件既有业务spies；真实scope/epoch/signal/lifecycle不替换。
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
// T1069_EXISTING_PORT_SEAM_END

// 显式单测账号范围；工作区与取消守卫仍使用真实实现。
import {beforeEach as scopeBefore,afterEach as scopeAfter} from "vitest";
scopeBefore(()=>{localStorage.removeItem("creatoros:current-group");localStorage.setItem("creatoros:current-account","a");});
scopeAfter(()=>{localStorage.removeItem("creatoros:current-group");localStorage.removeItem("creatoros:current-account");});
