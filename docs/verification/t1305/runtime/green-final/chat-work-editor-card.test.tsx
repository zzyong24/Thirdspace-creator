import * as React from "react";
import { it, expect, vi, afterEach } from "vitest";
import {
  act,
  render,
  screen,
  fireEvent,
  waitFor,
  within,
  cleanup,
} from "@testing-library/react";
import {
  ChatWorkEditorCard,
  AssistedWorkSelection,
  previewAssistedWorkDocument,
  useAssistedWorkReview,
  saveWorkEditorCandidate,
  adoptAssistantDocumentThroughEditor,
} from "./chat-work-editor-card";
import { articleDocument,articleSourceRef,graphicPostSourceRef,assistantActionCandidateSchema } from "@creatoros/contract";
import {withEditorCandidateSave,EditorCandidateConflictError} from "@/features/draft-workbench/draft-chat-request";
const api = vi.hoisted(() => ({
  readWorkCandidateSource: vi.fn(),
  createArticleVersion: vi.fn(),
  getArticleVersion: vi.fn(),
  getArticle: vi.fn(),
  adoptAssistantAction: vi.fn(),
}));
// Only owner/component port boundaries; native rendering and real CAS are separate integration checks.
vi.mock("@/lib/creation-workspace-scope", () => ({
  useCreationClient: () => api,
  useCreationScope: () => ({ groupId: "g", accountId: null }),
  creationScopeKey: (scope:any) => scope.groupId?`group:${scope.groupId}`:`account:${scope.accountId}`,
}));
vi.mock("@/features/reference-editors/noterelay/noterelay-editor", () => ({
  NoteRelayEditor: (props: any) => {
    React.useEffect(() => {
      props.onPreviewReady?.({ pageCount: 1, pageIndex: 0 });
    }, []);
    return (
      <div
        data-testid="preview"
        data-readonly={String(props.readOnlyCandidate)}
        data-simplified={String(props.simplified)}
      >
        {props.value.title}
      </div>
    );
  },
}));
const document = articleDocument.parse({
  schemaVersion: 1,
  title: "候选标题",
  summary: "",
  sections: [
    {
      sectionId: "section-real",
      order: 0,
      heading: "标题",
      headingLevel: 2,
      body: "保留完整正文",
      sourceRefs: [
        {
          kind: "project_script",
          id: "script-real",
          versionId: "script-version",
        },
      ],
    },
  ],
  factItems: [],
  visualBriefs: [],
  imageUses: [],
});
const result: any = {
  kind: "work.editor.candidate",
  schemaVersion: 1,
  target: {
    schemaVersion: 1,
    projectId: "p",
    outputId: "article-real",
    owner: "wechat_article",
    contentType: "article",
    savedBase: {
      kind: "artifact",
      artifactId: "artifact-real",
      versionId: "base-real",
    },
    documentDigest: "sha256:" + "a".repeat(64),
    selection: { kind: "article_sections", sectionIds: ["section-real"] },
  },
  base: {
    kind: "artifact",
    artifactId: "artifact-real",
    versionId: "base-real",
  },
  baseDigest: "sha256:" + "a".repeat(64),
  candidateDigest: "sha256:" + "b".repeat(64),
  summary: "修改标题",
  candidate: { kind: "article", document },
  changes: [
    {
      path: "title",
      objectId: "article-real",
      label: "标题",
      before: "原题",
      after: "候选标题",
    },
  ],
  apply: {
    operation: "createArticleVersion",
    outputId: "article-real",
    body: { expectedCurrentVersionId: "base-real", document },
  },
  imageRequest: null,
  failureCode: null,
  error: null,
};
afterEach(() => {
  cleanup();
  sessionStorage.clear();
  vi.clearAllMocks();
});
it("收起候选不装重预览；实际预览就绪后才可采用，完整document和真实CAS基准保真", async () => {
  api.readWorkCandidateSource.mockResolvedValue({assistantSource:{taskId:"source-task",callId:"source-call",toolCallId:"tool-real",candidateDigest:"sha256:"+"c".repeat(64)},candidate:result});
  api.createArticleVersion.mockResolvedValue({ versionId: "saved-real" });
  api.getArticleVersion.mockImplementation(async ({params}:any)=>({versionId:params.versionId,document:params.versionId==="base-real"?{...document,title:"",summary:""}:document}));
  api.getArticle.mockResolvedValue({
    currentVersionId: "saved-real",
    current: document,
  });
  render(<ChatWorkEditorCard result={result} toolCallId="tool-real" location={{conversationId:"conversation-real",sourceMessageId:"source-message",toolCallId:"tool-real"}} />);
  expect(screen.queryByTestId("preview")).toBeNull();
  expect(api.readWorkCandidateSource).not.toHaveBeenCalled();
  expect(api.getArticleVersion).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "采纳到当前作品" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "预览改动" }));
  expect(await screen.findByRole('dialog',{name:'文章改动预览'})).toBeVisible();
  expect(screen.getByTestId("preview")).toHaveAttribute("data-simplified","true");
  expect(screen.getByTestId("preview")).toHaveAttribute(
    "data-readonly",
    "true",
  );
  expect(api.createArticleVersion).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button',{name:'关闭'}));
  await waitFor(()=>expect(screen.queryByRole('dialog')).toBeNull());
  expect(screen.getByRole('button',{name:'采纳到当前作品'})).not.toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "采纳到当前作品" }));
  await screen.findByText("已保存并采用。可继续微调。");
  expect(api.createArticleVersion.mock.calls[0][0]).toMatchObject({
    params: { outputId: "article-real" },
    body: {
      expectedCurrentVersionId: "base-real",
      adoptionMode:"assistant",
      fieldSelection:["title","summary"],
      factSelection:{mode:"keep"},
      clientRequestId: expect.stringMatching(/^sha256:/),
    },
  });
  expect(api.createArticleVersion.mock.calls[0][0].body).not.toHaveProperty("document");
});
it("原owner回执丢失重放同body/key，current漂移只报告已保存未同步", async () => {
  const owner = {
    createArticleVersion: vi
      .fn()
      .mockRejectedValueOnce(Error("响应未知"))
      .mockResolvedValue({ versionId: "saved-real" }),
    getArticleVersion: vi
      .fn()
      .mockResolvedValue({ versionId: "saved-real", document }),
    getArticle: vi
      .fn()
      .mockResolvedValue({
        currentVersionId: "later-real",
        current: { ...document, title: "后来的稿" },
      }),
  };
  await expect(
    saveWorkEditorCandidate(owner, result, "stable-request"),
  ).rejects.toThrow("响应未知");
  const restored = await saveWorkEditorCandidate(
    owner,
    result,
    "stable-request",
  );
  expect(owner.createArticleVersion.mock.calls[1][0]).toEqual(
    owner.createArticleVersion.mock.calls[0][0],
  );
  expect(restored.currentMatches).toBe(false);
  expect(restored.exact.document.sections[0].sourceRefs).toEqual(
    document.sections[0].sourceRefs,
  );
});
const assistantSource={taskId:'real-task',callId:'real-call',toolCallId:'tool-real',candidateDigest:`sha256:${'c'.repeat(64)}`};
const assistantCandidate=assistantActionCandidateSchema.parse({schemaVersion:1,kind:'system.action.proposal',request:{action:{kind:'article.save',outputId:'article-real',expectedCurrentVersionId:'base-real',document}},observations:{article:{projectId:'p',outputId:'article-real',artifactId:'artifact-real',currentVersionId:'base-real',current:{...document,title:'原题'},versions:[]}},source:assistantSource});
const assistantReceipt={source:assistantSource,status:'adopted' as const,operationId:'articles.versions.create',result:{versionId:'saved-real',document},adoptedAt:'2026-10-08T02:00:00.000Z'};
function assistantBridge(editorOverride?:any){
 api.getArticleVersion.mockResolvedValue({versionId:'saved-real',document});api.getArticle.mockResolvedValue({projectId:'p',outputId:'article-real',artifactId:'artifact-real',currentVersionId:'saved-real',current:document,versions:[]});api.adoptAssistantAction.mockResolvedValue(assistantReceipt);
 const calls:any[]=[];
 const editor={readEditorState:()=>({target:null,outputId:'article-real',generation:1,dirty:false}),adoptEditorCandidate:async(...args:any[])=>{calls.push(args);const saved=await saveWorkEditorCandidate(api,args[0],args[1]);return {status:saved.currentMatches?'adopted' as const:'saved-not-synced' as const,versionId:saved.receipt.versionId};},...editorOverride};
 return {calls,input:{candidate:assistantCandidate,client:api as any,assertCurrent:()=>{},sourceScope:{groupId:'g',accountId:null},currentScope:{groupId:'g',accountId:null},editor}};
}
it('正式来源通过原两参数编辑器读取精确版本并刷新，不绕成旧createVersion保存',async()=>{
 const f=assistantBridge(),saved=await adoptAssistantDocumentThroughEditor(f.input);
 expect(saved).toMatchObject({receipt:assistantReceipt,adoption:{status:'adopted',versionId:'saved-real'}});
 expect(f.calls).toHaveLength(1);expect(f.calls[0]).toHaveLength(2);
 expect(api.adoptAssistantAction).toHaveBeenCalledExactlyOnceWith({params:undefined,query:undefined,body:assistantSource});
 expect(api.createArticleVersion).not.toHaveBeenCalled();expect(api.getArticleVersion).toHaveBeenCalledExactlyOnceWith({params:{outputId:'article-real',versionId:'saved-real'},query:undefined,body:undefined});
});
it.each(['dirty','changed'])('匹配编辑器拒绝或等待中换身份不回退直接保存：%s',async mode=>{
 const f=assistantBridge({adoptEditorCandidate:async()=>{if(mode==='dirty')throw new EditorCandidateConflictError('未保存原稿');return null;}});
 await expect(adoptAssistantDocumentThroughEditor(f.input)).rejects.toThrow(mode==='dirty'?/未保存/:/没有绕过/);
 expect(api.adoptAssistantAction).not.toHaveBeenCalled();expect(api.createArticleVersion).not.toHaveBeenCalled();
});
it('编辑器与来源组不同，采用前拒绝，不用当前组替换来源',async()=>{
 const f=assistantBridge();f.input.currentScope={groupId:'other',accountId:null};
 await expect(adoptAssistantDocumentThroughEditor(f.input)).rejects.toThrow(/账号组不同/);
 expect(api.adoptAssistantAction).not.toHaveBeenCalled();expect(f.calls).toHaveLength(0);
});
it('未知响应保留同来源；恢复已有回执只读精确版本，不再发采用',async()=>{
 const f=assistantBridge();api.adoptAssistantAction.mockRejectedValueOnce(Error('采用响应未知'));
 await expect(adoptAssistantDocumentThroughEditor(f.input)).rejects.toThrow(/响应未知/);
 const recovered=await adoptAssistantDocumentThroughEditor({...f.input,receipt:assistantReceipt});
 expect(recovered.adoption?.status).toBe('adopted');expect(api.adoptAssistantAction).toHaveBeenCalledTimes(1);expect(api.createArticleVersion).not.toHaveBeenCalled();
});
it('同请求ID绑定的候选内容被替换时拒绝，结束后释放本次绑定',async()=>{
 const save=vi.fn(async()=>({receipt:{versionId:'v'}}));
 await expect(withEditorCandidateSave(result,'fixed-key',save,()=>saveWorkEditorCandidate(api,{...result,summary:'不是绑定的候选'},'fixed-key'))).rejects.toThrow(/身份或内容/);
 expect(save).not.toHaveBeenCalled();
 await expect(withEditorCandidateSave(result,'fixed-key',save,()=>saveWorkEditorCandidate(api,result,'fixed-key'))).resolves.toEqual({receipt:{versionId:'v'}});
 expect(save).toHaveBeenCalledTimes(1);expect(api.createArticleVersion).not.toHaveBeenCalled();
});

