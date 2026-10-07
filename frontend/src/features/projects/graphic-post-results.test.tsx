import * as React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({ listCreativeCapabilities: vi.fn(), listResults: vi.fn(), listBundles: vi.fn(),
  generateResult: vi.fn(), getResult: vi.fn(), adoptResult: vi.fn(), getAssetFileDownloadUrl: vi.fn(),createBundle:vi.fn(),getBundle:vi.fn(),retryResult:vi.fn(),getGraphicPost:vi.fn() }));
vi.mock("@/lib/contract-client", () => ({ client: api }));

import { GraphicPostResults } from "./graphic-post-results";

const image = { assetId: "asset-card", assetFileId: "file-card", order: 0, role: "card" };
const card = { resultId: "result-card", kind: "image_card", outputId: "output", status: "awaiting_confirmation",
  value: [image], createdAt: "2026-10-01T01:00:00Z", errorCode: null };
const props = { accountId: "account", outputId: "output", targetPlatform: "xiaohongshu", currentVersionId: "version-one",
  manualDraftDirty: false, prepareGeneration: vi.fn(async () => true), onAdopt: vi.fn(async () => {}) };

describe("图文图卡结果", () => {
  beforeEach(() => {
    Object.values(api).forEach((mock) => mock.mockReset());
    props.prepareGeneration.mockClear(); props.onAdopt.mockClear();
    api.listCreativeCapabilities.mockResolvedValue({ items: [{ outputType: "image", platform: "xiaohongshu", kind: "image_card", state: "supported" }] });
    api.listResults.mockResolvedValue({ items: [] });
    api.listBundles.mockResolvedValue({ items: [] });
    api.getAssetFileDownloadUrl.mockResolvedValue({ url: "http://example.test/card.png" });
  });

  it("从服务端恢复候选，预览真实素材后按当前图文版本采纳", async () => {
    api.listResults.mockResolvedValue({ items: [card] });
    api.getResult.mockResolvedValue({ ...card, status: "adopted" });
    api.adoptResult.mockResolvedValue({ status: "adopted" });
    render(<GraphicPostResults {...props} />);
    await waitFor(() => expect(api.getAssetFileDownloadUrl).toHaveBeenCalledWith({ params: {
      assetId: "asset-card", assetFileId: "file-card" }, query: undefined, body: undefined }));
    await waitFor(() => expect(screen.getByRole("button", { name: "采纳这张图卡" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "采纳这张图卡" }));
    await waitFor(() => expect(api.adoptResult).toHaveBeenCalledWith({ params: { resultId: "result-card" }, query: undefined,
      body: { expected: { owner: "graphic_post", versionId: "version-one" }, editedValue: [image], clientRequestId: expect.any(String) } }));
    await waitFor(() => expect(props.onAdopt).toHaveBeenCalled());
    expect(await screen.findByRole("button", { name: "生成下一张图卡" })).toBeEnabled();
  });

  it("未保存手工稿禁用采纳；支持时可独立提交下一张图卡", async () => {
    api.listResults.mockResolvedValue({ items: [card] });
    api.generateResult.mockResolvedValue({ ...card, resultId: "next-card", status: "queued", value: null, createdAt: "2026-10-01T02:00:00Z" });
    const { rerender } = render(<GraphicPostResults {...props} manualDraftDirty />);
    expect(await screen.findByRole("button", { name: "采纳这张图卡" })).toBeDisabled();
    rerender(<GraphicPostResults {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "重新生成图卡" }));
    await waitFor(() => expect(api.generateResult).toHaveBeenCalledWith({ params: { outputId: "output" }, query: undefined,
      body: { kind: "image_card", clientRequestId: expect.any(String) } }));
    expect(props.prepareGeneration).toHaveBeenCalled();
  });
});

