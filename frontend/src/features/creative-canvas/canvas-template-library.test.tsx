import {act,render,screen,fireEvent,waitFor} from "@testing-library/react";
import {afterEach,beforeEach,it,expect,vi} from "vitest";
import {useState} from "react";
import type {VisualTemplate} from "@creatoros/contract";
import {CanvasTemplateLibrary,type TemplateBrowse,type RememberedTemplateInput} from "./canvas-template-library";
const owner=vi.hoisted(()=>({id:"account-a"}));vi.mock("@/lib/http-transport", async importOriginal => ({...await importOriginal<typeof import("@/lib/http-transport")>(), readCurrentAccountId:()=>owner.id}));
const api=vi.hoisted(()=>({listVisualTemplates:vi.fn(),searchAssets:vi.fn(),saveVisualTemplate:vi.fn(),removeVisualTemplate:vi.fn(),getAssetFileDownloadUrl:vi.fn()}));vi.mock("@/lib/contract-client",()=>({client:api}));
const template:VisualTemplate={id:"style",scope:"builtin",revision:1,libraryKind:"cover",industries:["通用"],visualMode:"graphic",kind:"style",name:"杂志封面",prompt:"{{本期标题}}",aspectRatio:"3:4",aspectRatios:["3:4","16:9"],references:[],pageRecipes:[],requiredIdentity:false,previewPath:null,createdAt:"2026-10-04",updatedAt:"2026-10-04"};
const capabilities=[{mode:"text_to_image" as const,available:true,model:"test",reason:null,aspectRatios:["3:4","16:9"]}];
const insert=vi.fn();function Panel(){const [ratio,setRatio]=useState("3:4");return <CanvasTemplateLibrary accountId="account-a" assets={[]} capabilities={capabilities} aspectRatio={ratio} onAspectRatio={setRatio} onInsert={insert} onClose={vi.fn()} onUpload={vi.fn()} onLoadMoreAssets={vi.fn()} hasMoreAssets={false} loadingAssets={false}/>;}
afterEach(()=>vi.unstubAllGlobals());
beforeEach(()=>{owner.id="account-a";vi.clearAllMocks();api.listVisualTemplates.mockResolvedValue([template]);api.searchAssets.mockResolvedValue({items:[{id:"identity",name:"本人.png",assetType:"image",currentFileId:"chosen-file"}],nextCursor:null});});
it("显式比例在返回与换库后保留，模型不支持项不可点，放入画布不发模型调用",async()=>{render(<Panel/>);fireEvent.click(await screen.findByRole("button",{name:/杂志封面/}));expect(screen.getByRole("button",{name:"4:5"})).toBeDisabled();fireEvent.click(screen.getByRole("button",{name:"16:9"}));fireEvent.click(screen.getByRole("button",{name:"返回模板库"}));fireEvent.click(screen.getByRole("button",{name:"小红书图文"}));fireEvent.click(await screen.findByRole("button",{name:/杂志封面/}));expect(screen.getByRole("button",{name:"16:9"})).toHaveAttribute("aria-pressed","true");fireEvent.click(screen.getByRole("button",{name:"放入当前画布"}));expect(insert).toHaveBeenCalledWith(template,expect.objectContaining({aspectRatio:"16:9"}));});
it("收藏保存用户快照并回读真实ID与版本；保存失败保留编辑并沿同attempt恢复",async()=>{api.saveVisualTemplate.mockRejectedValueOnce(Error("网络回执丢失")).mockResolvedValue({...template,id:"saved-id",scope:"saved",revision:2});render(<Panel/>);fireEvent.click(await screen.findByRole("button",{name:/杂志封面/}));fireEvent.change(screen.getByLabelText("提示词"),{target:{value:"用户编辑的提示词"}});fireEvent.click(screen.getByRole("button",{name:"收藏提示词"}));await screen.findByText("网络回执丢失");expect(screen.getByLabelText("提示词")).toHaveValue("用户编辑的提示词");fireEvent.click(screen.getByRole("button",{name:"收藏提示词"}));await screen.findByText("已加入我的收藏");expect(api.saveVisualTemplate.mock.calls[1]![0].body.attemptId).toBe(api.saveVisualTemplate.mock.calls[0]![0].body.attemptId);expect(api.saveVisualTemplate.mock.calls[1]![0].body.template.prompt).toBe("用户编辑的提示词");expect(screen.getByRole("button",{name:"更新收藏"})).toBeVisible();});
it("读取失败不会伪装空收藏，旧账号迟到结果不写新账号",async()=>{let finish:(v:VisualTemplate[])=>void=()=>{};api.listVisualTemplates.mockReturnValueOnce(new Promise<VisualTemplate[]>(resolve=>{finish=resolve;})).mockRejectedValue(Error("新账号读取失败"));const props={assets:[],capabilities,aspectRatio:"3:4",onAspectRatio:vi.fn(),onInsert:insert,onClose:vi.fn(),onUpload:vi.fn(),onLoadMoreAssets:vi.fn(),hasMoreAssets:false,loadingAssets:false};const view=render(<CanvasTemplateLibrary accountId="a" {...props}/>);view.rerender(<CanvasTemplateLibrary accountId="b" {...props}/>);await screen.findByRole("alert");await act(async()=>finish([template]));await waitFor(()=>expect(screen.queryByRole("button",{name:/杂志封面/})).not.toBeInTheDocument());expect(screen.queryByText("还没有收藏的模板")).not.toBeInTheDocument();});