it('缺原消息或原来源candidate不符不能采纳、不能用最新任务补造',async()=>{
 const view=render(<ChatWorkEditorCard result={result} toolCallId="tool-real"/>);fireEvent.click(screen.getByRole('button',{name:'预览改动'}));await screen.findByText(/缺少原会话消息来源/);fireEvent.click(screen.getByRole("button",{name:"关闭"}));await waitFor(()=>expect(screen.queryByRole("dialog")).toBeNull());expect(screen.getByRole('button',{name:'采纳到当前作品'})).toBeDisabled();expect(api.createArticleVersion).not.toHaveBeenCalled();view.unmount();
 api.readWorkCandidateSource.mockResolvedValue({assistantSource,candidate:{...result,summary:'另一轮'}});
 render(<ChatWorkEditorCard result={result} toolCallId="tool-real" location={{conversationId:'conversation',sourceMessageId:'original-message',toolCallId:'tool-real'}}/>);fireEvent.click(screen.getByRole("button",{name:"预览改动"}));await screen.findByText(/来源读回与正在显示的原候选不一致/);fireEvent.click(screen.getByRole("button",{name:"关闭"}));expect(screen.getByRole('button',{name:'采纳到当前作品'})).toBeDisabled();expect(api.createArticleVersion).not.toHaveBeenCalled();
});

