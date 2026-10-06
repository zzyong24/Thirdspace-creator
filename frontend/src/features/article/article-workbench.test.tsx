import * as React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createOutput: vi.fn(), getArticle: vi.fn(), getArticleVersion: vi.fn(), generateArticleCandidate: vi.fn(),
  getTask: vi.fn(), getArticleCandidate: vi.fn(),
  getAssetFileDownloadUrl: vi.fn(), listAssets: vi.fn(),
  listMaterialLinks: vi.fn(), getAsset: vi.fn(),
  adoptArticleCandidate: vi.fn(), createArticleVersion: vi.fn(),
}));
vi.mock("@/lib/contract-client", () => ({ client: mocks }));

import { ArticleWorkbench } from "./article-workbench";
async function openAux(){const label=await screen.findByText("AI 辅助生成与内容扩展");const details=label.closest("details")!;details.open=true;fireEvent(details,new Event("toggle"));await screen.findByRole("button",{name:"根据脚本扩写文章"});}


const empty = {
  schemaVersion: 1, title: "", summary: "", sections: [], factItems: [], visualBriefs: [], imageUses: [],
};
const saved = {
  outputId: "output-a", artifactId: "article-a", currentVersionId: "v1", current: empty,
  versions: [{ id: "v1", versionNumber: 1, createdAt: "2026-09-30T00:00:00.000Z", changeSummary: "空稿" }],
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("confirm", vi.fn(() => true));
  mocks.getArticle.mockResolvedValue(saved);
  mocks.getArticleVersion.mockResolvedValue({ versionId: "v1", document: { ...empty, title: "旧标题",
    sections: [{ sectionId: "old", order: 1, heading: "旧段落", body: "旧正文", sourceRefs: [] }] } });
  mocks.listAssets.mockResolvedValue([{ id: "image-a", name: "已入库图片", assetType: "image", status: "active", currentFileId: "file-a" }]);
  mocks.listMaterialLinks.mockResolvedValue([]);
  mocks.getAsset.mockResolvedValue({ id: "document-a", name: "项目资料", assetType: "document", status: "active",
    currentFileId: "file-v2", extractStatus: "done", extractedText: "可核验来源正文" });
  mocks.getAssetFileDownloadUrl.mockResolvedValue({ url: "/api/assets/image-a/files/file-a", fileName: "image.png" });
  mocks.createOutput.mockResolvedValue({ id: "output-a" });
  mocks.generateArticleCandidate.mockResolvedValue({ taskId: "candidate-a", candidateId: "candidate-a", status: "queued" });
  mocks.getTask.mockResolvedValue({ status: "awaiting_confirmation", errorMessage: null });
  mocks.getArticleCandidate.mockResolvedValue({ candidateId: "candidate-a", proposedTitle: "真实标题", proposedSummary: "摘要", proposedFactItems: [],
    proposedSections: [{ op: "insert", sectionId: "s1", afterSectionId: null, order: 1, heading: "开头", body: "正文", sourceRefs: [] }], proposedVisualBriefs: [] });
  mocks.adoptArticleCandidate.mockResolvedValue({ versionId: "v2", document: empty });
});
afterEach(() => { cleanup(); sessionStorage.clear(); vi.unstubAllGlobals(); });

