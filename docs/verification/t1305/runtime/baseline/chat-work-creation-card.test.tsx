import * as React from "react";
import {readFileSync,writeFileSync,mkdirSync} from "node:fs";
import {resolve} from "node:path";
import {JSDOM} from "jsdom";
import {execFileSync} from "node:child_process";
import {defaultLayout} from "@/features/reference-editors/noterelay/projection";
import { it, expect, vi, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  within,
  waitFor,
  cleanup,
} from "@testing-library/react";
import { articleDocument, graphicPostDocument } from "@creatoros/contract";
import { ChatWorkCreationCard } from "./chat-work-creation-card";
const api = vi.hoisted(() => ({
  actualEditor: false,
  nativeRequest: vi.fn(),
  readWorkCandidateSource: vi.fn(),
  createArticleVersion: vi.fn(),
  getArticleVersion: vi.fn(),
  getArticle: vi.fn(),
  createGraphicPostVersion: vi.fn(),
  getGraphicPostVersion: vi.fn(),
  getGraphicPost: vi.fn(),
}));
// Only React/owner operation boundary; actual NoteRelay PNG/ZIP and owner service CAS remain integration evidence.
vi.mock("@/lib/creation-workspace-scope", () => ({
  useCreationClient: () => api,
  useCreationWorkspace: () => ({client:api}),
  useCreationScope: () => ({ groupId: "g", accountId: null }),
  creationScopeKey: () => "group:g",
}));
vi.mock("@/features/reference-editors/use-native-account",()=>({useNativeWorkspace:()=>({groupId:"g",accountId:null})}));
vi.mock("@/features/reference-editors/native-editor-surface",()=>({NativeEditorSurface:React.forwardRef(function Surface(props:any,ref:any){React.useImperativeHandle(ref,()=>({request:(op:string,payload:any)=>api.nativeRequest(op,payload)}),[]);React.useEffect(()=>{props.onReady();},[]);return <div data-testid="real-native-boundary"/>;})}));
vi.mock("@/features/reference-editors/noterelay/noterelay-editor", async original => {
 const actual=await original<typeof import("@/features/reference-editors/noterelay/noterelay-editor")>();
 return {NoteRelayEditor: (props: any) => {
    if(api.actualEditor)return <actual.NoteRelayEditor {...props}/>;
    React.useEffect(() => {
      props.onPreviewReady?.({ pageCount: 3, pageIndex: 0 });
    }, []);
    return (
      <div
        data-testid={props.platform + "-preview"}
        data-readonly={String(props.readOnlyCandidate)}
      >
        {props.value.title}
      </div>
    );
  },
};});
const source = {
  kind: "project_script",
  id: "script-real",
  versionId: "script-version",
};
const article = articleDocument.parse({
  schemaVersion: 1,
  title: "文章",
  summary: "",
  sections: [
    {
      sectionId: "s-real",
      order: 0,
      heading: "要点",
      headingLevel: 2,
      body: "同源文章正文",
      sourceRefs: [source],
    },
  ],
  factItems: [],
  visualBriefs: [],
  imageUses: [],
});
const graphic = graphicPostDocument.parse({
  schemaVersion: 1,
  title: "图文",
  body: "同源图文正文",
  summary: "",
  tags: [],
  sourceRefs: [source],
  imageUses: [],
  ruleSnapshotRef: null,
  cardBriefs: [
    {
      cardId: "card-real",
      title: "真实图卡",
      body: "图卡正文",
      sourceRefs: [source],
    },
  ],
});
const result = {
  kind: "work.creation.propose",
  schemaVersion: 1,
  target: {
    schemaVersion: 1,
    clientRequestId: "request-real",
    projectId: "p",
    compositionId: "composition-real",
    compositionRevision: 3,
    scriptSourceRef: source,
    scriptConfirmation: { confirmedBy: "user", source: "current-click" },
    articleMember: {
      kind: "article",
      outputId: "article-real",
      artifactId: "article-artifact",
      baseVersionId: "article-base",
    },
    graphicMember: {
      kind: "image",
      outputId: "image-real",
      artifactId: "graphic-artifact",
      baseVersionId: "graphic-base",
    },
  },
  targetDigest: "a".repeat(64),
  article,
  graphic,
  articleDigest: "b".repeat(64),
  graphicDigest: "c".repeat(64),
  scriptSourceRef: source,
  error: null,
};
afterEach(() => {
  cleanup();
  api.actualEditor=false;
  sessionStorage.clear();
  vi.clearAllMocks();
});
it("两候选分别预览/独立采纳：文章成功后图文未知不回滚；恢复同body/key而不冒充旧candidateId", async () => {
  api.readWorkCandidateSource.mockResolvedValue({assistantSource:{taskId:"source-task",callId:"source-call",toolCallId:"tool-real",candidateDigest:"sha256:"+"d".repeat(64)},candidate:result});
  api.createArticleVersion.mockResolvedValue({ versionId: "article-saved" });
  api.getArticleVersion.mockImplementation(async({params}:any)=>({versionId:params.versionId,document:params.versionId==="article-base"?{...article,title:""}:article}));
  api.getArticle.mockResolvedValue({
    currentVersionId: "article-saved",
    current: article,
  });
  api.createGraphicPostVersion
    .mockRejectedValueOnce(Error("图文回执未知"))
    .mockResolvedValue({ versionId: "graphic-saved" });
  api.getGraphicPostVersion.mockImplementation(async({params}:any)=>({versionId:params.versionId,document:params.versionId==="graphic-base"?{...graphic,title:""}:graphic}));
  api.getGraphicPost.mockResolvedValue({
    currentVersionId: "graphic-saved",
    current: graphic,
  });
  const { container } = render(
    <ChatWorkCreationCard result={result} toolCallId="tool-real" location={{conversationId:"conversation-real",sourceMessageId:"source-message",toolCallId:"tool-real"}} />,
  );
  const rows = container.querySelectorAll("article"),
    a = within(rows[0]),
    g = within(rows[1]);
  expect(a.getByRole("button", { name: "采纳文章" })).toBeDisabled();
  fireEvent.click(a.getByRole("button", { name: "预览候选" }));
  expect(await screen.findByRole('dialog',{name:'文章候选预览'})).toBeVisible();
  expect(screen.getByTestId('wechat-preview')).toHaveAttribute('data-readonly','true');
  expect(api.createArticleVersion).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button',{name:'关闭'}));
  await waitFor(()=>expect(screen.queryByRole('dialog')).toBeNull());
  fireEvent.click(g.getByRole("button", { name: "预览候选" }));
  expect(await screen.findByRole('dialog',{name:'图文候选预览'})).toBeVisible();
  expect(screen.getByTestId("rednote-preview")).toHaveAttribute(
    "data-readonly",
    "true",
  );
  fireEvent.click(screen.getByRole('button',{name:'关闭'}));
  await waitFor(()=>expect(screen.queryByRole('dialog')).toBeNull());
  expect(a.getByRole("button", { name: "采纳文章" })).not.toBeDisabled();
  fireEvent.click(a.getByRole("button", { name: "采纳文章" }));
  await a.findByRole("status");
  fireEvent.click(g.getByRole("button", { name: "采纳图文" }));
  await g.findByRole("alert");
  expect(a.getByRole("status")).toHaveTextContent("已保存");
  const original = api.createGraphicPostVersion.mock.calls[0][0];
  fireEvent.click(g.getByRole("button", { name: "恢复原采纳请求" }));
  await g.findByRole("status");
  expect(api.createGraphicPostVersion.mock.calls[1][0]).toEqual(original);
  expect(original.body).toMatchObject({
    expectedCurrentVersionId: "graphic-base",
    adoptionMode:"assistant",
    fieldSelection:["title","summary","tags"],
  });
  expect(original.body).not.toHaveProperty("candidateId");
  expect(original.body).not.toHaveProperty("document");
  expect(a.getByRole("link", { name: "打开文章" })).toHaveAttribute(
    "href",
    "/projects/p/article?outputId=article-real",
  );
});