function historyLocation(id:string){return {conversationId:`history-${id}`,sourceMessageId:"original-source",toolCallId:"tool-real"};}
function prepareHistory(){api.readWorkCandidateSource.mockResolvedValue({assistantSource,candidate:result});api.getArticleVersion.mockResolvedValue({versionId:"base-real",document:{...document,title:""}});}
it("T1300 不可变历史重挂按需读取复用，关闭/重开无额外来源或exact读取",async()=>{
 prepareHistory();const location=historyLocation("remount");let view=render(<ChatWorkEditorCard result={result} toolCallId="tool-real" location={location}/>);expect(screen.getByText("修改标题")).toBeVisible();expect(api.readWorkCandidateSource).not.toHaveBeenCalled();fireEvent.click(screen.getByRole("button",{name:"预览改动"}));await screen.findByTestId("preview");expect(api.readWorkCandidateSource).toHaveBeenCalledOnce();expect(api.getArticleVersion).toHaveBeenCalledOnce();view.unmount();
 view=render(<ChatWorkEditorCard result={result} toolCallId="tool-real" location={location}/>);expect(screen.queryByTestId("preview")).toBeNull();fireEvent.click(screen.getByRole("button",{name:"预览改动"}));await screen.findByTestId("preview");expect(api.readWorkCandidateSource).toHaveBeenCalledOnce();expect(api.getArticleVersion).toHaveBeenCalledOnce();expect(api.createArticleVersion).not.toHaveBeenCalled();
});
it("T1300 同时打开同来源卡片只有一笔在途source与exact",async()=>{
 prepareHistory();let finish!:(value:any)=>void;api.readWorkCandidateSource.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));const location=historyLocation("concurrent");render(<><ChatWorkEditorCard result={result} toolCallId="tool-real" location={location}/><ChatWorkEditorCard result={result} toolCallId="tool-real" location={location}/></>);for(const button of screen.getAllByRole("button",{name:"预览改动"}))fireEvent.click(button);await waitFor(()=>expect(api.readWorkCandidateSource).toHaveBeenCalledOnce());await act(async()=>finish({assistantSource,candidate:result}));await waitFor(()=>expect(screen.getAllByTestId("preview")).toHaveLength(2));expect(api.getArticleVersion).toHaveBeenCalledOnce();
});
it("T1300 来源失败可以同按钮重试，卸载在途结果不污染再次打开",async()=>{
 prepareHistory();api.readWorkCandidateSource.mockRejectedValueOnce(Error("来源暂不可读"));const location=historyLocation("retry");const view=render(<ChatWorkEditorCard result={result} toolCallId="tool-real" location={location}/>);fireEvent.click(screen.getByRole("button",{name:"预览改动"}));expect(await within(screen.getByRole("dialog")).findByText("来源暂不可读")).toBeVisible();fireEvent.click(screen.getByRole("button",{name:"关闭"}));fireEvent.click(screen.getByRole("button",{name:"预览改动"}));await screen.findByTestId("preview");expect(api.readWorkCandidateSource).toHaveBeenCalledTimes(2);view.unmount();
 const late=historyLocation("late");let finish!:(value:any)=>void;api.readWorkCandidateSource.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));const first=render(<ChatWorkEditorCard result={result} toolCallId="tool-real" location={late}/>);fireEvent.click(screen.getByRole("button",{name:"预览改动"}));await waitFor(()=>expect(api.readWorkCandidateSource).toHaveBeenCalledTimes(3));first.unmount();await act(async()=>finish({assistantSource,candidate:result}));const reads=api.readWorkCandidateSource.mock.calls.length;render(<ChatWorkEditorCard result={result} toolCallId="tool-real" location={late}/>);fireEvent.click(screen.getByRole("button",{name:"预览改动"}));await screen.findByTestId("preview");expect(api.readWorkCandidateSource).toHaveBeenCalledTimes(reads+1);expect(api.createArticleVersion).not.toHaveBeenCalled();
});