describe("公众号文章工作台", () => {
  it("衍生稿不重复页头小字，正文与段落标题跟脚本使用同一字号", async () => {
    mocks.getArticle.mockResolvedValue({...saved,current:{...empty,sections:[{sectionId:"s",order:0,heading:"段落",headingLevel:2,body:"正文",sourceRefs:[]}]}});
    const {container}=render(<ArticleWorkbench projectId="project-a" projectTitle="项目名称" initialOutputs={[{id:"output-a",title:"公众号衍生稿"}]}/>);
    await screen.findByLabelText("段落正文");
    for(const text of ["项目名称 / 公众号文章","文章创作","返回项目稿面","文章产物","当前版本 v1","本次依据与资料（可选）"]){expect(screen.queryByText(text)).not.toBeInTheDocument();}
    expect(screen.queryByText(/沿用脚本信息，快速扩写正文/)).not.toBeInTheDocument();
    expect(container.querySelector('main')).toHaveClass("text-sm");
    expect(screen.getByLabelText("段落正文")).toHaveClass("text-sm","leading-relaxed");
    expect(screen.getByLabelText("段落标题")).toHaveClass("text-[13px]","font-semibold");
    expect(screen.queryByRole("combobox",{name:"选择文章"})).not.toBeInTheDocument();
    await openAux();expect(screen.getByRole("combobox",{name:"选择文章"})).toHaveValue("output-a");
    expect(screen.getByRole("button",{name:"保存修改"})).toBeDisabled();
    fireEvent.change(screen.getByLabelText("段落正文"),{target:{value:"继续改稿"}});
    expect(screen.getByRole("button",{name:"保存修改"})).toHaveAttribute("title","有未保存的修改");
  });
  it("稿面隐藏页头版本小字，段落来源与图片接口继续使用精确 ID", async () => {
    mocks.getArticle.mockResolvedValue({ ...saved, currentVersionId: "internal-version-current",
      versions: [...saved.versions, {id: "internal-version-current", versionNumber: 7, createdAt: "2026-10-01T00:00:00.000Z", changeSummary: "保存正文"}],
      current: { ...empty, title: "正式文章", titleSourceRefs: [{kind: "project", id: "internal-project-id", versionId: "internal-source-version"}],
        sections: [{sectionId: "internal-section-id", order: 0, heading: "给读者的第一步", body: "正文", sourceRefs: []}],
        imageUses: [{sectionId: "internal-section-id", assetId: "image-a", assetFileId: "internal-file-id", sourceKind: "existing", reviewState: "selected"}] } });
    render(<ArticleWorkbench projectId="project-a" projectTitle="选题" initialOutputs={[{id: "output-a", title: "文章"}]} />);
    await waitFor(() => expect(screen.getByRole("img", {name: "给读者的第一步 的已选配图"})).toBeTruthy());
    expect(screen.queryByText("当前版本 v7")).not.toBeInTheDocument();
    expect(screen.getByText("来源：项目资料")).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/internal-(?:version|project|source|section|file)/);
    expect(mocks.getAssetFileDownloadUrl).toHaveBeenCalledWith({params: {assetId: "image-a", assetFileId: "internal-file-id"}, query: undefined, body: undefined});
  });

  it("未绑定目标平台也能新建本地文章", async () => {
    render(<ArticleWorkbench projectId="project-a" projectTitle="选题" briefReady articleTargetSelected={false} initialOutputs={[]} />);
    expect(screen.getByRole("button", { name: "新建文章" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "新建文章" }));
    await waitFor(() => expect(mocks.createOutput).toHaveBeenCalledWith(expect.objectContaining({
      params: {projectId: "project-a"}, body: expect.objectContaining({contentType: "article"}),
    })));
  });

  it("Brief 缺失时仍可手写和生成通用候选", async () => {
    render(<ArticleWorkbench projectId="project-a" projectTitle="选题" briefReady={false} articleTargetSelected initialOutputs={[{ id: "output-a", title: "文章" }]} />);
    await waitFor(() => expect(screen.getByText("当前稿件")).toBeTruthy());
    await openAux();
    expect(screen.getByRole("button", { name: "根据脚本扩写文章" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "添加段落" })).toBeEnabled();
  });

  it("生成结果只作为候选展示，明确采纳后才写入", async () => {
    render(<ArticleWorkbench projectId="project-a" projectTitle="选题" briefReady articleTargetSelected initialOutputs={[{ id: "output-a", title: "文章" }]} />);
    await waitFor(() => expect(screen.getByText("当前稿件")).toBeTruthy());
    await openAux();
    fireEvent.click(screen.getByRole("button", { name: "根据脚本扩写文章" }));
    await waitFor(() => expect(screen.getByText(/候选已生成/)).toBeTruthy());
    expect(screen.getByText("真实标题")).toBeTruthy();
    expect(mocks.adoptArticleCandidate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "确认采纳所选内容" }));
    await waitFor(() => expect(mocks.adoptArticleCandidate).toHaveBeenCalledWith({
      params: { candidateId: "candidate-a" }, query: undefined,
      body: expect.objectContaining({ expectedCurrentVersionId: "v1", selectedSectionIds: ["s1"],
        selectedMetadataFields: ["title", "summary", "factItems"] }),
    }));
  });

  it("默认继承当前账号品牌版本，也能改选中性写作", async () => {
    render(<ArticleWorkbench projectId="project-a" projectTitle="选题" briefReady articleTargetSelected
      initialOutputs={[{ id: "output-a", title: "文章" }]}
      activeBrandProfile={{ id: "statement-v3", versionNumber: 3, oneLiner: "月明的已选身份" }} />);
    await waitFor(() => expect(screen.getByText("当前稿件")).toBeTruthy());
    await openAux();
    expect(screen.getByRole("radio", { name: /使用当前账号品牌版本 v3/ })).toBeChecked();
    fireEvent.click(screen.getByRole("radio", { name: "中性写作方法" }));
    expect(screen.getByRole("radio", { name: "中性写作方法" })).toBeChecked();
    fireEvent.click(screen.getByRole("radio", { name: /使用当前账号品牌版本 v3/ }));
    await openAux();
    fireEvent.click(screen.getByRole("button", { name: "根据脚本扩写文章" }));
    await waitFor(() => expect(mocks.generateArticleCandidate).toHaveBeenCalledWith({
      params: { outputId: "output-a" }, query: undefined,
      body: expect.objectContaining({ brandProfileVersionId: "statement-v3" }),
    }));
  });

  it("只把显式勾选的项目文档精确文件版本交给模型", async () => {
    mocks.listMaterialLinks.mockResolvedValue([{ entityType: "asset", entityId: "document-a" }]);
    render(<ArticleWorkbench projectId="project-a" projectTitle="选题" briefReady articleTargetSelected
      initialOutputs={[{ id: "output-a", title: "文章" }]} />);
    await openAux();
    await waitFor(() => expect(screen.getByText("项目资料")).toBeTruthy());
    fireEvent.click(screen.getByRole("checkbox", { name: /项目资料/ }));
    await openAux();
    fireEvent.click(screen.getByRole("button", { name: "根据脚本扩写文章" }));
    await waitFor(() => expect(mocks.generateArticleCandidate).toHaveBeenCalledWith({
      params: { outputId: "output-a" }, query: undefined,
      body: expect.objectContaining({ sourceAssets: [{ assetId: "document-a", assetFileId: "file-v2" }] }),
    }));
  });

  it("候选事实采纳前显示旧清单与将替换的新清单", async () => {
    mocks.getArticle.mockResolvedValue({ ...saved, current: { ...empty, factItems: [{ id: "fact-old", text: "旧事实",
      reviewState: "needs_confirmation", sourceRefs: [] }] } });
    mocks.getArticleCandidate.mockResolvedValue({ candidateId: "candidate-a", proposedTitle: "新标题", proposedSummary: "新摘要",
      proposedFactItems: [{ id: "fact-new", text: "待核新事实", reviewState: "needs_confirmation", sourceRefs: [] }],
      proposedSections: [], proposedVisualBriefs: [] });
    render(<ArticleWorkbench projectId="project-a" projectTitle="选题" briefReady articleTargetSelected
      initialOutputs={[{ id: "output-a", title: "文章" }]} />);
    await waitFor(() => expect(screen.getByText("当前稿件")).toBeTruthy());
    await openAux();
    fireEvent.click(screen.getByRole("button", { name: "根据脚本扩写文章" }));
    await waitFor(() => expect(screen.getByTestId("article-fact-diff")).toHaveTextContent("当前清单：旧事实"));
    expect(screen.getByTestId("article-fact-diff")).toHaveTextContent("候选清单：待核新事实");
  });

  it("从已保存的版本读取历史正文，不用当前编辑态替代", async () => {
    render(<ArticleWorkbench projectId="project-a" projectTitle="选题" briefReady articleTargetSelected initialOutputs={[{ id: "output-a", title: "文章" }]} />);
    await waitFor(() => expect(screen.getByText("历史版本")).toBeTruthy());
    const history=screen.getByText("历史版本").closest("details")!;history.open=true;fireEvent(history,new Event("toggle"));
    fireEvent.click(screen.getByRole("button", { name: "查看此版" }));
    await waitFor(() => expect(screen.getByText("旧正文")).toBeTruthy());
    expect(mocks.getArticleVersion).toHaveBeenCalledWith({ params: { outputId: "output-a", versionId: "v1" }, query: undefined, body: undefined });
  });

  it("可编辑文章元数据并通过版本保存，不发模型任务", async () => {
    const document = { ...empty, title: "手写标题", summary: "真实摘要" };
    mocks.createArticleVersion.mockResolvedValue({ versionId: "v2", document });
    mocks.getArticleVersion.mockResolvedValue({ versionId: "v2", document });
    mocks.getArticle.mockResolvedValueOnce(saved).mockResolvedValueOnce({ ...saved, currentVersionId: "v2", current: document,
      versions: [...saved.versions, { id: "v2", versionNumber: 2, createdAt: "2026-10-01T00:00:00.000Z", changeSummary: "手写标题" }] });
    render(<ArticleWorkbench projectId="project-a" projectTitle="选题" briefReady articleTargetSelected initialOutputs={[{ id: "output-a", title: "文章" }]} />);
    await waitFor(() => expect(screen.getByText("当前稿件")).toBeTruthy());
    fireEvent.change(screen.getByLabelText("标题"), { target: { value: "手写标题" } });
    fireEvent.change(screen.getByLabelText("摘要"), { target: { value: "真实摘要" } });
    fireEvent.click(screen.getByRole("button", { name: "保存修改" }));
    await waitFor(() => expect(mocks.createArticleVersion).toHaveBeenCalledWith({
      params: { outputId: "output-a" }, query: undefined,
      body: expect.objectContaining({ expectedCurrentVersionId: "v1", document: expect.objectContaining({
        title: "手写标题", summary: "真实摘要",
      }) }),
    }));
    expect(mocks.generateArticleCandidate).not.toHaveBeenCalled();
  });

  it("手工修改衍生稿正文仍保留稳定段落、来源和 NoteRelay 版式", async () => {
    const nativeLayout = {schemaVersion:1,editor:"noterelay",editorVersion:"0.1.8",themeId:"moyu-green",authorName:"真实署名",authorBio:"",variables:{},fontSize:16,splitHeading:2,templateId:"default",imageWidths:{},imageRadii:{}};
    const sourceRefs = [{kind:"project_script",id:"master-a",versionId:"master-version-a"}];
    const current = {...empty,nativeLayout,sections:[{sectionId:"stable-section",order:0,heading:"原标题",headingLevel:2,body:"原正文",sourceRefs}]};
    mocks.getArticle.mockResolvedValue({...saved,current});
    mocks.createArticleVersion.mockResolvedValue({versionId:"v2",document:current});
    render(<ArticleWorkbench projectId="project-a" projectTitle="选题" briefReady articleTargetSelected initialOutputs={[{id:"output-a",title:"文章"}]} />);
    await screen.findByLabelText("段落正文");
    fireEvent.change(screen.getByLabelText("段落标题"),{target:{value:"改过的标题"}});
    fireEvent.change(screen.getByLabelText("段落正文"),{target:{value:"基于确定脚本继续改写的正文。"}});
    fireEvent.click(screen.getByRole("button",{name:"保存修改"}));
    await waitFor(()=>expect(mocks.createArticleVersion).toHaveBeenCalledWith({
      params:{outputId:"output-a"},query:undefined,
      body:expect.objectContaining({expectedCurrentVersionId:"v1",document:expect.objectContaining({
        nativeLayout,sections:[expect.objectContaining({sectionId:"stable-section",order:0,heading:"改过的标题",body:"基于确定脚本继续改写的正文。",sourceRefs})],
      })}),
    }));
    expect(mocks.generateArticleCandidate).not.toHaveBeenCalled();
    expect(screen.getByRole("button",{name:"根据脚本扩写文章"})).toBeEnabled();
  });

  it("只能从当前账号 active 图片中审看并选用精确文件版本", async () => {
    render(<ArticleWorkbench projectId="project-a" projectTitle="选题" briefReady articleTargetSelected initialOutputs={[{ id: "output-a", title: "文章" }]} />);
    await waitFor(() => expect(screen.getByText("当前稿件")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "添加段落" }));
    fireEvent.click(screen.getByRole("button", { name: "为此段选图" }));
    await waitFor(() => expect(screen.getByRole("option", { name: "已入库图片" })).toBeTruthy());
    fireEvent.change(screen.getByLabelText("选择图片素材"), { target: { value: "image-a" } });
    await waitFor(() => expect(mocks.getAssetFileDownloadUrl).toHaveBeenCalledWith({ params: { assetId: "image-a", assetFileId: "file-a" }, query: undefined, body: undefined }));
    fireEvent.click(screen.getByRole("button", { name: "确认选用此图" }));
    fireEvent.click(screen.getByRole("button", { name: "保存修改" }));
    await waitFor(() => expect(mocks.createArticleVersion).toHaveBeenCalledWith({
      params: { outputId: "output-a" }, query: undefined,
      body: expect.objectContaining({ document: expect.objectContaining({ imageUses: [expect.objectContaining({
        assetId: "image-a", assetFileId: "file-a", sourceKind: "existing", reviewState: "selected",
      })] }) }),
    }));
  });
});