it('T1302 联合两候选选择只在各自原modal内，关开保选择且fresh读取次数不变',async()=>{
 api.readWorkCandidateSource.mockResolvedValue({assistantSource:{taskId:'source-task',callId:'source-call',toolCallId:'tool-real',candidateDigest:'sha256:'+'d'.repeat(64)},candidate:result});api.getArticleVersion.mockImplementation(async({params}:any)=>({versionId:params.versionId,document:{...article,title:'原题'}}));api.getGraphicPostVersion.mockImplementation(async({params}:any)=>({versionId:params.versionId,document:{...graphic,title:'原图文题'}}));const view=render(<ChatWorkCreationCard result={result} toolCallId="tool-real" location={{conversationId:'t1302-creation',sourceMessageId:'source',toolCallId:'tool-real'}}/>);await waitFor(()=>expect(api.getGraphicPostVersion).toHaveBeenCalledOnce());expect(screen.queryByRole('region',{name:'本次采纳选择'})).toBeNull();const rows=view.container.querySelectorAll('article');fireEvent.click(within(rows[0]).getByRole('button',{name:'预览候选'}));await screen.findByTestId('wechat-preview');await openSelection();expect(within(screen.getByRole('dialog')).getByRole('region',{name:'本次采纳选择'})).toBeVisible();const checkbox=screen.getByRole('checkbox',{name:/采用候选标题/});expect(checkbox).not.toBeChecked();fireEvent.click(checkbox);fireEvent.click(screen.getByText('本次采纳选择',{selector:'summary'}));await waitFor(()=>expect(screen.queryByRole('checkbox',{name:/采用候选标题/})).toBeNull());await openSelection();expect(screen.getByRole('checkbox',{name:/采用候选标题/})).toBeChecked();fireEvent.click(screen.getByRole('button',{name:'关闭'}));expect(screen.queryByRole('region',{name:'本次采纳选择'})).toBeNull();fireEvent.click(within(rows[0]).getByRole('button',{name:'预览候选'}));await screen.findByTestId('wechat-preview');await openSelection();expect(screen.getByRole('checkbox',{name:/采用候选标题/})).toBeChecked();fireEvent.click(screen.getByRole('button',{name:'关闭'}));fireEvent.click(within(rows[1]).getByRole('button',{name:'预览候选'}));await screen.findByTestId('rednote-preview');await openSelection();expect(screen.getByRole('checkbox',{name:/采用候选标题/})).not.toBeChecked();expect(api.readWorkCandidateSource).toHaveBeenCalledTimes(2);expect(api.getArticleVersion).toHaveBeenCalledOnce();expect(api.getGraphicPostVersion).toHaveBeenCalledOnce();expect(api.createArticleVersion).not.toHaveBeenCalled();
});