function ReviewHarness({value=result,scopeKey="group:g",id}:{value?:any;scopeKey?:string;id:string}){const review=useAssistedWorkReview(api,value,historyLocation(id),scopeKey);return <p role="status">{review.ready?"已核对":review.error??"读取中"}</p>;}
it("T1300 来源、exact版本或scope不同不复用不可变读",async()=>{
 prepareHistory();const mount=async(value:any,scopeKey:string,id:string)=>{api.readWorkCandidateSource.mockResolvedValue({assistantSource,candidate:value});api.getArticleVersion.mockResolvedValue({versionId:value.base.versionId,document});const view=render(<ReviewHarness value={value} scopeKey={scopeKey} id={id}/>);await screen.findByText("已核对");view.unmount();};
 await mount(result,"group:g","identity");await mount(result,"group:other","identity");const changed={...result,base:{...result.base,versionId:"other-exact"}};await mount(changed,"group:g","identity");await mount(result,"group:g","other-source");expect(api.readWorkCandidateSource).toHaveBeenCalledTimes(4);expect(api.getArticleVersion).toHaveBeenCalledTimes(4);
});
it("T1300 大量历史同时展开后卸载，缓存收敛到32项并可重新读取被逐出项",async()=>{
 prepareHistory();const view=render(<>{Array.from({length:40},(_,i)=><ReviewHarness key={i} id={`bounded-${i}`}/>)}</>);await waitFor(()=>expect(screen.getAllByText("已核对")).toHaveLength(40));expect(api.readWorkCandidateSource).toHaveBeenCalledTimes(40);view.unmount();render(<ReviewHarness id="bounded-0"/>);await screen.findByText("已核对");expect(api.readWorkCandidateSource).toHaveBeenCalledTimes(41);
});
it("T1300 work.creation保留默认即时fresh准备，不共享editor历史缓存",async()=>{
 const proposal={target:{articleMember:{outputId:"joint-output",baseVersionId:"joint-base"}},article:document};const value:any={kind:"work.creation.member",member:"article",proposal};api.readWorkCandidateSource.mockResolvedValue({assistantSource,candidate:proposal});api.getArticleVersion.mockResolvedValue({versionId:"joint-base",document});let view=render(<ReviewHarness value={value} id="joint"/>);await screen.findByText("已核对");view.unmount();view=render(<ReviewHarness value={value} id="joint"/>);await screen.findByText("已核对");expect(api.readWorkCandidateSource).toHaveBeenCalledTimes(2);expect(api.getArticleVersion).toHaveBeenCalledTimes(2);expect(api.createArticleVersion).not.toHaveBeenCalled();
});


it('T1302 editor选择仅在原预览modal内，关闭后外卡不保留表单且重开不新增来源读取',async()=>{
 prepareHistory();const location=historyLocation('t1302-modal');const view=render(<ChatWorkEditorCard result={result} toolCallId="tool-real" location={location}/>);expect(screen.queryByRole('region',{name:'本次采纳选择'})).toBeNull();fireEvent.click(screen.getByRole('button',{name:'预览改动'}));await screen.findByTestId('preview');await openSelection();const modal=screen.getByRole('dialog');expect(within(modal).getByRole('region',{name:'本次采纳选择'})).toBeVisible();fireEvent.click(screen.getByRole('button',{name:'关闭'}));expect(screen.queryByRole('region',{name:'本次采纳选择'})).toBeNull();fireEvent.click(screen.getByRole('button',{name:'预览改动'}));await screen.findByTestId('preview');await openSelection();expect(api.readWorkCandidateSource).toHaveBeenCalledOnce();expect(api.getArticleVersion).toHaveBeenCalledOnce();expect(api.createArticleVersion).not.toHaveBeenCalled();view.unmount();
});