describe("T-1043 真实作品选择与未保存稿保护", () => {
  const choices = [{id:"output-a",title:"文章甲"},{id:"output-b",title:"文章乙"}];
  it("多稿未指定时不暗选第一份，明确选择后才读真实稿", async () => {
    render(<ArticleWorkbench projectId="project-a" projectTitle="选题" initialOutputs={choices} />);
    expect(screen.getByLabelText("选择文章")).toHaveValue("");
    expect(mocks.getArticle).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("选择文章"), {target:{value:"output-b"}});
    await waitFor(() => expect(mocks.getArticle).toHaveBeenCalledWith({params:{outputId:"output-b"},query:undefined,body:undefined}));
  });
  it("明确不存在的稿件不会落到另一份稿", () => {
    render(<ArticleWorkbench projectId="project-a" projectTitle="选题" initialOutputId="missing" initialOutputs={choices} />);
    expect(screen.getByLabelText("选择文章")).toHaveValue("");
    expect(mocks.getArticle).not.toHaveBeenCalled();
  });
  it("切稿前可以继续编辑；保存失败保留原稿和待切换目标", async () => {
    mocks.createArticleVersion.mockRejectedValue(new Error("保存失败"));
    render(<ArticleWorkbench projectId="project-a" projectTitle="选题" initialOutputId="output-a" initialOutputs={choices} />);
    await screen.findByText("当前稿件");
    fireEvent.change(screen.getByLabelText("标题"),{target:{value:"尚未保存的标题"}});
    fireEvent.change(screen.getByLabelText("选择文章"), {target:{value:"output-b"}});
    expect(screen.getByRole("alertdialog")).toBeVisible();
    fireEvent.click(screen.getByRole("button",{name:"继续编辑当前稿"}));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(screen.getByLabelText("标题")).toHaveValue("尚未保存的标题");
    fireEvent.change(screen.getByLabelText("选择文章"), {target:{value:"output-b"}});
    fireEvent.click(screen.getByRole("button",{name:"保存后继续"}));
    await waitFor(() => expect(mocks.createArticleVersion).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByRole("button",{name:"保存后继续"})).toBeEnabled());
    expect(screen.getByRole("alertdialog")).toBeVisible();
    expect(screen.getByLabelText("选择文章")).toHaveValue("output-a");
    expect(screen.getByLabelText("标题")).toHaveValue("尚未保存的标题");
    expect(mocks.getArticle.mock.calls.every(call => call[0].params.outputId === "output-a")).toBe(true);
    fireEvent.click(screen.getByRole("button",{name:"放弃修改并继续"}));
    await waitFor(() => expect(screen.getByLabelText("选择文章")).toHaveValue("output-b"));
  });
});

 it("首次沿用脚本标题简介标签，主生成入口直接可见且不默认覆盖已填元数据",async()=>{
 const metadataSource={kind:"project",projectId:"project-a",updatedAt:"2026-10-04"};
 mocks.getArticle.mockResolvedValue({...saved,scriptContext:{state:"ready",scriptRef:null,scriptText:"主稿",metadata:{title:"来自脚本的标题",summary:"来自脚本的简介",tags:["脚本标签"]},metadataSource}});
 render(<ArticleWorkbench projectId="project-a" projectTitle="选题" initialOutputs={[{id:"output-a",title:"文章"}]}/>);
 await waitFor(()=>expect(screen.getByRole("textbox",{name:"标题"})).toHaveValue("来自脚本的标题"));
 expect(screen.getByRole("textbox",{name:"摘要"})).toHaveValue("来自脚本的简介");
 expect(screen.getByRole("textbox",{name:"标签"})).toHaveValue("脚本标签");
 expect(screen.getByRole("button",{name:"根据脚本扩写文章"})).toBeEnabled();
 expect(screen.getByRole("button",{name:"保存修改"})).toBeEnabled();
 });
 it("已有稿生成后标题与摘要默认不被重写",async()=>{
 mocks.getArticle.mockResolvedValue({...saved,current:{...empty,title:"人工标题",summary:"人工简介"}});
 render(<ArticleWorkbench projectId="project-a" projectTitle="选题" initialOutputs={[{id:"output-a",title:"文章"}]}/>);
 await screen.findByText("当前稿件");await openAux();fireEvent.click(screen.getByRole("button",{name:"根据脚本扩写文章"}));
 await screen.findByText(/候选已生成/);
 expect(screen.getByRole("checkbox",{name:/候选标题/})).not.toBeChecked();
 expect(screen.getByRole("checkbox",{name:/候选摘要/})).not.toBeChecked();
 });