it('T1302 保留行为：联合article显式replace与部分fields、UNKNOWN重挂仍同body/key且不改变另一候选',async()=>{
 const ref={kind:'project_script',id:'script-real',versionId:'script-version'};const fact={id:'kept',text:'相同事实',sourceRefs:[ref],reviewState:'confirmed'};const base={...article,title:'原题',summary:'原摘要',factItems:[fact]},proposed={...article,factItems:[fact,{id:'new',text:'',sourceRefs:[],reviewState:'confirmed'}]},value={...result,article:proposed};const expected={...proposed,title:'文章',summary:'原摘要',factItems:[fact,{...proposed.factItems[1],reviewState:'needs_confirmation'}]};const source={taskId:'source-task',callId:'source-call',toolCallId:'tool-real',candidateDigest:'sha256:'+'d'.repeat(64)},location={conversationId:'t1302-joint-pending',sourceMessageId:'source',toolCallId:'tool-real'};api.readWorkCandidateSource.mockResolvedValue({assistantSource:source,candidate:value});api.getArticleVersion.mockImplementation(async({params}:any)=>({versionId:params.versionId,document:params.versionId==='article-base'?base:expected}));api.getGraphicPostVersion.mockImplementation(async({params}:any)=>({versionId:params.versionId,document:graphic}));api.getArticle.mockResolvedValue({currentVersionId:'joint-saved',current:expected});api.createArticleVersion.mockRejectedValueOnce(Error('联合回执未知')).mockResolvedValue({versionId:'joint-saved'});
 let view=render(<ChatWorkCreationCard result={value} toolCallId="tool-real" location={location}/>);const controls=()=>within(screen.queryByRole('dialog')?.querySelector('[aria-label="本次采纳选择"]')??view.container.querySelectorAll('article')[0]);fireEvent.click(within(view.container.querySelectorAll('article')[0]).getByRole('button',{name:'预览候选'}));await screen.findByTestId('wechat-preview');await openSelection();fireEvent.click(controls().getByLabelText(/采用候选标题/));fireEvent.click(controls().getByLabelText(/替换为联合候选事实/));fireEvent.click(screen.getByRole('button',{name:'关闭'}));fireEvent.click(screen.getByRole('button',{name:'采纳文章'}));await screen.findByText('联合回执未知');const original=api.createArticleVersion.mock.calls.at(-1)![0];expect(original.body).toMatchObject({adoptionMode:'assistant',expectedCurrentVersionId:'article-base',assistantSource:source,fieldSelection:['title'],policyVersion:1,factSelection:{mode:'replace',expectedBeforeDigest:expect.stringMatching(/^sha256:/),proposedFactsDigest:expect.stringMatching(/^sha256:/)}});expect(original.body).not.toHaveProperty('document');view.unmount();
 view=render(<ChatWorkCreationCard result={value} toolCallId="tool-real" location={location}/>);fireEvent.click(within(view.container.querySelectorAll('article')[0]).getByRole('button',{name:'预览候选'}));await screen.findByTestId('wechat-preview');await openSelection();await screen.findByRole('region',{name:'本次采纳选择'});expect(controls().getByLabelText(/采用候选标题/)).toBeChecked();expect(controls().getByLabelText(/替换为联合候选事实/)).toBeChecked();for(const checkbox of controls().getAllByLabelText(/采用候选|替换为联合候选事实/))expect(checkbox).toBeDisabled();fireEvent.click(screen.getByRole('button',{name:'关闭'}));const pendingVisible=screen.queryByText('原采用请求待核对，请继续恢复原请求。');fireEvent.click(screen.getByRole('button',{name:'恢复原采纳请求'}));await within(view.container.querySelectorAll('article')[0]).findByRole('status');expect(api.createArticleVersion.mock.calls.at(-1)![0]).toEqual(original);expect(pendingVisible).not.toBeNull();expect(api.createGraphicPostVersion).not.toHaveBeenCalled();
});