it("旧账号面板不能将收藏写入刚切换的新账号",async()=>{render(<Panel/>);fireEvent.click(await screen.findByRole("button",{name:/杂志封面/}));owner.id="account-b";fireEvent.click(screen.getByRole("button",{name:"收藏提示词"}));await screen.findByText("请先选择当前创作账号");expect(api.saveVisualTemplate).not.toHaveBeenCalled();});
it("首页收藏导致列表切换时保留单页、参考图和本期完整输入",async()=>{
 const xhs={...template,libraryKind:"xhs" as const,name:"步骤笔记",pageRecipes:[{role:"cover" as const,label:"首图",prompt:"首图"},{role:"body" as const,label:"正文",prompt:"正文"}]},saved={...xhs,id:"saved-page",scope:"saved" as const};
 api.listVisualTemplates.mockImplementation(({query})=>Promise.resolve(query.scope==="saved"?[saved]:[xhs]));api.saveVisualTemplate.mockResolvedValue(saved);api.getAssetFileDownloadUrl.mockResolvedValue({url:"/owned-image",fileName:"本人.png"});
 function Home(){const [browse,setBrowse]=useState<TemplateBrowse>({library:"xhs",scope:"builtin",industry:"",mode:"",page:1,selectedId:""}),[remembered,setRemembered]=useState<RememberedTemplateInput>(),[ratio,setRatio]=useState("3:4");return <CanvasTemplateLibrary key={JSON.stringify({...browse,selectedId:""})} presentation="page" browse={browse} onBrowse={setBrowse} remembered={remembered} onRemember={setRemembered} accountId="account-a" assets={[{id:"identity",name:"本人.png",assetType:"image",currentFileId:"chosen-file"}]} capabilities={capabilities} aspectRatio={ratio} onAspectRatio={setRatio} onInsert={insert} onClose={vi.fn()} onUpload={vi.fn()} onLoadMoreAssets={vi.fn()} hasMoreAssets={false} loadingAssets={false}/>;}
 render(<Home/>);fireEvent.click(await screen.findByRole("button",{name:/步骤笔记/}));await screen.findByLabelText("图文形式");fireEvent.change(screen.getByLabelText("图文形式"),{target:{value:"single_cover"}});fireEvent.change(screen.getByLabelText("本期标题"),{target:{value:"明确选单页"}});fireEvent.change(screen.getByLabelText("提示词"),{target:{value:"我编辑的提示词"}});fireEvent.click(screen.getByRole("button",{name:"内容参考图（可选）"}));fireEvent.click(await screen.findByRole("button",{name:"预览 本人.png"}));fireEvent.click(screen.getByRole("button",{name:"使用此素材"}));await waitFor(()=>expect(screen.queryByRole("dialog")).toBeNull());fireEvent.click(screen.getByRole("button",{name:"16:9"}));fireEvent.click(screen.getByRole("button",{name:"收藏整套风格"}));await screen.findByRole("button",{name:"更新收藏"});expect(screen.getByLabelText("图文形式")).toHaveValue("single_cover");expect(screen.getByLabelText("本期标题")).toHaveValue("明确选单页");expect(screen.getByLabelText("提示词")).toHaveValue("我编辑的提示词");expect(screen.getByRole("button",{name:"内容参考图（可选）"})).toHaveTextContent("本人.png");fireEvent.click(screen.getByRole("button",{name:"放入当前画布"}));expect(insert).toHaveBeenCalledWith(saved,expect.objectContaining({pageMode:"single_cover",aspectRatio:"16:9",referenceAssetId:"identity"}));
});

