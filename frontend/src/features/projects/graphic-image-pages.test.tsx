import * as React from 'react';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import type {GraphicPostResource} from '@creatoros/contract';
const api=vi.hoisted(()=>({getGraphicPost:vi.fn(),getGraphicPostVersion:vi.fn(),createGraphicPostVersion:vi.fn(),getAssetFileDownloadUrl:vi.fn(),listCreativeCapabilities:vi.fn(),listResults:vi.fn(),listBundles:vi.fn(),createBundle:vi.fn(),getResult:vi.fn(),adoptResult:vi.fn()}));
vi.mock('@/lib/contract-client',()=>({client:api}));
vi.mock('next/navigation',()=>({useRouter:()=>({refresh:vi.fn()})}));
import {DraftChatRequestProvider} from '@/features/draft-workbench/draft-chat-request';
import {GraphicPostWorkbench} from './graphic-post-workbench';
afterEach(()=>{cleanup();sessionStorage.clear();vi.clearAllMocks();});
it('真实Provider与完整工作台先保存画面修改，再通过结果组件生成和采用精确目标页，回读后主预览一致',async()=>{
 let latest:GraphicPostResource={projectId:'p',outputId:'o',artifactId:'a',currentVersionId:'v1',targetPlatform:'xiaohongshu',versions:[],current:{schemaVersion:1,title:'图文',body:'小红书独立配文',summary:'',tags:[],sourceRefs:[],ruleSnapshotRef:null,imageUses:[],cardBriefs:[{cardId:'first',title:'一',body:'第一点',sourceRefs:[]},{cardId:'second',title:'二',body:'第二点',sourceRefs:[]}]}};
 const exactImage={assetId:'ai-generated',assetFileId:'exact-file',role:'card' as const,order:0,cardId:'second'};
 let result={resultId:'generated-result',kind:'image_card',outputId:'o',status:'awaiting_confirmation',targetSectionId:'second',value:[exactImage],createdAt:'2026-10-26T08:00:00Z',errorCode:null};
 api.listCreativeCapabilities.mockResolvedValue({items:[{outputType:'image',platform:'xiaohongshu',kind:'image_card',state:'supported'}]});api.listResults.mockResolvedValue({items:[]});api.listBundles.mockResolvedValue({items:[]});
 api.getGraphicPost.mockImplementation(async()=>structuredClone(latest));api.getGraphicPostVersion.mockImplementation(async()=>({versionId:latest.currentVersionId,document:structuredClone(latest.current)}));
 api.createGraphicPostVersion.mockImplementation(async({body})=>{expect(body.expectedCurrentVersionId).toBe('v1');latest={...latest,currentVersionId:'v2',current:structuredClone(body.document)};return {versionId:'v2'};});
 api.createBundle.mockImplementation(async({body})=>{expect(latest.currentVersionId).toBe('v2');expect(latest.current.cardBriefs?.[1]?.visualBrief).toBe('机器人连接工具的插画');expect(body.items).toEqual([{kind:'image_card',targetSectionId:'second'}]);return {bundleId:'bundle',status:'complete',items:[{resultId:result.resultId,kind:'image_card',targetSectionId:'second',status:'awaiting_confirmation'}]};});
 api.getResult.mockImplementation(async()=>result);api.getAssetFileDownloadUrl.mockResolvedValue({url:'http://example.test/exact-file.png'});
 api.adoptResult.mockImplementation(async({body})=>{expect(body.expected).toEqual({owner:'graphic_post',versionId:'v2'});expect(body.editedValue).toEqual([exactImage]);latest={...latest,currentVersionId:'v3',current:{...latest.current,imageUses:[exactImage]}};result={...result,status:'adopted'};return {status:'adopted'};});
 render(<DraftChatRequestProvider><GraphicPostWorkbench projectId="p" projectTitle="项目" accountId="a" initial={latest}/></DraftChatRequestProvider>);
 fireEvent.click(screen.getByRole('checkbox',{name:'选择第 1 页生成'}));
 const field=screen.getByLabelText('第 2 页画面想法');const details=field.closest('details')!;details.open=true;fireEvent(details,new Event('toggle'));fireEvent.change(field,{target:{value:'机器人连接工具的插画'}});
 const generate=await screen.findByRole('button',{name:'生成所选 1 页'});await waitFor(()=>expect(generate).toBeEnabled());fireEvent.click(generate);
 const adopt=await screen.findByRole('button',{name:'采用到这一页'});fireEvent.load(await screen.findByRole('img',{name:'待审阅的生成图卡'}));await waitFor(()=>expect(adopt).toBeEnabled());fireEvent.click(adopt);
 expect(await screen.findByRole('img',{name:'作品中的精确图片版本'})).toHaveAttribute('src','http://example.test/exact-file.png');
 expect(api.createBundle).toHaveBeenCalledOnce();expect(api.adoptResult).toHaveBeenCalledOnce();expect(latest.current.body).toBe('小红书独立配文');expect(latest.current.cardBriefs?.map(card=>card.cardId)).toEqual(['first','second']);
 expect(screen.getByRole('button',{name:'导出原图与配文'})).toBeVisible();expect(screen.getByText('文字排版与旧稿导出').closest('details')).not.toHaveAttribute('open');
});

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