const readableRefs=[{kind:'project',id:'internal-project',versionId:'internal-version'},{kind:'asset',id:'internal-asset',versionId:'internal-version'},{kind:'project_script',id:'internal-script',versionId:'internal-version'},{kind:'output_version',sourceOutputId:'internal-output',artifactId:'internal-artifact',versionId:'internal-version',sourceType:'article',selectionDigest:'a'.repeat(64),selection:{mode:'whole'}},{kind:'moments_version',momentsId:'internal-moments',artifactId:'internal-artifact',versionId:'internal-version',selectionDigest:'a'.repeat(64),selection:{mode:'whole'}},{kind:'work_basis_version',compositionId:'internal-basis',artifactId:'internal-artifact',versionId:'internal-version',selectionDigest:'a'.repeat(64),selection:{mode:'whole'}}].map(ref=>articleSourceRef.parse(ref));
function displayReview(overrides:any={}){const base={...document,title:'',summary:'',factItems:[{id:'internal-old-fact',text:'原稿事实正文',sourceRefs:[],reviewState:'confirmed'}]},proposed={...document,title:'候选可读标题',summary:'',tags:[],titleSourceRefs:readableRefs,summarySourceRefs:[],factItems:[{id:'internal-new-fact',text:'新事实正文',sourceRefs:readableRefs,reviewState:'confirmed'},{id:'internal-empty-fact',text:'',sourceRefs:[],reviewState:'confirmed'}]};return {enabled:true,ready:true,error:null,base,proposed,fields:['title'],facts:'replace',pending:false,joint:true,article:true,document:previewAssistedWorkDocument(base,proposed,['title'],'replace',true),setFields:vi.fn(),setFacts:vi.fn(),...overrides};}
it.each(['project','publication_revision','mixed'])('T1302 来源与采用后事实展示真实内容和状态，无rawJSON/id：%s',async mode=>{
 const review=displayReview();review.base.metadataSource={kind:'project',projectId:'internal-metadata',updatedAt:'2026-10-15T00:00:00Z'};review.proposed.metadataSource={kind:'publication_revision',projectId:'internal-metadata',sourceOutputId:'internal-source-output',publicationId:'internal-publication',revisionId:'internal-revision'};review.fields=mode==='project'?[]:mode==='publication_revision'?['title','summary','tags']:['title'];review.document=previewAssistedWorkDocument(review.base,review.proposed,review.fields,review.facts,true);
 const {container}=render(<AssistedWorkSelection review={review}/>);await openSelection();expect(container.textContent).toContain('候选可读标题');for(const label of ['项目资料','素材','脚本保存版本','作品版本','朋友圈版本','创作依据版本'])expect(container.textContent).toContain(label);expect(container.textContent).toContain('未提供可读名称');expect(container.textContent).not.toContain('internal-');expect(container.textContent).not.toContain('projectId');expect(container.querySelector('pre')).toBeNull();const before=screen.getByRole('region',{name:'原稿事实'}),after=screen.getByRole('region',{name:'采用后事实'});expect(before).toHaveTextContent('原稿事实正文');expect(before).toHaveTextContent('已确认');expect(after).toHaveTextContent('新事实正文');expect(within(after).getAllByText('待确认')).toHaveLength(2);expect(after).toHaveTextContent('（空正文）');expect(container.textContent).toContain(mode==='project'?'项目元信息':mode==='publication_revision'?'发布稿元信息':'无整组来源声明');
});
it('T1302 图文intelligence来源、合法空串与空数组如实显示，不发读取或新增缺省字段',async()=>{
 const review=displayReview({article:false,joint:false});review.base={title:'',summary:'',tags:[],sourceRefs:[]};review.proposed={title:'',summary:'',tags:[],sourceRefs:[...readableRefs,graphicPostSourceRef.parse({kind:'intelligence',id:'internal-intelligence',versionId:'internal-version'})]};review.document={...review.proposed};const {container}=render(<AssistedWorkSelection review={review}/>);await openSelection();expect(container.textContent).toContain('情报资料');expect(container.textContent).not.toContain('internal-');expect(screen.getByRole('checkbox',{name:/采用候选标题/})).toBeVisible();expect(screen.getByRole('checkbox',{name:/采用候选摘要/})).toBeVisible();expect(screen.getByRole('checkbox',{name:/采用候选标签/})).toBeVisible();expect(container.textContent).toContain('（空）');expect(container.textContent).toContain('无标签');expect(api.readWorkCandidateSource).not.toHaveBeenCalled();
 cleanup();delete review.proposed.tags;render(<AssistedWorkSelection review={review}/>);await openSelection();expect(screen.queryByRole('checkbox',{name:/采用候选标签/})).toBeNull();
});
it('T1302 保留行为：fact keep/replace投影继承真实confirmed，空事实不删除，混合元信息不冒整组来源',()=>{
 const ref={kind:'project_script',id:'s',versionId:'v'};const old={id:'same',text:'保留事实',sourceRefs:[ref],reviewState:'confirmed'};const base={...document,title:'原题',summary:'原摘要',tags:['原标签'],metadataSource:{kind:'project',projectId:'p',updatedAt:'真实时刻'},factItems:[old]},candidate={...document,title:'新题',summary:'新摘要',tags:[],metadataSource:{kind:'publication_revision',projectId:'p',sourceOutputId:'o',publicationId:'pub',revisionId:'rev'},factItems:[old,{...old,id:'new',text:'',reviewState:'confirmed'},{...old,id:'changed',text:'改动事实',reviewState:'confirmed'}]};
 const keep=previewAssistedWorkDocument(base,candidate,[],'keep',true);expect(keep.title).toBe('原题');expect(keep.summary).toBe('原摘要');expect(keep.tags).toEqual(['原标签']);expect(keep.factItems).toEqual([old]);expect(keep.metadataSource).toEqual(base.metadataSource);const mixed=previewAssistedWorkDocument(base,candidate,['title'],'replace',true);expect(mixed).not.toHaveProperty('metadataSource');expect(mixed.factItems).toEqual([old,{...candidate.factItems[1],reviewState:'needs_confirmation'},{...candidate.factItems[2],reviewState:'needs_confirmation'}]);expect(candidate.factItems[1].reviewState).toBe('confirmed');const all=previewAssistedWorkDocument(base,candidate,['title','summary','tags'],'replace',true);expect(all.metadataSource).toEqual(candidate.metadataSource);
});
it('T1302 保留行为：editor部分选择关开与UNKNOWN刷新恢复同body/key，pending外卡可发现且控件disabled',async()=>{
 const base={...document,title:'原题',summary:'原摘要',tags:['原标签'],factItems:[{id:'old',text:'',sourceRefs:[],reviewState:'confirmed'}]},expected={...document,title:'原题',summary:'',tags:['原标签'],factItems:base.factItems};const location=historyLocation('t1302-pending');api.readWorkCandidateSource.mockResolvedValue({assistantSource,candidate:result});api.getArticleVersion.mockImplementation(async({params}:any)=>({versionId:params.versionId,document:params.versionId==='base-real'?base:expected}));api.getArticle.mockResolvedValue({currentVersionId:'saved-partial',current:expected});api.createArticleVersion.mockRejectedValueOnce(Error('采用回执未知')).mockResolvedValue({versionId:'saved-partial'});
 let view=render(<ChatWorkEditorCard result={result} toolCallId="tool-real" location={location}/>);const controls=()=>within(screen.queryByRole('dialog')?.querySelector('[aria-label="本次采纳选择"]')??view.container);fireEvent.click(screen.getByRole('button',{name:'预览改动'}));await screen.findByTestId('preview');await openSelection();expect(controls().getByLabelText(/采用候选标题/)).not.toBeChecked();expect(controls().getByLabelText(/采用候选摘要/)).not.toBeChecked();expect(controls().queryByLabelText(/采用候选标签/)).toBeNull();expect(controls().getByLabelText(/替换为联合候选事实/)).toBeDisabled();fireEvent.click(controls().getByLabelText(/采用候选摘要/));fireEvent.click(screen.getByText('本次采纳选择',{selector:'summary'}));await waitFor(()=>expect(screen.queryByRole('checkbox',{name:/采用候选摘要/})).toBeNull());await openSelection();expect(controls().getByLabelText(/采用候选摘要/)).toBeChecked();fireEvent.click(screen.getByRole('button',{name:'关闭'}));fireEvent.click(screen.getByRole('button',{name:'预览改动'}));await screen.findByTestId('preview');await openSelection();expect(controls().getByLabelText(/采用候选摘要/)).toBeChecked();fireEvent.click(screen.getByRole('button',{name:'关闭'}));fireEvent.click(screen.getByRole('button',{name:'采纳到当前作品'}));await screen.findByText('采用回执未知');const original=api.createArticleVersion.mock.calls.at(-1)![0];expect(original.body).toEqual({adoptionMode:'assistant',expectedCurrentVersionId:'base-real',assistantSource,fieldSelection:['summary'],policyVersion:1,clientRequestId:expect.stringMatching(/^sha256:/),factSelection:{mode:'keep'}});view.unmount();
 view=render(<ChatWorkEditorCard result={result} toolCallId="tool-real" location={location}/>);fireEvent.click(screen.getByRole('button',{name:'预览改动'}));await screen.findByTestId('preview');await openSelection();expect(controls().getByLabelText(/采用候选摘要/)).toBeChecked();for(const checkbox of controls().getAllByLabelText(/采用候选|替换为联合候选事实/))expect(checkbox).toBeDisabled();fireEvent.click(screen.getByRole('button',{name:'关闭'}));const pendingVisible=screen.queryByText('原采用请求待核对，请继续恢复原请求。');fireEvent.click(screen.getByRole('button',{name:'恢复 / 采纳原请求'}));await screen.findByText('已保存并采用。可继续微调。');expect(api.createArticleVersion.mock.calls.at(-1)![0]).toEqual(original);expect(pendingVisible).not.toBeNull();
});

