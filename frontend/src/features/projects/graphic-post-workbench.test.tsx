import * as React from "react";
import {afterEach,expect,it,vi} from "vitest";
import {cleanup,fireEvent,render,screen,waitFor} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type {GraphicPostResource} from "@creatoros/contract";
import {unzipSync,strFromU8} from "fflate";
import {GraphicPostWorkbench} from "./graphic-post-workbench";
const api=vi.hoisted(()=>({createGraphicPostVersion:vi.fn(),getGraphicPost:vi.fn(),getGraphicPostVersion:vi.fn(),getAssetFileDownloadUrl:vi.fn(async(_input:{params:{assetId:string;assetFileId:string}})=>({url:"http://example.test/image.png"})),listAssets:vi.fn(async()=>[])}));
vi.mock("@/features/reference-editors/noterelay/noterelay-editor",()=>({NoteRelayEditor:()=> <div>NoteRelay 预览</div>}));
async function openSeries(){const details=screen.getByText("逐页创作与 AI 辅助").closest("details")!;details.open=true;fireEvent(details,new Event("toggle"));await screen.findByRole("button",{name:"读取现有候选"});}
const canvas=vi.hoisted(()=>({openGraphicPageCanvas:vi.fn(),push:vi.fn()}));
vi.mock("@/lib/contract-client",()=>({client:api}));
vi.mock("next/navigation",()=>({useRouter:()=>({refresh:vi.fn(),push:canvas.push})}));
vi.mock("@/features/creative-canvas/graphic-page-context",()=>({openGraphicPageCanvas:canvas.openGraphicPageCanvas}));
vi.mock("./graphic-post-results",()=>({GraphicPostResults:({onAdopt}:{onAdopt:()=>Promise<void>})=> <button onClick={()=>void onAdopt()}>读取现有候选</button>}));
vi.mock("./publication-result-actions",()=>({PublicationResultActions:()=> <button>读取发布内容</button>}));
afterEach(()=>{cleanup();vi.clearAllMocks();vi.restoreAllMocks();vi.unstubAllGlobals();});
it("图文去掉重复页头及版本状态小字，保存和历史仍真实可用",async()=>{
 const initial:GraphicPostResource={projectId:"p",outputId:"o",targetPlatform:null,artifactId:"artifact",currentVersionId:"v0",versions:[{id:"v0",versionNumber:2,createdAt:"2026-10-04T00:00:00Z",changeSummary:"保存"}],current:{schemaVersion:1,title:"稿件标题",body:"已保存正文",summary:"",tags:[],sourceRefs:[],imageUses:[],ruleSnapshotRef:null}};
 const {container}=render(<GraphicPostWorkbench projectId="p" projectTitle="项目名称" accountId="a" initial={initial}/>);
 expect(screen.queryByText("← 项目名称")).not.toBeInTheDocument();
 expect(screen.queryByRole("heading",{name:"图文作品"})).not.toBeInTheDocument();
 expect(screen.queryByText(/沿用脚本标题、简介和标签，生成配文/)).not.toBeInTheDocument();
 expect(screen.queryByText("版本 1")).not.toBeInTheDocument();
 expect(container.querySelector('main')).toHaveClass("text-sm");
 expect(screen.getByRole("textbox",{name:"正文"})).toHaveClass("text-sm","leading-relaxed");
 expect(screen.getByRole("button",{name:"保存作品"})).toBeDisabled();
 fireEvent.change(screen.getByRole("textbox",{name:"正文"}),{target:{value:"本次修改"}});
 expect(screen.queryByText("有未保存的修改")).not.toBeInTheDocument();
 expect(screen.getByRole("button",{name:"保存作品"})).toHaveAttribute("title","有未保存的修改");
 const history=screen.getByText("历史版本").closest("details")!;
 expect(history).not.toBeNull();expect(history).not.toHaveAttribute("open");
 history.open=true;fireEvent(history,new Event("toggle"));
 api.getGraphicPostVersion.mockResolvedValue({versionId:"v0",document:initial.current});
 fireEvent.click(screen.getByRole("button",{name:/v2/}));
 await waitFor(()=>expect(api.getGraphicPostVersion).toHaveBeenCalledWith({params:{outputId:"o",versionId:"v0"},query:undefined,body:undefined}));
});
it("图卡文字编辑与顺序经真实保存操作提交，稳定ID/来源保留且不新增图片",async()=>{
 const source={kind:"project" as const,id:"p",versionId:"project-version"};
 const initial:GraphicPostResource={projectId:"p",outputId:"o",targetPlatform:null,artifactId:"artifact",currentVersionId:"v0",versions:[],
  current:{schemaVersion:1,title:"图文",body:"正文",summary:"",tags:[],sourceRefs:[],imageUses:[],ruleSnapshotRef:null,
   cardBriefs:[{cardId:"card-a",title:"第一页",body:"原第一页",sourceRefs:[source]},
    {cardId:"card-b",title:"第二页",body:"原第二页",sourceRefs:[]}]}};
 api.createGraphicPostVersion.mockImplementation(async({body})=>({versionId:"v1",document:body.document}));
 api.getGraphicPost.mockImplementation(async()=>({...initial,currentVersionId:"v1",current:api.createGraphicPostVersion.mock.calls[0]![0].body.document}));
 render(<GraphicPostWorkbench projectId="p" projectTitle="项目" accountId="a" initial={initial}/>);
 await openSeries();
 const user=userEvent.setup();
 const first=screen.getByRole("textbox",{name:"图卡1正文"});
 await user.clear(first);await user.type(first,"用户修改的第一页");
 await user.click(screen.getByRole("button",{name:"图卡1下移"}));
 await user.click(screen.getByRole("button",{name:"保存作品"}));
 await waitFor(()=>expect(api.createGraphicPostVersion).toHaveBeenCalledOnce());
 const input=api.createGraphicPostVersion.mock.calls[0]![0];
 expect(input).toMatchObject({params:{outputId:"o"},body:{expectedCurrentVersionId:"v0",clientRequestId:expect.any(String),
  document:{imageUses:[],cardBriefs:[initial.current.cardBriefs![1],{...initial.current.cardBriefs![0],body:"用户修改的第一页"}]}}});
 expect(await screen.findByRole("textbox",{name:"图卡2正文"})).toHaveValue("用户修改的第一页");
 expect(api.getGraphicPost).toHaveBeenCalledOnce();
});

