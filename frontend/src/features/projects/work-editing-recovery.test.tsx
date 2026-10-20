import * as React from "react";
import {cleanup,fireEvent,render,screen,waitFor} from "@testing-library/react";
import {afterEach,beforeEach,expect,it,vi} from "vitest";
import type {MomentsResource,WorkCompositionResource} from "@creatoros/contract";
const api=vi.hoisted(()=>({createMomentsVersion:vi.fn(),getMoments:vi.fn(),getMomentsVersion:vi.fn(),listAssets:vi.fn(),searchAssets:vi.fn(),createMaterialLink:vi.fn(),getAssetFileDownloadUrl:vi.fn(),getWorkCompositionBasisVersion:vi.fn(),saveWorkCompositionBasis:vi.fn(),saveWorkCompositionSelection:vi.fn(),getWorkComposition:vi.fn(),selectWorkSource:vi.fn()}));
vi.mock("@/lib/contract-client",()=>({client:api}));
// 真实作品材料组件使用App Router；本文件只提供稳定导航端口，不替换业务组件。
const navigation=vi.hoisted(()=>({push:vi.fn()}));
vi.mock("next/navigation",()=>({useRouter:()=>navigation}));
beforeEach(()=>navigation.push.mockReset());
import {MomentsWorkbench} from "./moments-workbench";
import {WorkCompositionWorkbench} from "./work-composition-workbench";
import {projectWorkspaceId} from "./project-workspaces";
const initial={momentsId:"moments-a",artifactId:"artifact-a",projectId:"project-a",currentVersionId:"version-a",current:{schemaVersion:1,text:"已保存正文",imageUses:[],sourceRefs:[]},createdAt:"2026-10-02T00:00:00Z",updatedAt:"2026-10-02T00:00:00Z"} satisfies MomentsResource;
const basis={schemaVersion:1 as const,topic:"共同主题",claims:[],factItems:[],sourceRefs:[],ruleRefs:[]};
const work={compositionId:"work-a",projectId:"project-a",currentRevision:1,current:{schemaVersion:1,title:"四种表达",selection:[],members:[],basisVersionId:"basis-a"},memberCurrent:[],createdAt:"2026-10-02T00:00:00Z",updatedAt:"2026-10-02T00:00:00Z"} as unknown as WorkCompositionResource;
beforeEach(()=>{Object.values(api).forEach(mock=>mock.mockReset());localStorage.clear();api.getMoments.mockResolvedValue(initial);api.getMomentsVersion.mockResolvedValue({versionId:initial.currentVersionId,document:initial.current});api.createMomentsVersion.mockResolvedValue({});api.listAssets.mockResolvedValue([{id:"image-a",name:"真实图片",assetType:"image",currentFileId:"file-a"}]);api.searchAssets.mockResolvedValue({items:[{id:"image-a",name:"真实图片",assetType:"image",currentFileId:"file-a"}],nextCursor:null,total:1});api.createMaterialLink.mockResolvedValue({id:"link-a"});api.getAssetFileDownloadUrl.mockResolvedValue({url:"/test.png"});api.getWorkCompositionBasisVersion.mockResolvedValue({document:basis});});
afterEach(cleanup);
it("未确认保存经卸载恢复完整原请求，采用实际原文件版本",async()=>{
 api.createMomentsVersion.mockRejectedValueOnce(Error("响应丢失"));
 const first=render(<MomentsWorkbench initial={initial} accountId="account-a"/>);
 fireEvent.change(screen.getByRole("textbox",{name:"朋友圈正文"}),{target:{value:"保留我的编辑"}});
 fireEvent.click(screen.getByRole("button",{name:"保存稿件"}));await screen.findByRole("alert");
 const body=api.createMomentsVersion.mock.calls[0][0].body;
 first.unmount();render(<MomentsWorkbench initial={initial} accountId="account-a"/>);
 await waitFor(()=>expect(screen.getByRole("textbox",{name:"朋友圈正文"})).toHaveValue("保留我的编辑"));
 api.getMoments.mockResolvedValue({...initial,currentVersionId:"version-b",current:body.document});
 fireEvent.click(screen.getByRole("button",{name:"恢复原保存"}));
 await waitFor(()=>expect(api.createMomentsVersion).toHaveBeenCalledTimes(2));
 expect(api.createMomentsVersion.mock.calls[1][0].body).toEqual(body);
 await waitFor(()=>expect(screen.queryByRole("button",{name:"恢复原保存"})).not.toBeInTheDocument());
});
it("图片先建立真实项目引用，重复配图不写入，保存完整精确文件",async()=>{
 render(<MomentsWorkbench initial={initial} accountId="account-a"/>);
 fireEvent.click(screen.getByRole("button",{name:"选择朋友圈配图"}));
 await screen.findByRole("button",{name:"预览 真实图片"});
 fireEvent.click(screen.getByRole("button",{name:"预览 真实图片"}));
 fireEvent.click(screen.getByRole("button",{name:"加入配图"}));
 await screen.findByText("图片已加入当前项目，请保存稿件确认配图。");
 expect(api.createMaterialLink).toHaveBeenCalledWith({params:undefined,query:undefined,body:{projectId:"project-a",entityType:"asset",entityId:"image-a",role:"reference",stage:"research",addedByType:"user"}});
 fireEvent.click(screen.getByRole("button",{name:"选择朋友圈配图"}));
 await screen.findByRole("button",{name:"预览 真实图片"});
 fireEvent.click(screen.getByRole("button",{name:"预览 真实图片"}));
 fireEvent.click(screen.getByRole("button",{name:"加入配图"}));await screen.findByRole("alert");
 expect(api.createMaterialLink).toHaveBeenCalledTimes(1);
 fireEvent.click(screen.getByRole("button",{name:"保存稿件"}));
 await waitFor(()=>expect(api.createMomentsVersion).toHaveBeenCalled());
 expect(api.createMomentsVersion.mock.calls[0][0].body.document.imageUses).toEqual([{assetId:"image-a",assetFileId:"file-a",order:0}]);
});
it("项目引用失败保留正文且不加入未连接图片",async()=>{
 api.createMaterialLink.mockRejectedValue(Error("连接失败"));render(<MomentsWorkbench initial={initial} accountId="account-a"/>);
 fireEvent.change(screen.getByRole("textbox",{name:"朋友圈正文"}),{target:{value:"原编辑"}});
 fireEvent.click(screen.getByRole("button",{name:"选择朋友圈配图"}));await screen.findByRole("button",{name:"预览 真实图片"});
 fireEvent.click(screen.getByRole("button",{name:"预览 真实图片"}));fireEvent.click(screen.getByRole("button",{name:"加入配图"}));
 await screen.findByRole("alert");fireEvent.click(screen.getByRole("button",{name:"取消"}));await waitFor(()=>expect(screen.queryByRole("dialog",{name:"选择朋友圈配图"})).not.toBeInTheDocument());expect(screen.getByRole("textbox",{name:"朋友圈正文"})).toHaveValue("原编辑");expect(screen.getByText(/^已记录来源 0 项 · 0 张配图$/)).toBeInTheDocument();
});
it("明确版本冲突可读最新基线，仍保留用户编辑",async()=>{
 api.createMomentsVersion.mockRejectedValueOnce({code:"VERSION_CONFLICT"});render(<MomentsWorkbench initial={initial} accountId="account-a"/>);
 fireEvent.change(screen.getByRole("textbox",{name:"朋友圈正文"}),{target:{value:"保留编辑"}});fireEvent.click(screen.getByRole("button",{name:"保存稿件"}));await screen.findByRole("alert");
 api.getMoments.mockResolvedValue({...initial,currentVersionId:"new-version",current:{...initial.current,text:"另一窗口已保存"}});
 fireEvent.click(screen.getByRole("button",{name:"刷新版本（保留编辑）"}));await screen.findByText(/已读取最新版本/);
 expect(screen.getByRole("textbox",{name:"朋友圈正文"})).toHaveValue("保留编辑");
 fireEvent.click(screen.getByRole("button",{name:"保存稿件"}));await waitFor(()=>expect(api.createMomentsVersion).toHaveBeenCalledTimes(2));
 expect(api.createMomentsVersion.mock.calls[1][0].body.expectedCurrentVersionId).toBe("new-version");
});
it("账号切换丢弃迟到回执，另一稿面用自己的初始正文",async()=>{
 let complete!:(value:unknown)=>void;api.createMomentsVersion.mockImplementation(()=>new Promise(resolve=>{complete=resolve;}));
 const view=render(<MomentsWorkbench initial={initial} accountId="account-a"/>);
 fireEvent.change(screen.getByRole("textbox",{name:"朋友圈正文"}),{target:{value:"账号A编辑"}});fireEvent.click(screen.getByRole("button",{name:"保存稿件"}));await waitFor(()=>expect(api.createMomentsVersion).toHaveBeenCalled());
 view.rerender(<MomentsWorkbench initial={{...initial,momentsId:"moments-b",current:{...initial.current,text:"账号B稿件"}}} accountId="account-b"/>);complete({});
 await waitFor(()=>expect(screen.getByRole("textbox",{name:"朋友圈正文"})).toHaveValue("账号B稿件"));expect(screen.queryByText(/朋友圈稿已保存/)).not.toBeInTheDocument();
});
it("共享依据保存结束清除脏状态，不丢尚未提交的表达选择",async()=>{
 api.saveWorkCompositionBasis.mockResolvedValue({composition:{...work,currentRevision:2,current:{...work.current,basisVersionId:"basis-b"}}});
 render(<WorkCompositionWorkbench projectId="project-a" projectTitle="项目" accountId="account-a" initial={[work]} outputs={[]}/>);
 await screen.findByRole("textbox",{name:"共享主题"});fireEvent.click(screen.getByRole("checkbox",{name:"朋友圈"}));
 fireEvent.change(screen.getByRole("textbox",{name:"共享主题"}),{target:{value:"修改主题"}});fireEvent.click(screen.getByRole("button",{name:"保存共享依据"}));
 await waitFor(()=>expect(screen.getByRole("button",{name:"保存共享依据"})).toBeDisabled());
 expect(screen.getByRole("combobox",{name:"已有作品组合"})).toBeEnabled();expect(screen.getByRole("checkbox",{name:"朋友圈"})).toBeChecked();
});
it("朋友圈稿面归属作品组合导航",()=>{expect(projectWorkspaceId('/projects/project-a/moments/moments-a')).toBe('work');});
it("表达选择覆盖全部16种组合，包含空选择，不创建或删除稿件",async()=>{
 let revision=1;api.saveWorkCompositionSelection.mockImplementation(async({body})=>({composition:{...work,currentRevision:++revision,current:{...work.current,selection:body.selection}}}));
 render(<WorkCompositionWorkbench projectId="project-a" projectTitle="项目" accountId="account-a" initial={[work]} outputs={[]}/>);
 await screen.findByRole("textbox",{name:"共享主题"});
 const labels=["视频","公众号","图文","朋友圈"],kinds=["video","article","image","moments"];
 for(let mask=1;mask<17;mask++){
  const selected=mask%16;
  for(let position=0;position<4;position++){const box=screen.getByRole("checkbox",{name:labels[position]});if((box as HTMLInputElement).checked!==Boolean(selected&(1<<position)))fireEvent.click(box);}
  fireEvent.click(screen.getByRole("button",{name:"保存表达选择"}));
  await waitFor(()=>expect(api.saveWorkCompositionSelection).toHaveBeenCalledTimes(mask));
  expect(api.saveWorkCompositionSelection.mock.calls[mask-1][0].body.selection.slice().sort()).toEqual(kinds.filter((_kind,i)=>Boolean(selected&(1<<i))).sort());
  await waitFor(()=>expect(screen.getByRole("button",{name:"保存表达选择"})).toBeDisabled());
 }
});
it("组合提交回复丢失保留原请求，恢复使用相同预约和完整输入",async()=>{
 api.saveWorkCompositionSelection.mockRejectedValueOnce(Error("未确认响应"));
 const first=render(<WorkCompositionWorkbench projectId="project-a" projectTitle="项目" accountId="account-a" initial={[work]} outputs={[]}/>);
 await screen.findByRole("textbox",{name:"共享主题"});fireEvent.click(screen.getByRole("checkbox",{name:"朋友圈"}));fireEvent.click(screen.getByRole("button",{name:"保存表达选择"}));await screen.findByRole("alert");
 const request=api.saveWorkCompositionSelection.mock.calls[0][0];first.unmount();
 api.saveWorkCompositionSelection.mockResolvedValue({composition:{...work,currentRevision:2,current:{...work.current,selection:["moments"]}}});
 render(<WorkCompositionWorkbench projectId="project-a" projectTitle="项目" accountId="account-a" initial={[work]} outputs={[]}/>);
 fireEvent.click(await screen.findByRole("button",{name:"恢复原请求"}));
 await waitFor(()=>expect(api.saveWorkCompositionSelection).toHaveBeenCalledTimes(2));expect(api.saveWorkCompositionSelection.mock.calls[1][0]).toEqual(request);
 await waitFor(()=>expect(screen.getByRole("checkbox",{name:"朋友圈"})).toBeChecked());
});