it("私人风格以样图预览，更新收藏保留样图并继续使用本人原始身份图",async()=>{
 vi.stubGlobal("IntersectionObserver",undefined);
 const saved={...template,id:"private-person",scope:"saved" as const,visualMode:"real_person" as const,requiredIdentity:true,references:[{role:"identity" as const,assetId:"portrait",fileId:"portrait-file",checksum:"identity-digest"},{role:"style" as const,assetId:"sample",fileId:"sample-file",checksum:"style-digest"}]};
 api.listVisualTemplates.mockResolvedValue([saved]);api.getAssetFileDownloadUrl.mockResolvedValue({url:"/private-style.png",fileName:"私人样图.png"});api.saveVisualTemplate.mockResolvedValue({...saved,revision:2});
 render(<CanvasTemplateLibrary accountId="account-a" assets={[{id:"portrait",name:"本人原图",assetType:"image",currentFileId:"portrait-file"},{id:"sample",name:"私人样图",assetType:"image",currentFileId:"sample-file"}]} capabilities={capabilities} aspectRatio="3:4" onAspectRatio={vi.fn()} onInsert={insert} onClose={vi.fn()} onUpload={vi.fn()} onLoadMoreAssets={vi.fn()} hasMoreAssets={false} loadingAssets={false}/>);
 await waitFor(()=>expect(api.getAssetFileDownloadUrl).toHaveBeenCalledWith(expect.objectContaining({params:{assetId:"sample",assetFileId:"sample-file"}})));
 fireEvent.click(await screen.findByRole("button",{name:/杂志封面/}));expect(screen.getByRole("button",{name:"本人照片（必选）"})).toHaveTextContent("本人原图");
 fireEvent.click(screen.getByRole("button",{name:"更新收藏"}));await screen.findByText("收藏已更新");
 expect(api.saveVisualTemplate.mock.calls[0]![0].body.template.references).toEqual([{role:"style",assetId:"sample",fileId:"sample-file",checksum:"style-digest"},{role:"identity",assetId:"portrait",fileId:"portrait-file",checksum:"identity-digest"}]);
});
it("私人参考图版本已变化时不显示为已保存风格样图",async()=>{
 api.listVisualTemplates.mockResolvedValue([{...template,scope:"saved",references:[{role:"style",assetId:"sample",fileId:"saved-file",checksum:"old-digest"}]}]);
 render(<CanvasTemplateLibrary accountId="account-a" assets={[{id:"sample",name:"被改动的样图",assetType:"image",currentFileId:"new-file"}]} capabilities={capabilities} aspectRatio="3:4" onAspectRatio={vi.fn()} onInsert={insert} onClose={vi.fn()} onUpload={vi.fn()} onLoadMoreAssets={vi.fn()} hasMoreAssets={false} loadingAssets={false}/>);
 await screen.findByRole("button",{name:/杂志封面/});expect(api.getAssetFileDownloadUrl).not.toHaveBeenCalled();
});

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

// 实际SHA-256内容验证配定向媒体读取provider；不替换scope/epoch/assertCurrent。
import {createHash,webcrypto} from "node:crypto";
it("私人样图沿冻结exact文件通过实际摘要核验后展示，不取素材当前文件",async()=>{
 vi.stubGlobal("IntersectionObserver",undefined);vi.stubGlobal("crypto",webcrypto);
 const bytes=new TextEncoder().encode("私人样图冻结字节"),checksum=createHash("sha256").update(bytes).digest("hex");
 const mediaFetch=vi.fn(async()=>({ok:true,arrayBuffer:async()=>bytes.buffer,headers:new Headers({"content-type":"image/png"})}));vi.stubGlobal("fetch",mediaFetch);
 const createObjectURL=vi.fn(()=>"blob:private-style-exact"),revokeObjectURL=vi.fn();vi.stubGlobal("URL",class extends URL{static createObjectURL=createObjectURL;static revokeObjectURL=revokeObjectURL;});
 api.listVisualTemplates.mockResolvedValue([{...template,scope:"saved",references:[{role:"style",assetId:"sample",fileId:"sample-file",checksum}]}]);api.getAssetFileDownloadUrl.mockResolvedValue({url:"/private-style-exact.png",fileName:"私人样图.png"});
 const view=render(<CanvasTemplateLibrary accountId="account-a" assets={[{id:"sample",name:"私人样图",assetType:"image",currentFileId:"sample-file"}]} capabilities={capabilities} aspectRatio="3:4" onAspectRatio={vi.fn()} onInsert={insert} onClose={vi.fn()} onUpload={vi.fn()} onLoadMoreAssets={vi.fn()} hasMoreAssets={false} loadingAssets={false}/>);
 expect(await screen.findByAltText("画布图片素材")).toHaveAttribute("src","blob:private-style-exact");expect(api.getAssetFileDownloadUrl).toHaveBeenCalledWith({params:{assetId:"sample",assetFileId:"sample-file"},query:undefined,body:undefined});expect(mediaFetch).toHaveBeenCalledWith("/private-style-exact.png",expect.objectContaining({signal:expect.any(AbortSignal)}));expect(createObjectURL).toHaveBeenCalledOnce();view.unmount();expect(revokeObjectURL).toHaveBeenCalledWith("blob:private-style-exact");
});

it("照片选择使用可预览的素材面板，取消不修改，采用后冻结文件版本",async()=>{
 api.listVisualTemplates.mockResolvedValue([{...template,visualMode:"real_person",requiredIdentity:true}]);
 render(<Panel/>);fireEvent.click(await screen.findByRole("button",{name:/杂志封面/}));
 fireEvent.click(screen.getByRole("button",{name:/本人照片（必选）/}));
 expect(await screen.findByRole("dialog")).toBeVisible();
 expect(screen.getByRole("textbox",{name:"搜索素材"})).toBeVisible();
 fireEvent.click(screen.getByRole("button",{name:"取消"}));
 expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
 expect(insert).not.toHaveBeenCalled();
});