it('T1302 before保护基线：真实review hook默认/部分fields及UNKNOWN重挂保原source/body/key',async()=>{
 api.createArticleVersion.mockReset();const base={...document,title:'原题',summary:'原摘要',tags:['原标签'],factItems:[]},expected={...document,title:'原题',summary:'',tags:['原标签'],factItems:[]},location=historyLocation('t1302-hook-protection');let handle:ReturnType<typeof useAssistedWorkReview>;
 function Probe(){handle=useAssistedWorkReview(api,result,location,'group:g');return <output>{handle.ready?'保护基线就绪':handle.error??'读取中'}</output>;}
 api.readWorkCandidateSource.mockResolvedValue({assistantSource,candidate:result});api.getArticleVersion.mockImplementation(async({params}:any)=>({versionId:params.versionId,document:params.versionId==='base-real'?base:expected}));api.getArticle.mockResolvedValue({currentVersionId:'protected-saved',current:expected});api.createArticleVersion.mockRejectedValueOnce(Error('保护基线未知')).mockResolvedValue({versionId:'protected-saved'});
 let view=render(<Probe/>);await screen.findByText('保护基线就绪');expect(handle!.fields).toEqual([]);expect(handle!.facts).toBe('keep');act(()=>handle.setFields(['summary']));expect(handle!.document).toEqual(expected);await act(async()=>{await expect(handle.save('t1302-protected-original-key')).rejects.toThrow('保护基线未知');});const original=api.createArticleVersion.mock.calls.at(-1)![0];expect(original.body).toEqual({adoptionMode:'assistant',expectedCurrentVersionId:'base-real',assistantSource,fieldSelection:['summary'],policyVersion:1,clientRequestId:'t1302-protected-original-key',factSelection:{mode:'keep'}});view.unmount();view=render(<Probe/>);await screen.findByText('保护基线就绪');expect(handle!.pending).toBe(true);expect(handle!.fields).toEqual(['summary']);expect(handle!.facts).toBe('keep');await act(async()=>{await handle.save('t1302-protected-original-key');});expect(api.createArticleVersion.mock.calls.at(-1)![0]).toEqual(original);expect(api.readWorkCandidateSource).toHaveBeenCalledOnce();
});