it("逐字编辑文章多个标签时保留分隔符，保存仍提交规范数组",async()=>{
 render(<ArticleWorkbench projectId="project-a" projectTitle="选题" initialOutputs={[{id:"output-a",title:"文章"}]}/>);await screen.findByText("当前稿件");
 const user=userEvent.setup();await user.type(screen.getByRole("textbox",{name:"标签"}),"第一项、第二项");expect(screen.getByRole("textbox",{name:"标签"})).toHaveValue("第一项、第二项");
 mocks.createArticleVersion.mockImplementation(async({body})=>({versionId:"v2",document:body.document}));mocks.getArticleVersion.mockImplementation(async()=>({versionId:"v2",document:mocks.createArticleVersion.mock.calls[0][0].body.document}));mocks.getArticle.mockImplementation(async()=>({...saved,currentVersionId:"v2",current:mocks.createArticleVersion.mock.calls[0][0].body.document}));fireEvent.click(screen.getByRole("button",{name:"保存修改"}));await waitFor(()=>expect(mocks.createArticleVersion).toHaveBeenCalledWith(expect.objectContaining({body:expect.objectContaining({document:expect.objectContaining({tags:["第一项","第二项"]})})})));
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
  window.localStorage.setItem("creatoros:current-group", "t1062-unit-test-group");
  window.localStorage.removeItem("creatoros:current-account");
});
t1062ScopeAfterEach(() => {
  window.localStorage.removeItem("creatoros:current-group");
  window.localStorage.removeItem("creatoros:current-account");
});
// T1062_UNIT_SCOPE_FIXTURE_END