it("复制明确保存版本，未保存编辑不混入交付",async()=>{const writeText=vi.fn(async()=>{});Object.defineProperty(navigator,"clipboard",{configurable:true,value:{writeText}});render(<MomentsWorkbench initial={initial} accountId="account-a"/>);fireEvent.change(screen.getByRole("textbox",{name:"朋友圈正文"}),{target:{value:"尚未保存正文"}});fireEvent.click(screen.getByRole("button",{name:"复制已保存正文"}));await screen.findByText("已复制指定保存版本的正文。");expect(api.getMomentsVersion).toHaveBeenCalledWith({params:{momentsId:"moments-a",versionId:"version-a"},query:undefined,body:undefined});expect(writeText).toHaveBeenCalledWith("已保存正文");expect(screen.getByRole("textbox",{name:"朋友圈正文"})).toHaveValue("尚未保存正文");});
it("用户明确选择保存版本和字段，核验时保护编辑，保存前不写共享依据",async()=>{
 let finish!:(value:unknown)=>void;api.selectWorkSource.mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));
 const item={...work,memberCurrent:[{member:{kind:"moments",momentsId:"moments-a"},availability:"available",currentVersion:{kind:"artifact",artifactId:"artifact-a",versionId:"version-a"}}]} as unknown as WorkCompositionResource;
 render(<WorkCompositionWorkbench projectId="project-a" projectTitle="项目" accountId="account-a" initial={[item]} outputs={[]}/>);await screen.findByRole("textbox",{name:"共享主题"});
 fireEvent.change(screen.getByRole("textbox",{name:"共享主题"}),{target:{value:"保留手工主题"}});
 fireEvent.change(screen.getByRole("combobox",{name:"来源稿件版本"}),{target:{value:"moments"}});fireEvent.change(screen.getByRole("combobox",{name:"来源使用范围"}),{target:{value:"text"}});fireEvent.click(screen.getByRole("button",{name:"添加所选依据"}));
 await waitFor(()=>expect(api.selectWorkSource).toHaveBeenCalledWith({params:undefined,query:undefined,body:{projectId:"project-a",pick:{kind:"moments_version",momentsId:"moments-a",versionId:"version-a",selection:{mode:"selected",fields:["text"],textRanges:[]}}}}));
 expect(screen.getByRole("button",{name:"保存共享依据"})).toBeDisabled();expect(screen.getByRole("textbox",{name:"共享主题"})).toBeDisabled();
 finish({source:{kind:"moments_version",momentsId:"moments-a",versionId:"version-a",artifactId:"artifact-a",selection:{mode:"whole"},selectionDigest:"a".repeat(64)}});
 await screen.findByText("来源已核验，保存共享依据后记录。");expect(screen.getByRole("textbox",{name:"共享主题"})).toHaveValue("保留手工主题");expect(screen.getByText(/已记录来源 1 项/)).toBeInTheDocument();expect(api.saveWorkCompositionBasis).not.toHaveBeenCalled();
});
it("来源显示实际保存范围，移除只在明确保存后生效且保留其他编辑",async()=>{
 const source={kind:"moments_version" as const,momentsId:"moments-a",artifactId:"artifact-a",versionId:"version-a",selectionDigest:"a".repeat(64),selection:{mode:"selected" as const,fields:["text" as const],textRanges:[]}};
 api.getWorkCompositionBasisVersion.mockResolvedValue({document:{...basis,sourceRefs:[source]}});
 api.saveWorkCompositionBasis.mockResolvedValue({composition:{...work,currentRevision:2,current:{...work.current,basisVersionId:"basis-b"}}});
 render(<WorkCompositionWorkbench projectId="project-a" projectTitle="项目" accountId="account-a" initial={[work]} outputs={[]}/>);
 await screen.findByText("朋友圈 · 短文");expect(screen.getByText("保存版本：version-a")).toBeInTheDocument();
 fireEvent.change(screen.getByRole("textbox",{name:"共享主题"}),{target:{value:"保留手工主题"}});
 fireEvent.click(screen.getByRole("button",{name:"移除来源 1"}));expect(api.saveWorkCompositionBasis).not.toHaveBeenCalled();
 expect(screen.getByRole("textbox",{name:"共享主题"})).toHaveValue("保留手工主题");
 fireEvent.click(screen.getByRole("button",{name:"保存共享依据"}));await waitFor(()=>expect(api.saveWorkCompositionBasis).toHaveBeenCalledTimes(1));
 expect(api.saveWorkCompositionBasis.mock.calls[0][0].body.document).toMatchObject({topic:"保留手工主题",sourceRefs:[]});
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