async function openSelection(){const summary=await screen.findByText('本次采纳选择',{selector:'summary'});if(!summary.closest('details')!.open)fireEvent.click(summary);return screen.findByRole('region',{name:'本次采纳选择'});}

it('REFINEMENT-RED editor ready选择默认折叠，原候选正文先可见',async()=>{
 prepareHistory();render(<ChatWorkEditorCard result={result} toolCallId="tool-real" location={historyLocation('refine-editor-fold')}/>);fireEvent.click(screen.getByRole('button',{name:'预览改动'}));await screen.findByTestId('preview');
 expect(screen.getByTestId('preview')).toBeVisible();expect(screen.queryByRole('checkbox',{name:/采用候选标题/})).toBeNull();expect(screen.getByText('本次采纳选择',{selector:'summary'})).toBeVisible();
});

it.each(['pending','confirmed'] as const)('REFINEMENT %s锁定原因在折叠外可见，展开仍disabled',async mode=>{
 const message=mode==='confirmed'?'这份内容已保存，仍是当前成稿。':'原采用请求待核对，请继续恢复原请求。';
 const review=displayReview({locked:true,pending:mode==='pending',confirmed:mode==='confirmed'?'saved-real':null,confirmationMessage:mode==='confirmed'?message:null});
 render(<AssistedWorkSelection review={review}/>);expect(screen.getByRole('status')).toHaveTextContent(message);expect(screen.queryByRole('checkbox')).toBeNull();await openSelection();for(const input of screen.getAllByRole('checkbox'))expect(input).toBeDisabled();
 fireEvent.click(screen.getByText('本次采纳选择',{selector:'summary'}));await waitFor(()=>expect(screen.queryByRole('checkbox')).toBeNull());expect(screen.getByRole('status')).toHaveTextContent(message);expect(review.setFields).not.toHaveBeenCalled();expect(review.setFacts).not.toHaveBeenCalled();
});
it.each(['loading','error','disabled'] as const)('REFINEMENT %s不造空选择折叠，真实状态可见',mode=>{
 const review=displayReview({enabled:mode!=='disabled',ready:false,error:mode==='error'?'真实来源读取失败':null});render(<AssistedWorkSelection review={review}/>);
 expect(screen.queryByText('本次采纳选择',{selector:'summary'})).toBeNull();if(mode==='loading')expect(screen.getByText('正在核对原候选来源与稿件版本…')).toBeVisible();if(mode==='error')expect(screen.getByRole('alert')).toHaveTextContent('真实来源读取失败');if(mode==='disabled')expect(screen.queryByRole('alert')).toBeNull();
});

it.each(['pending','confirmed'] as const)('REFINEMENT editor真实%s重挂后modal内折叠外原因可见',async mode=>{
 api.readWorkCandidateSource.mockResolvedValue({assistantSource,candidate:result});api.getArticleVersion.mockImplementation(async({params}:any)=>({versionId:params.versionId,document:params.versionId==='base-real'?{...document,title:''}:document}));api.getArticle.mockResolvedValue({currentVersionId:'saved-refinement',current:document});
 if(mode==='pending')api.createArticleVersion.mockRejectedValueOnce(Error('refinement回执未知'));else api.createArticleVersion.mockResolvedValue({versionId:'saved-refinement'});
 const element=<ChatWorkEditorCard result={result} toolCallId="tool-real" location={historyLocation('refine-editor-lock-'+mode)}/>;let view=render(element);fireEvent.click(screen.getByRole('button',{name:'预览改动'}));await screen.findByTestId('preview');fireEvent.click(screen.getByRole('button',{name:'关闭'}));await waitFor(()=>expect(screen.queryByRole('dialog')).toBeNull());fireEvent.click(screen.getByRole('button',{name:'采纳到当前作品'}));
 if(mode==='pending')await screen.findByText('refinement回执未知');else await screen.findByText('已保存并采用。可继续微调。');
 view.unmount();view=render(element);await screen.findByText(mode==='pending'?'原采用请求待核对，请继续恢复原请求。':'这份内容已保存，仍是当前成稿。');fireEvent.click(screen.getByRole('button',{name:'预览改动'}));await screen.findByTestId('preview');const modal=screen.getByRole('dialog');expect(within(modal).getByRole('status')).toHaveTextContent(mode==='pending'?'原采用请求待核对，请继续恢复原请求。':'这份内容已保存，仍是当前成稿。');expect(within(modal).queryByRole('checkbox')).toBeNull();await openSelection();for(const input of within(modal).getAllByRole('checkbox'))expect(input).toBeDisabled();expect(api.createArticleVersion).toHaveBeenCalledOnce();
});

