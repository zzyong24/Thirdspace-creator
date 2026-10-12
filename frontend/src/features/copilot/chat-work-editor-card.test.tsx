import * as React from "react";
import { it, expect, vi, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from "@testing-library/react";
import {
  ChatWorkEditorCard,
  saveWorkEditorCandidate,
  adoptAssistantDocumentThroughEditor,
} from "./chat-work-editor-card";
import { articleDocument,assistantActionCandidateSchema } from "@creatoros/contract";
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
  expect(screen.getByRole("button", { name: "采纳到当前作品" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "预览改动" }));
  expect(await screen.findByRole('dialog',{name:'文章改动预览'})).toBeVisible();
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
const assistantSource={taskId:'real-task',callId:'real-call',toolCallId:'real-tool',candidateDigest:`sha256:${'c'.repeat(64)}`};
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
 render(<ChatWorkEditorCard result={result} toolCallId="tool-real" location={{conversationId:'conversation',sourceMessageId:'original-message',toolCallId:'tool-real'}}/>);await screen.findByText(/来源读回与正在显示的原候选不一致/);expect(screen.getByRole('button',{name:'采纳到当前作品'})).toBeDisabled();expect(api.createArticleVersion).not.toHaveBeenCalled();
});