async function openSelection(){const summary=await screen.findByText('本次采纳选择',{selector:'summary'});if(!summary.closest('details')!.open)fireEvent.click(summary);return screen.findByRole('region',{name:'本次采纳选择'});}

async function realNativeHost(){
 const dom=new JSDOM('<main id="host"></main>',{url:'http://creatoros.test/projects/output',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window;
 Object.assign(w,{TextEncoder,TextDecoder,structuredClone:(value:unknown)=>JSON.parse(JSON.stringify(value)),CSS:{escape:(value:string)=>value}});
 Object.assign(w.URL,{createObjectURL:()=>`blob:registered-native`,revokeObjectURL:()=>{}});Object.assign(w.HTMLImageElement.prototype,{decode:async()=>{}});
 const code=execFileSync(process.execPath,['--input-type=module','-e',"import {transform} from 'esbuild';let source='';for await(const chunk of process.stdin)source+=chunk;process.stdout.write((await transform(source,{format:'iife',globalName:'NoteRelayNative'})).code);"],{input:readFileSync('public/reference-editors/noterelay/native/native.js','utf8'),encoding:'utf8',timeout:180000,maxBuffer:8*1024*1024});w.eval(code);
 const container=w.document.createElement('div');w.document.querySelector('#host')!.attachShadow({mode:'open'}).append(container);
 const controller=new w.AbortController();
 const runtime=await (w as any).NoteRelayNative.mount(container,{owner:{accountId:'a',projectId:'p',outputId:'article-real',sourceVersionId:'candidate'},theme:{mode:'light',tokens:{'--creatoros-surface':'#fff'},fontFamily:'sans-serif',fontSize:'14px',density:'comfortable'},portalContainer:container,signal:controller.signal,onChanged:()=>{},onError:()=>{}});
 const htmlExports:string[]=[];
 api.nativeRequest.mockImplementation(async(op:string,payload:any)=>{
  const result=await runtime.request(op,payload);
  if(op==='export'){
   const text=await new Promise<string>((resolve,reject)=>{const reader=new w.FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=reject;reader.readAsText(result.blob);});
   htmlExports.push(text);return {...result,blob:new Blob([text],{type:result.blob.type})};
  }
  return result;
 });
 return {container,htmlExports,close:async()=>{await runtime.dispose();dom.window.close();}};
}
function prepareRefinement(value:any=result){
 api.readWorkCandidateSource.mockResolvedValue({assistantSource:{taskId:'source-task',callId:'source-call',toolCallId:'tool-real',candidateDigest:'sha256:'+'d'.repeat(64)},candidate:value});
 api.getArticleVersion.mockResolvedValue({versionId:'article-base',document:{...value.article,title:'原题'}});
 api.getGraphicPostVersion.mockResolvedValue({versionId:'graphic-base',document:graphic});
}
function saveRefinement(name:string,contents:string){if(process.env.T1302_REFINEMENT_ARTIFACTS){const dir=resolve(process.env.T1302_REFINEMENT_ARTIFACTS);mkdirSync(dir,{recursive:true});writeFileSync(resolve(dir,name),contents);}}
it('REFINEMENT-RED creation空layout经真实NoteRelay与native渲染/导出，无模板占位且匹配工作台默认',async()=>{
 prepareRefinement();api.actualEditor=true;const host=await realNativeHost();const createObjectURL=URL.createObjectURL,revokeObjectURL=URL.revokeObjectURL;
 URL.createObjectURL=vi.fn(()=> 'blob:delivery');URL.revokeObjectURL=vi.fn();const click=vi.spyOn(HTMLAnchorElement.prototype,'click').mockImplementation(()=>{});
 const view=render(<ChatWorkCreationCard result={result} toolCallId="tool-real" location={{conversationId:'refine-real-empty',sourceMessageId:'source',toolCallId:'tool-real'}}/>);
 try{
  fireEvent.click(within(view.container.querySelectorAll('article')[0]).getByRole('button',{name:'预览候选'}));
  await waitFor(()=>expect(screen.getByRole('button',{name:'复制公众号文章'})).not.toBeDisabled());
  const preview=host.container.innerHTML;
  const details=screen.getByText('更多导出').closest('details')!;details.open=true;fireEvent(details,new Event('toggle'));fireEvent.click(screen.getByRole('button',{name:'导出 HTML'}));
  await screen.findByText('交付文件已生成。');const exported=host.htmlExports[0];
  saveRefinement('creation-empty-preview.html',preview);saveRefinement('creation-empty-export.html',exported);saveRefinement('creation-empty-modal.html',document.body.innerHTML);
  expect(exported).toContain('同源文章正文');expect(click).toHaveBeenCalledOnce();
  expect(preview).not.toMatch(/\{\{[^}]+\}\}/);expect(exported).not.toMatch(/\{\{[^}]+\}\}/);
  expect(api.nativeRequest.mock.calls.find(([op])=>op==='load')?.[1].layout.themeId).toBe('graphite-minimal');
 }finally{view.unmount();await host.close();click.mockRestore();URL.createObjectURL=createObjectURL;URL.revokeObjectURL=revokeObjectURL;}
});
it('REFINEMENT-RED creation ready选择默认折叠，原候选正文先可见',async()=>{
 prepareRefinement();const view=render(<ChatWorkCreationCard result={result} toolCallId="tool-real" location={{conversationId:'refine-creation-fold',sourceMessageId:'source',toolCallId:'tool-real'}}/>);
 fireEvent.click(within(view.container.querySelectorAll('article')[0]).getByRole('button',{name:'预览候选'}));await screen.findByTestId('wechat-preview');
 saveRefinement('creation-before-disclosure.html',document.body.innerHTML);
 expect(screen.getByTestId('wechat-preview')).toBeVisible();expect(screen.queryByRole('checkbox',{name:/采用候选标题/})).toBeNull();expect(screen.getByText('本次采纳选择',{selector:'summary'})).toBeVisible();
});