function SourceFailureProbe({id,scopeKey='group:g'}:{id:string;scopeKey?:string}){
 const review=useAssistedWorkReview(api,result,historyLocation(id),scopeKey);
 return <p data-testid="source-failure-probe" data-network={String(Boolean((review as any).sourceFailure))}>{review.ready?'已核对':review.error??'读取中'}</p>;
}
for(const mode of ['source','receipt-mechanical','exact','typed-status','abort','abort-error'] as const){
 it(`T1305 hook窄await类型边界 ${mode}`,async()=>{
  prepareHistory();const cause=new TypeError('opaque type '+mode),message=cause.message;
  if(mode==='source')api.readWorkCandidateSource.mockRejectedValue(cause);
  if(mode==='typed-status')api.readWorkCandidateSource.mockRejectedValue(Object.assign(cause,{status:503,code:'SERVER_SPECIFIC'}));
  if(mode==='abort'){const abort=new DOMException(message,'AbortError');console.info('T1305 AbortError fixture',JSON.stringify({constructor:abort.constructor.name,name:abort.name,instanceofError:abort instanceof Error}));api.readWorkCandidateSource.mockRejectedValue(abort);}
  if(mode==='abort-error')api.readWorkCandidateSource.mockRejectedValue(Object.assign(new Error(message),{name:'AbortError'}));
  if(mode==='receipt-mechanical')api.readWorkCandidateSource.mockResolvedValue({get candidate(){throw cause;}});
  if(mode==='exact')api.getArticleVersion.mockRejectedValue(cause);
  render(<SourceFailureProbe id={'t1305-boundary-'+mode}/>);
  const probe=await screen.findByTestId('source-failure-probe');await waitFor(()=>expect(probe).toHaveTextContent(mode==='source'?'候选来源暂时读取失败，请关闭预览后重新打开。':mode==='abort'?'来源读取未完成':message),{timeout:120000});
  expect(probe).toHaveAttribute('data-network',String(mode==='source'));expect(api.createArticleVersion).not.toHaveBeenCalled();
 });
}
it('T1305 共享promise同次失败向两个subscriber传机械类型，失败entry清除可恢复',async()=>{
 prepareHistory();let reject!:(cause:unknown)=>void;api.readWorkCandidateSource.mockImplementationOnce(()=>new Promise((_resolve,no)=>{reject=no;}));
 const view=render(<><SourceFailureProbe id="t1305-shared"/><SourceFailureProbe id="t1305-shared"/></>);await waitFor(()=>expect(api.readWorkCandidateSource).toHaveBeenCalledOnce(),{timeout:120000});
 await act(async()=>reject(new TypeError('opaque shared read')));for(const probe of screen.getAllByTestId('source-failure-probe')){expect(probe).toHaveTextContent('候选来源暂时读取失败，请关闭预览后重新打开。');expect(probe).toHaveAttribute('data-network','true');}
 view.unmount();prepareHistory();render(<SourceFailureProbe id="t1305-shared"/>);await screen.findByText('已核对',undefined,{timeout:120000});expect(api.readWorkCandidateSource).toHaveBeenCalledTimes(2);expect(api.createArticleVersion).not.toHaveBeenCalled();
});
it('T1305 source读取完成后的save TypeError保UNKNOWN原body/key，不冒source恢复',async()=>{
 prepareHistory();api.createArticleVersion.mockRejectedValue(new TypeError('save response lost'));
 render(<ChatWorkEditorCard result={result} toolCallId="tool-real" location={historyLocation('t1305-save')}/>);fireEvent.click(screen.getByRole('button',{name:'预览改动'}));await screen.findByText('本次采纳选择',{selector:'summary'},{timeout:120000});fireEvent.click(screen.getByRole('button',{name:'关闭'}));fireEvent.click(screen.getByRole('button',{name:'采纳到当前作品'}));await screen.findByText('save response lost',undefined,{timeout:120000});
 const storage=Object.keys(sessionStorage).map(key=>[key,sessionStorage.getItem(key)]),request=api.createArticleVersion.mock.calls[0][0],sourceCount=api.readWorkCandidateSource.mock.calls.length;
 fireEvent.click(screen.getByRole('button',{name:'预览改动'}));await screen.findByText('本次采纳选择',{selector:'summary'},{timeout:120000});fireEvent.click(screen.getByRole('button',{name:'关闭'}));
 expect(api.readWorkCandidateSource).toHaveBeenCalledTimes(sourceCount);expect(api.createArticleVersion).toHaveBeenCalledTimes(1);expect(api.createArticleVersion.mock.calls[0][0]).toEqual(request);expect(Object.keys(sessionStorage).map(key=>[key,sessionStorage.getItem(key)])).toEqual(storage);expect(screen.queryByText('候选来源暂时读取失败，请关闭预览后重新打开。')).toBeNull();
});