describe('组图逐页候选',()=>{
 const pages=[{cardId:'page-a',title:'第一页',body:'第一',sourceRefs:[]},{cardId:'page-b',title:'第二页',body:'第二',sourceRefs:[]}];
 beforeEach(()=>{
  window.sessionStorage.clear();
  Object.values(api).forEach(mock=>mock.mockReset());props.prepareGeneration.mockClear();props.onAdopt.mockClear();
  api.listCreativeCapabilities.mockResolvedValue({items:[{outputType:'image',platform:'xiaohongshu',kind:'image_card',state:'supported'}]});
  api.listResults.mockResolvedValue({items:[]});api.listBundles.mockResolvedValue({items:[]});
  api.getAssetFileDownloadUrl.mockResolvedValue({url:'http://example.test/exact.png'});
 });
 it('编导图片要求走原page generator；未知后新要求不覆盖原body/key',async()=>{
  api.generateResult.mockRejectedValueOnce(Error('original response unknown')).mockResolvedValueOnce({...card,status:'awaiting_confirmation',targetSectionId:'page-b',value:[{...image,cardId:'page-b'}]});
  const series={cards:pages,selectedCardId:'page-b',selectedCardIds:['page-b']};
  const view=render(<GraphicPostResults {...props} series={series} imageRequest={{cardId:'page-b',visualRequirements:'蓝色示意图'}}/>);
  fireEvent.click(await screen.findByRole('button',{name:'按编导要求生成所选页图片'}));await screen.findByRole('alert');
  const original=api.generateResult.mock.calls[0][0];expect(original.body).toMatchObject({kind:'image_card',targetSectionId:'page-b',ruleOverrides:{visualRequirements:'蓝色示意图'}});
  view.rerender(<GraphicPostResults {...props} series={series} imageRequest={{cardId:'page-a',visualRequirements:'新要求'}}/>);
  fireEvent.click(screen.getByRole('button',{name:'恢复编导原出图请求'}));await waitFor(()=>expect(api.generateResult).toHaveBeenCalledTimes(2));expect(api.generateResult.mock.calls[1][0]).toEqual(original);
  expect(props.prepareGeneration).toHaveBeenCalledOnce();expect(api.createBundle).not.toHaveBeenCalled();
 });
 it('选中多页提交同一已有bundle，各项保留真实cardId',async()=>{
  api.createBundle.mockResolvedValue({bundleId:'bundle',status:'running',items:[]});
  render(<GraphicPostResults {...props} series={{cards:pages,selectedCardId:'page-b',selectedCardIds:['page-a','page-b']}}/>);
  fireEvent.click(await screen.findByRole('button',{name:'生成所选 2 页'}));
  await waitFor(()=>expect(api.createBundle).toHaveBeenCalledWith({params:{outputId:'output'},query:undefined,body:{items:[{kind:'image_card',targetSectionId:'page-a'},{kind:'image_card',targetSectionId:'page-b'}],clientRequestId:expect.any(String)}}));
  expect(api.generateResult).not.toHaveBeenCalled();
 });
 it('候选严格绑定选中页，精确文件cardId经fresh版本采用不丢失',async()=>{
  const bound={...card,targetSectionId:'page-b',value:[{...image,cardId:'page-b'}]};
  api.listResults.mockResolvedValue({items:[{...bound,resultId:'other',targetSectionId:'page-a',value:[{...image,cardId:'page-a',assetFileId:'other-file'}]},bound]});
  api.getGraphicPost.mockResolvedValue({currentVersionId:'fresh-v2'});
  api.getResult.mockResolvedValue({...bound,status:'adopted'});api.adoptResult.mockResolvedValue({status:'adopted'});
  render(<GraphicPostResults {...props} series={{cards:pages,selectedCardId:'page-b',selectedCardIds:['page-b']}}/>);
  const adopt=await screen.findByRole('button',{name:'采用到这一页'});
  await waitFor(()=>expect(adopt).toBeEnabled());fireEvent.click(adopt);
  await waitFor(()=>expect(api.adoptResult).toHaveBeenCalledWith({params:{resultId:'result-card'},query:undefined,body:{expected:{owner:'graphic_post',versionId:'fresh-v2'},editedValue:[{...image,cardId:'page-b'}],clientRequestId:expect.any(String)}}));
  expect(api.getAssetFileDownloadUrl).not.toHaveBeenCalledWith(expect.objectContaining({params:expect.objectContaining({assetFileId:'other-file'})}));
 });
 it('采用结果未知后跨remount恢复原完整请求，即使owner已保存并更新当前版本',async()=>{
  const bound={...card,targetSectionId:'page-b',value:[{...image,cardId:'page-b'}]};
  api.listResults.mockResolvedValue({items:[bound]});
  api.getGraphicPost.mockResolvedValueOnce({currentVersionId:'original-v1'}).mockResolvedValue({currentVersionId:'owner-already-v2'});
  api.adoptResult.mockRejectedValueOnce(new Error('owner saved but wrapper response lost')).mockResolvedValueOnce({status:'adopted'});
  api.getResult.mockResolvedValue({...bound,status:'adopted'});
  const series={cards:pages,selectedCardId:'page-b',selectedCardIds:['page-b']};
  const first=render(<GraphicPostResults {...props} series={series}/>);
  const adopt=await screen.findByRole('button',{name:'采用到这一页'});await waitFor(()=>expect(adopt).toBeEnabled());fireEvent.click(adopt);
  await screen.findByRole('alert');const original=api.adoptResult.mock.calls[0][0];first.unmount();
  render(<GraphicPostResults {...props} currentVersionId="owner-already-v2" series={series}/>);
  const recover=await screen.findByRole('button',{name:'采用到这一页'});await waitFor(()=>expect(recover).toBeEnabled());fireEvent.click(recover);
  await waitFor(()=>expect(api.adoptResult).toHaveBeenCalledTimes(2));
  expect(api.adoptResult.mock.calls[1][0]).toEqual(original);
  expect(api.getGraphicPost).toHaveBeenCalledTimes(1);
  await waitFor(()=>expect(props.onAdopt).toHaveBeenCalledOnce());
 });
 it('明确409保留候选；remount重新确认可以按新当前版本创建新请求',async()=>{
  const bound={...card,targetSectionId:'page-b',value:[{...image,cardId:'page-b'}]};
  api.listResults.mockResolvedValue({items:[bound]});api.getGraphicPost.mockResolvedValueOnce({currentVersionId:'old-v1'}).mockResolvedValue({currentVersionId:'fresh-v2'});
  api.adoptResult.mockRejectedValueOnce(Object.assign(new Error('conflict'),{status:409})).mockResolvedValueOnce({status:'adopted'});api.getResult.mockResolvedValue({...bound,status:'adopted'});
  const series={cards:pages,selectedCardId:'page-b',selectedCardIds:['page-b']};
  const first=render(<GraphicPostResults {...props} series={series}/>);const adopt=await screen.findByRole('button',{name:'采用到这一页'});await waitFor(()=>expect(adopt).toBeEnabled());fireEvent.click(adopt);await screen.findByRole('alert');
  const original=api.adoptResult.mock.calls[0][0];first.unmount();
  render(<GraphicPostResults {...props} series={series}/>);const again=await screen.findByRole('button',{name:'采用到这一页'});await waitFor(()=>expect(again).toBeEnabled());fireEvent.click(again);
  await waitFor(()=>expect(api.adoptResult).toHaveBeenCalledTimes(2));
  expect(api.adoptResult.mock.calls[1][0].body.expected.versionId).toBe('fresh-v2');
  expect(api.adoptResult.mock.calls[1][0].body.clientRequestId).not.toBe(original.body.clientRequestId);
 });
 it('请求未知后用原请求和原目标恢复，不随新选区重新付费',async()=>{
  api.createBundle.mockRejectedValueOnce(new Error('connection lost')).mockResolvedValueOnce({bundleId:'recovered',status:'complete',items:[]});
  const {rerender}=render(<GraphicPostResults {...props} series={{cards:pages,selectedCardId:'page-b',selectedCardIds:['page-a','page-b']}}/>);
  fireEvent.click(await screen.findByRole('button',{name:'生成所选 2 页'}));await screen.findByRole('alert');
  const original=api.createBundle.mock.calls[0][0];
  rerender(<GraphicPostResults {...props} series={{cards:pages,selectedCardId:'page-a',selectedCardIds:['page-a']}}/>);
  fireEvent.click(screen.getByRole('button',{name:'恢复原组图请求'}));
  await waitFor(()=>expect(api.createBundle).toHaveBeenCalledTimes(2));
  expect(api.createBundle.mock.calls[1][0]).toEqual(original);
 });
 it('旧未绑定图片候选仍可审阅采用，但组图模式不生成无target图片',async()=>{
  api.listResults.mockResolvedValue({items:[card]});
  render(<GraphicPostResults {...props} series={{cards:pages,selectedCardId:'page-b',selectedCardIds:['page-b']}}/>);
  expect(await screen.findByRole('button',{name:'采纳这张图卡'})).toBeInTheDocument();
  expect(screen.queryByRole('button',{name:'重新生成图卡'})).toBeNull();
  expect(screen.getByText('先前未绑定页的图片候选')).toBeInTheDocument();
 });
 it('超过单次12页分组，未知恢复后继续剩余页且不丢13页以后',async()=>{
  const many=Array.from({length:14},(_,index)=>({cardId:`page-${index}`,title:`页${index}`,body:'正文',sourceRefs:[]}));
  api.createBundle.mockRejectedValueOnce(new Error('unknown')).mockResolvedValue({bundleId:'ack',status:'complete',items:[]});
  render(<GraphicPostResults {...props} series={{cards:many,selectedCardId:'page-0',selectedCardIds:many.map(card=>card.cardId)}}/>);
  fireEvent.click(await screen.findByRole('button',{name:'生成所选 14 页'}));await screen.findByRole('alert');
  fireEvent.click(screen.getByRole('button',{name:'恢复原组图请求'}));
  await waitFor(()=>expect(api.createBundle).toHaveBeenCalledTimes(3));
  expect(api.createBundle.mock.calls[1][0]).toEqual(api.createBundle.mock.calls[0][0]);
  expect(api.createBundle.mock.calls[2][0].body.items.map((item:{targetSectionId:string})=>item.targetSectionId)).toEqual(['page-12','page-13']);
 });
 it('迟到的局部重试在切换账号与作品后不串回新页候选',async()=>{
  const failed={...card,resultId:'failed',targetSectionId:'page-b',status:'failed',value:null};
  api.listResults.mockResolvedValueOnce({items:[failed]}).mockResolvedValue({items:[]});
  let resolveRetry!:(value:unknown)=>void;api.retryResult.mockImplementationOnce(()=>new Promise(resolve=>{resolveRetry=resolve;}));
  const {rerender}=render(<GraphicPostResults {...props} series={{cards:pages,selectedCardId:'page-b',selectedCardIds:['page-b']}}/>);
  fireEvent.click(await screen.findByRole('button',{name:'只重试这一页'}));
  rerender(<GraphicPostResults {...props} accountId="other-account" outputId="other-output" series={{cards:pages,selectedCardId:'page-b',selectedCardIds:['page-b']}}/>);
  resolveRetry({...card,resultId:'late',targetSectionId:'page-b',outputId:'output'});
  await waitFor(()=>expect(api.listResults).toHaveBeenCalledTimes(2));
  expect(screen.queryByRole('button',{name:'采用到这一页'})).toBeNull();
 });
 it('服务端未知重试预约恢复原result和原请求号，不提交第三次生图',async()=>{
  const pending={...card,resultId:'reserved',targetSectionId:'page-b',status:'queued',taskId:null,retryOf:'original-failed',retryRequestId:'original-retry-request',errorCode:'RETRY_SUBMISSION_UNKNOWN',value:null};
  api.listResults.mockResolvedValue({items:[pending]});api.retryResult.mockResolvedValue({...pending,taskId:'real-task',errorCode:null});
  render(<GraphicPostResults {...props} series={{cards:pages,selectedCardId:'page-b',selectedCardIds:['page-b']}}/>);
  fireEvent.click(await screen.findByRole('button',{name:'恢复这次单页重试'}));
  await waitFor(()=>expect(api.retryResult).toHaveBeenCalledWith({params:{resultId:'original-failed'},query:undefined,body:{clientRequestId:'original-retry-request'}}));
  expect(api.createBundle).not.toHaveBeenCalled();expect(api.generateResult).not.toHaveBeenCalled();
 });
});