it("保存期间不接受会被迟到读回覆盖的新编辑；失败保留输入可重试，成功清楚反馈",async()=>{
 const initial:GraphicPostResource={projectId:"p",outputId:"o",targetPlatform:null,artifactId:"artifact",currentVersionId:"v0",versions:[],
  current:{schemaVersion:1,title:"图文",body:"已保存正文",summary:"",tags:[],sourceRefs:[],imageUses:[],ruleSnapshotRef:null}};
 let rejectSave!:(error:Error)=>void;
 api.createGraphicPostVersion.mockImplementationOnce(()=>new Promise((_resolve,reject)=>{rejectSave=reject;}));
 render(<GraphicPostWorkbench projectId="p" projectTitle="项目" accountId="a" initial={initial}/>);
 await openSeries();
 const user=userEvent.setup(),body=screen.getByRole("textbox",{name:"正文"});
 await user.clear(body);await user.type(body,"本次编辑不能丢失");
 expect(screen.getByRole("button",{name:"保存作品"})).toHaveAttribute("title","有未保存的修改");
 await user.click(screen.getByRole("button",{name:"保存作品"}));
 expect(body).toBeDisabled();
 expect(screen.getByRole("textbox",{name:"标题"})).toBeDisabled();
 rejectSave(new Error("temporary"));
 await screen.findByRole("alert");
 expect(body).toBeEnabled();expect(body).toHaveValue("本次编辑不能丢失");
 expect(api.getGraphicPost).not.toHaveBeenCalled();
 api.createGraphicPostVersion.mockImplementationOnce(async({body})=>({versionId:"internal-version-id",document:body.document}));
 api.getGraphicPost.mockResolvedValueOnce({...initial,currentVersionId:"v1",current:{...initial.current,body:"本次编辑不能丢失"}});
 await user.click(screen.getByRole("button",{name:"保存作品"}));
 expect(await screen.findByRole("status")).toHaveTextContent("作品已保存");
 expect(screen.queryByText(/internal-version-id/)).not.toBeInTheDocument();
 expect(body).toHaveValue("本次编辑不能丢失");
});