it('REFINEMENT 显式nativeLayout经真实NoteRelay与native导出仍优先且全文保真',async()=>{
 const nativeLayout={...defaultLayout('wechat'),themeId:'moyu-green',authorName:'真实作者',authorBio:'真实简介',variables:{栏目名:'真实栏目',日期:'2026-10-16',副标题:'真实副题',关键词:'真实关键词',账号名称:'真实账号',标签:'真实标签'}};
 const value={...result,article:{...article,nativeLayout}};prepareRefinement(value);api.actualEditor=true;const host=await realNativeHost();
 const createObjectURL=URL.createObjectURL,revokeObjectURL=URL.revokeObjectURL;URL.createObjectURL=vi.fn(()=> 'blob:delivery');URL.revokeObjectURL=vi.fn();const click=vi.spyOn(HTMLAnchorElement.prototype,'click').mockImplementation(()=>{});
 const view=render(<ChatWorkCreationCard result={value} toolCallId="tool-real" location={{conversationId:'refine-real-explicit',sourceMessageId:'source',toolCallId:'tool-real'}}/>);
 try{
  fireEvent.click(within(view.container.querySelectorAll('article')[0]).getByRole('button',{name:'预览候选'}));await waitFor(()=>expect(screen.getByRole('button',{name:'复制公众号文章'})).not.toBeDisabled());
  expect(api.nativeRequest.mock.calls.find(([op])=>op==='load')?.[1].layout).toEqual(nativeLayout);expect(host.container.textContent).toContain('真实栏目');expect(host.container.textContent).toContain('同源文章正文');
  const details=screen.getByText('更多导出').closest('details')!;details.open=true;fireEvent(details,new Event('toggle'));fireEvent.click(screen.getByRole('button',{name:'导出 HTML'}));await screen.findByText('交付文件已生成。');
  expect(host.htmlExports[0]).toContain('同源文章正文');expect(host.htmlExports[0]).toContain('真实栏目');expect(host.htmlExports[0]).toContain('真实作者');expect(click).toHaveBeenCalledOnce();
  saveRefinement('creation-explicit-preview.html',host.container.innerHTML);saveRefinement('creation-explicit-export.html',host.htmlExports[0]);expect(value.article.nativeLayout).toEqual(nativeLayout);
 }finally{view.unmount();await host.close();click.mockRestore();URL.createObjectURL=createObjectURL;URL.revokeObjectURL=revokeObjectURL;}
});