describe("标签候选刷新与编辑保护", () => {
  const queued = { resultId: "queued-text", kind: "tags", outputId: "output",
    targetPlatform: "xiaohongshu", status: "queued", value: null,
    createdAt: "2026-10-01T01:00:00Z", errorCode: null, appliedRules: "not_applied", sourceRefs: [] };
  const succeeded = { ...queued, status: "succeeded", value: ["内容运营", "创作者"] };

  beforeEach(() => {
    Object.values(api).forEach((mock) => mock.mockReset());
    api.listCreativeCapabilities.mockResolvedValue({ items: [] });
    api.listResults.mockResolvedValue({ items: [queued] });
    api.listBundles.mockResolvedValue({ items: [] });
  });

  it("queued 空值随后成功时呈现真实可编辑候选", async () => {
    render(<GraphicPostResults {...props} />);
    await waitFor(() => expect(api.listResults).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("textbox", { name: "标签候选" })).toBeNull();
    api.listResults.mockResolvedValue({ items: [succeeded] });
    fireEvent.click(screen.getByRole("button", { name: "刷新能力与候选" }));
    expect(await screen.findByRole("textbox", { name: "标签候选" })).toHaveValue("内容运营、创作者");
  });

  it("刷新保留用户修改和主动清空，迟到的旧候选不污染较新编辑", async () => {
    api.listResults.mockResolvedValue({ items: [succeeded] });
    render(<GraphicPostResults {...props} />);
    const field = await screen.findByRole("textbox", { name: "标签候选" });
    fireEvent.change(field, { target: { value: "用户确认的修改" } });
    fireEvent.click(screen.getByRole("button", { name: "刷新能力与候选" }));
    await waitFor(() => expect(api.listResults).toHaveBeenCalledTimes(2));
    expect(field).toHaveValue("用户确认的修改");
    fireEvent.change(field, { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "刷新能力与候选" }));
    await waitFor(() => expect(api.listResults).toHaveBeenCalledTimes(3));
    expect(field).toHaveValue("");
    const newer = { ...succeeded, resultId: "newer-text", createdAt: "2026-10-01T02:00:00Z" };
    api.listResults.mockResolvedValue({ items: [newer] });
    fireEvent.click(screen.getByRole("button", { name: "刷新能力与候选" }));
    await waitFor(() => expect(field).toHaveValue("内容运营、创作者"));
    fireEvent.change(field, { target: { value: "较新候选的修改" } });
    api.listResults.mockResolvedValue({ items: [succeeded] });
    fireEvent.click(screen.getByRole("button", { name: "刷新能力与候选" }));
    await waitFor(() => expect(api.listResults).toHaveBeenCalledTimes(5));
    expect(field).toHaveValue("较新候选的修改");
  });
  it("已采纳结果缺少候选值时指向正式稿，不误报采纳未生效", async () => {
    api.listResults.mockResolvedValue({ items: [{ ...succeeded, status: "adopted", value: null }] });
    render(<GraphicPostResults {...props} />);
    expect(await screen.findByText("已采纳")).toBeInTheDocument();
    expect(screen.queryByText(/候选内容尚未读到/)).toBeNull();
    expect(screen.getByText(/已保存到/)).toBeInTheDocument();
  });
  it.each([
    {code: "VERSION_CONFLICT", status: 409, expected: "请刷新后重新审阅"},
    {code: "ConflictError", status: 400, expected: "请刷新后重新审阅"},
    {code: null, status: 409, expected: "请刷新后重新审阅"},
    {code: "SOURCE_UNAVAILABLE", status: 409, expected: "请重新生成这一项"},
  ])("结构化错误 $code/$status 给出实际恢复动作并保留编辑", async (rejection) => {
    const onAdopt = props.onAdopt;
    onAdopt.mockClear();
    api.listResults.mockResolvedValue({ items: [succeeded] });
    api.adoptResult.mockRejectedValue(Object.assign(new Error("internal schema stack failure"), {name: "HttpTransportError", code: rejection.code, status: rejection.status}));
    render(<GraphicPostResults {...props} />);
    const field = await screen.findByRole("textbox", { name: "标签候选" });
    fireEvent.change(field, { target: { value: "保留这份用户修改" } });
    fireEvent.click(screen.getByRole("button", { name: "采用标签到作品" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(rejection.expected);
    expect(alert).toHaveTextContent("仍保留");
    expect(alert).not.toHaveTextContent(/schema|stack|系统有问题/);
    expect(field).toHaveValue("保留这份用户修改");
    expect(onAdopt).not.toHaveBeenCalled();
    expect(api.getResult).not.toHaveBeenCalled();
  });
});

describe("图卡文字候选审阅",()=>{
 beforeEach(()=>{
  Object.values(api).forEach(mock=>mock.mockReset());props.onAdopt.mockClear();
  api.listCreativeCapabilities.mockResolvedValue({items:[]});api.listBundles.mockResolvedValue({items:[]});
  api.listResults.mockResolvedValue({items:[{resultId:"card-text",kind:"cardBriefs",outputId:"output",status:"succeeded",value:[
   {cardId:"card-1",title:"真实标题",body:"真实正文",sourceRefs:[]}],sourceRefs:[],appliedRules:"not_applied",createdAt:"2026-10-02T00:00:00Z",errorCode:null}]});
 });
 it("逐卡编辑后采用结构值，失败保留手工文字及原稳定身份",async()=>{
  api.adoptResult.mockRejectedValue(new Error("保存暂不可用"));
  render(<GraphicPostResults {...props}/>);
  const body=await screen.findByRole("textbox",{name:"图卡1正文候选"});
  fireEvent.change(body,{target:{value:"手工改过的正文"}});
  fireEvent.click(screen.getByRole("button",{name:"采用图卡文字到作品"}));
  await waitFor(()=>expect(api.adoptResult).toHaveBeenCalledWith({params:{resultId:"card-text"},query:undefined,body:{
   expected:{owner:"graphic_post",versionId:"version-one"},clientRequestId:expect.any(String),editedValue:[{cardId:"card-1",title:"真实标题",body:"手工改过的正文",sourceRefs:[]}]}}));
  expect(body).toHaveValue("手工改过的正文");expect(await screen.findByRole("alert")).toBeInTheDocument();expect(props.onAdopt).not.toHaveBeenCalled();
 });
});

it("联合主动作替代图文旁路生成，原历史候选和单页图片保留",async()=>{
 api.listCreativeCapabilities.mockResolvedValue({items:["title","body","summary","tags","cardBriefs"].map(kind=>({outputType:"image",platform:"xiaohongshu",kind,state:"supported"}))});
 api.createBundle.mockResolvedValue({bundleId:"draft",status:"complete",items:[]});
 render(<GraphicPostResults {...props} scriptDerived series={{cards:[],selectedCardId:null,selectedCardIds:[]}}/>);
 await screen.findByRole('button',{name:'刷新能力与候选'});
 expect(screen.queryByRole("button",{name:"根据脚本生成图文"})).toBeNull();expect(api.createBundle).not.toHaveBeenCalled();
 expect(screen.queryByText("重新生成标题、简介与标签")).toBeNull();expect(screen.queryByRole("button",{name:"生成标题"})).toBeNull();expect(screen.getByText('规划与配文候选')).toBeInTheDocument();
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
  window.localStorage.setItem("creatoros:current-account", "account");
});
t1062ScopeAfterEach(() => {
  window.localStorage.removeItem("creatoros:current-group");
  window.localStorage.removeItem("creatoros:current-account");
});
// T1062_UNIT_SCOPE_FIXTURE_END