it("统一方向可用键盘展开，候选入口在主工作面且不堆全部页编辑按钮",async()=>{
 const initial:GraphicPostResource={projectId:"p",outputId:"o",targetPlatform:null,artifactId:"artifact",currentVersionId:"v0",versions:[],
  current:{schemaVersion:1,title:"图文",body:"正文",summary:"",tags:[],sourceRefs:[],imageUses:[],ruleSnapshotRef:null}};
 const {container}=render(<GraphicPostWorkbench projectId="p" projectTitle="项目" accountId="a" initial={initial}/>);
 await openSeries();
 const details=screen.getByText("统一方向与参考，可选").closest('details');
 expect(details).not.toBeNull();
 expect(details).not.toHaveAttribute("open");
 expect(screen.getByRole('button',{name:'读取现有候选'})).toBeInTheDocument();
 expect(container.querySelector('[aria-label="图片设计入口"]')).toBeNull();
 const summary=details!.querySelector("summary")!;
 summary.focus();expect(summary).toHaveFocus();
});

it('画布进入先保存当前输入，然后把真实目标ID传给scoped helper',async()=>{
 const initial:GraphicPostResource={projectId:'p',outputId:'o',targetPlatform:null,artifactId:'artifact',currentVersionId:'v0',versions:[],current:{schemaVersion:1,title:'图文',body:'正文',summary:'',tags:[],sourceRefs:[],imageUses:[],ruleSnapshotRef:null,cardBriefs:[{cardId:'real-page',title:'页',body:'内容',sourceRefs:[]}]}};
 api.createGraphicPostVersion.mockResolvedValue({versionId:'v1'});api.getGraphicPost.mockResolvedValue({...initial,currentVersionId:'v1'});
 canvas.openGraphicPageCanvas.mockResolvedValue('/canvases/real-canvas?graphicPageContext=handle');
 render(<GraphicPostWorkbench projectId="p" projectTitle="项目" accountId="a" initial={initial}/>);
 await openSeries();
 fireEvent.change(screen.getByRole('textbox',{name:'图卡1正文'}),{target:{value:'修改后内容'}});
 fireEvent.click(screen.getByRole('button',{name:'进入画布制作这一页'}));
 await waitFor(()=>expect(canvas.openGraphicPageCanvas).toHaveBeenCalledWith({accountId:'a',projectId:'p',outputId:'o',cardId:'real-page'}));
 expect(api.createGraphicPostVersion.mock.invocationCallOrder[0]).toBeLessThan(canvas.openGraphicPageCanvas.mock.invocationCallOrder[0]);
 expect(canvas.push).toHaveBeenCalledWith('/canvases/real-canvas?graphicPageContext=handle');
});

it('采用回读期间新输入保留；账号/作品切换后的旧保存读回不能覆盖新作品',async()=>{
 const initial:GraphicPostResource={projectId:'p',outputId:'o',targetPlatform:null,artifactId:'artifact',currentVersionId:'v0',versions:[],current:{schemaVersion:1,title:'图文',body:'已保存',summary:'',tags:[],sourceRefs:[],imageUses:[],ruleSnapshotRef:null}};
 let resolveRead!:(value:GraphicPostResource)=>void;
 api.getGraphicPost.mockImplementationOnce(()=>new Promise(resolve=>{resolveRead=resolve;}));
 const {rerender}=render(<GraphicPostWorkbench projectId="p" projectTitle="项目" accountId="a" initial={initial}/>);
 await openSeries();
 fireEvent.click(screen.getByRole('button',{name:'读取现有候选'}));
 fireEvent.change(screen.getByRole('textbox',{name:'正文'}),{target:{value:'刚输入的新正文'}});
 resolveRead({...initial,currentVersionId:'v1',current:{...initial.current,body:'采用的服务端正文'}});
 await waitFor(()=>expect(screen.getByRole('textbox',{name:'正文'})).toHaveValue('刚输入的新正文'));
 expect(await screen.findByRole('status')).toHaveTextContent('新增的输入已保留');
 let resolveSave!:(value:unknown)=>void;
 api.createGraphicPostVersion.mockImplementationOnce(()=>new Promise(resolve=>{resolveSave=resolve;}));
 fireEvent.click(screen.getByRole('button',{name:'保存作品'}));
 const other={...initial,outputId:'other',current:{...initial.current,body:'新账号作品'}};
 rerender(<GraphicPostWorkbench projectId="p" projectTitle="项目" accountId="other-account" initial={other}/>);
 resolveSave({versionId:'late-old'});
 await waitFor(()=>expect(screen.getByRole('textbox',{name:'正文'})).toHaveValue('新账号作品'));
 expect(api.getGraphicPost).toHaveBeenCalledTimes(1);
});