it.each(['pending','confirmed'] as const)('REFINEMENT creation真实%s重挂后modal内折叠外原因可见',async mode=>{
 prepareRefinement();api.getArticleVersion.mockImplementation(async({params}:any)=>({versionId:params.versionId,document:params.versionId==='article-base'?{...article,title:''}:article}));api.getArticle.mockResolvedValue({currentVersionId:'saved-refinement',current:article});
 if(mode==='pending')api.createArticleVersion.mockRejectedValueOnce(Error('refinement回执未知'));else api.createArticleVersion.mockResolvedValue({versionId:'saved-refinement'});
 const element=<ChatWorkCreationCard result={result} toolCallId="tool-real" location={{conversationId:'refine-creation-lock-'+mode,sourceMessageId:'source',toolCallId:'tool-real'}}/>;let view=render(element);
 fireEvent.click(within(view.container.querySelectorAll('article')[0]).getByRole('button',{name:'预览候选'}));await screen.findByTestId('wechat-preview');fireEvent.click(screen.getByRole('button',{name:'关闭'}));await waitFor(()=>expect(screen.queryByRole('dialog')).toBeNull());fireEvent.click(screen.getByRole('button',{name:'采纳文章'}));
 if(mode==='pending')await screen.findByText('refinement回执未知');else await within(view.container.querySelectorAll('article')[0]).findByRole('status');
 view.unmount();view=render(element);await within(view.container.querySelectorAll('article')[0]).findByText(mode==='pending'?'原采用请求待核对，请继续恢复原请求。':'这份内容已保存，仍是当前成稿。');
 fireEvent.click(within(view.container.querySelectorAll('article')[0]).getByRole('button',{name:'预览候选'}));await screen.findByTestId('wechat-preview');const modal=screen.getByRole('dialog');expect(within(modal).getByRole('status')).toHaveTextContent(mode==='pending'?'原采用请求待核对，请继续恢复原请求。':'这份内容已保存，仍是当前成稿。');expect(within(modal).queryByRole('checkbox')).toBeNull();
 saveRefinement('creation-'+mode+'-collapsed-modal.html',document.body.innerHTML);await openSelection();for(const input of within(modal).getAllByRole('checkbox'))expect(input).toBeDisabled();expect(api.createArticleVersion).toHaveBeenCalledOnce();
});