it('导出读取精确文件，封面重复文件只导出一次，真实页序和配文写入zip',async()=>{
 const a={assetId:'asset-a',assetFileId:'file-a',order:1,role:'card' as const,cardId:'a'},b={assetId:'asset-b',assetFileId:'file-b',order:2,role:'card' as const,cardId:'b'};
 const initial:GraphicPostResource={projectId:'p',outputId:'o',targetPlatform:null,artifactId:'artifact',currentVersionId:'v0',versions:[],current:{schemaVersion:1,title:'作品标题',body:'作品正文',summary:'摘要',tags:['标签'],sourceRefs:[],ruleSnapshotRef:null,cardBriefs:[{cardId:'a',title:'一',body:'一',sourceRefs:[]},{cardId:'b',title:'二',body:'二',sourceRefs:[]}],imageUses:[{assetId:'asset-b',assetFileId:'file-b',order:0,role:'cover'},b,a]}};
 api.getGraphicPost.mockResolvedValue(initial);api.getAssetFileDownloadUrl.mockImplementation(async({params})=>({url:`http://example.test/${params.assetFileId}.png`}));
 const read=vi.fn(async(_url:string)=>({ok:true,blob:async()=>({type:'image/png',arrayBuffer:async()=>new Uint8Array([1,2,3]).buffer})}));vi.stubGlobal('fetch',read);
 let archive:Blob|undefined;const create=URL.createObjectURL,revoke=URL.revokeObjectURL;
 URL.createObjectURL=vi.fn(blob=>{archive=blob;return 'blob:archive';});URL.revokeObjectURL=vi.fn();vi.spyOn(HTMLAnchorElement.prototype,'click').mockImplementation(()=>{});
 try{
  render(<GraphicPostWorkbench projectId="p" projectTitle="项目" accountId="a" initial={initial}/>);
 await openSeries();
  fireEvent.click(screen.getByRole('button',{name:'导出整组'}));await screen.findByText(/已导出 2 张精确图片和配文/);
  expect(read.mock.calls.map(call=>call[0])).toEqual(['http://example.test/file-a.png','http://example.test/file-b.png']);
  const buffer=await new Promise<ArrayBuffer>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result as ArrayBuffer);reader.onerror=reject;reader.readAsArrayBuffer(archive!);});
  const files=unzipSync(new Uint8Array(buffer));expect(Object.keys(files)).toEqual(['01.png','02.png','配文.txt','图片顺序.json']);
  expect(strFromU8(files['配文.txt']!)).toBe('作品标题\n\n作品正文\n\n摘要\n\n#标签');
  expect(JSON.parse(strFromU8(files['图片顺序.json']!)).map((row:{assetFileId:string})=>row.assetFileId)).toEqual(['file-a','file-b']);
  expect(api.createGraphicPostVersion).not.toHaveBeenCalled();
 }finally{URL.createObjectURL=create;URL.revokeObjectURL=revoke;}
});

it("图文首次填空脚本信息，保留已有正文，候选入口不藏在逐页设置里",()=>{
 const initial={projectId:"p",outputId:"o",targetPlatform:null,artifactId:"artifact",currentVersionId:"v0",versions:[],current:{schemaVersion:1 as const,title:"",body:"保留正文",summary:"",tags:[],sourceRefs:[],imageUses:[],ruleSnapshotRef:null},scriptContext:{state:"ready" as const,scriptRef:null,scriptText:"主稿",metadata:{title:"脚本标题",summary:"脚本简介",tags:["标签"]},metadataSource:{kind:"project" as const,projectId:"p",updatedAt:"2026-10-04"}}};
 render(<GraphicPostWorkbench projectId="p" projectTitle="项目" accountId="a" initial={initial}/>);
 expect(screen.getByRole("textbox",{name:"标题"})).toHaveValue("脚本标题");expect(screen.getByRole("textbox",{name:"简介或摘要"})).toHaveValue("脚本简介");expect(screen.getByRole("textbox",{name:"标签"})).toHaveValue("标签");expect(screen.getByRole("textbox",{name:"正文"})).toHaveValue("保留正文");expect(screen.getByRole("button",{name:"读取现有候选"})).toBeVisible();
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
