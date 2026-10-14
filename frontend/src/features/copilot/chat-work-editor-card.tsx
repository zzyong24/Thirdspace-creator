"use client";
import * as React from "react";
import Link from "next/link";
import {
  workEditorCandidate,
  workEditorContext,
  articleResource,
  graphicPostResource,
  assistantAdoptionReceiptSchema,
  type AssistantActionCandidate,
  type WorkEditorCandidate,
} from "@creatoros/contract";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogDescription, DialogTrigger } from "@/components/ui/dialog";
import {
  useCreationClient,
  useCreationScope,
  creationScopeKey,
  type CreationClient,
  type CreationScope,
} from "@/lib/creation-workspace-scope";
import { NoteRelayEditor } from "@/features/reference-editors/noterelay/noterelay-editor";
import {
  useDraftChatRequest,
  editorCanonical,
  editorDigest,
  boundEditorCandidateSave,
  withEditorCandidateSave,
  EditorCandidateConflictError,
  type EditorAdoption,
  type EditorSaveCandidate,
} from "@/features/draft-workbench/draft-chat-request";
export type WorkCandidateLocation={conversationId:string|null;sourceMessageId:string|null;toolCallId:string};
/** SEMANTIC_BOUNDARY_ALLOW: 与后台一样只预览人的明确字段/事实选择，不做创作判断。 */
export function previewAssistedWorkDocument(base:any,candidate:any,fields:string[],facts:'keep'|'replace',article:boolean){
 const output=structuredClone(candidate),copy=(key:string,source:any)=>{if(Object.hasOwn(source,key))output[key]=structuredClone(source[key]);else delete output[key];};
 for(const key of ['title','summary','tags']){copy(key,fields.includes(key)?candidate:base);if(article&&key!=='tags')copy(`${key}SourceRefs`,fields.includes(key)?candidate:base);}
 if(!fields.length)copy('metadataSource',base);else if(['title','summary','tags'].every(key=>fields.includes(key)&&Object.hasOwn(candidate,key)))copy('metadataSource',candidate);else delete output.metadataSource;
 if(article)output.factItems=facts==='keep'?structuredClone(base.factItems):candidate.factItems.map((fact:any)=>{const original=base.factItems.find((old:any)=>old.id===fact.id&&old.text===fact.text&&editorCanonical(old.sourceRefs)===editorCanonical(fact.sourceRefs));return {...fact,reviewState:original?.reviewState??'needs_confirmation'};});
 else{const seen=new Set<string>();output.sourceRefs=[...candidate.sourceRefs,...base.sourceRefs].filter(ref=>{const key=editorCanonical(ref);if(seen.has(key))return false;seen.add(key);return true;});}
 return output;
}
export function useAssistedWorkReview(client:any,result:EditorSaveCandidate|null,location:WorkCandidateLocation|null,scopeKey:string){
 const enabled=Boolean(result&&(result.kind==='work.creation.member'||result.target.owner==='wechat_article'));
 const member=result?.kind==='work.creation.member'?(result.member==='article'?result.proposal.target.articleMember:result.proposal.target.graphicMember):null;
 const article=result?.kind==='work.creation.member'?result.member==='article':result?.target.owner==='wechat_article';
 const outputId=member?.outputId??(result?.kind==='work.editor.candidate'?result.target.outputId:''),versionId=member?.baseVersionId??(result?.kind==='work.editor.candidate'&&result.base.kind==='artifact'?result.base.versionId:'');
 const proposed:any=result?.kind==='work.creation.member'?(article?result.proposal.article:result.proposal.graphic):result?.candidate?.kind==='article'?result.candidate.document:null;
 const originalCandidate=result?.kind==='work.creation.member'?result.proposal:result;
 const [base,setBase]=React.useState<any>(null),[source,setSource]=React.useState<import('@creatoros/contract').WorkAssistantSource|null>(null),[fields,setFields]=React.useState<string[]>([]),[facts,setFacts]=React.useState<'keep'|'replace'>('keep'),[error,setError]=React.useState<string|null>(null),[pending,setPending]=React.useState(false);
 const originalBytes=editorCanonical(originalCandidate),storageKey=`creatoros:t1097:adopt:${scopeKey}:${outputId}:${location?.toolCallId??''}:${versionId}`;
 React.useEffect(()=>{let active=true;setBase(null);setSource(null);setError(null);if(!enabled)return;void(async()=>{try{
  if(!location?.conversationId||!location.sourceMessageId)throw Error('这份候选缺少原会话消息来源，不能用最新一轮补造。');
  const receipt=await client.readWorkCandidateSource({params:{conversationId:location.conversationId},query:{sourceMessageId:location.sourceMessageId,toolCallId:location.toolCallId},body:undefined});
  if(editorCanonical(receipt.candidate)!==originalBytes)throw Error('来源读回与正在显示的原候选不一致，候选保留。');
  const exact=await client[article?'getArticleVersion':'getGraphicPostVersion']({params:{outputId,versionId},query:undefined,body:undefined});
  if(exact.versionId!==versionId)throw Error('原稿版本读回不符');
  if(!active)return;setBase(exact.document);setSource(receipt.assistantSource);
  const frozen=sessionStorage.getItem(storageKey);if(frozen){const value=JSON.parse(frozen);if(editorCanonical(value.body.assistantSource)!==editorCanonical(receipt.assistantSource)||value.outputId!==outputId)throw Error('原待确认请求来源不符');setFields(value.body.fieldSelection);setFacts(value.body.factSelection?.mode??'keep');setPending(true);}
  else{setFields(['title','summary','tags'].filter(key=>Object.hasOwn(proposed??{},key)&&(Array.isArray(exact.document[key])?exact.document[key].length===0:!exact.document[key]?.trim())));setFacts('keep');setPending(false);}
 }catch(cause){if(active)setError(cause instanceof Error?cause.message:'来源读取未完成');}})();return()=>{active=false;};},[client,enabled,originalBytes,outputId,versionId,location?.conversationId,location?.sourceMessageId,location?.toolCallId,storageKey]);
 const document=base&&proposed?previewAssistedWorkDocument(base,proposed,fields,facts,Boolean(article)):proposed;
 async function save(requestId:string){
  if(!source||!base||!document||!result)throw Error(error??'原候选来源尚未完成核对');
  const body={adoptionMode:'assistant' as const,expectedCurrentVersionId:versionId,assistantSource:source,fieldSelection:['title','summary','tags'].filter(field=>fields.includes(field)),policyVersion:1,clientRequestId:requestId,...(article?{factSelection:facts==='keep'?{mode:'keep'}:{mode:'replace',expectedBeforeDigest:await editorDigest(base.factItems),proposedFactsDigest:await editorDigest(proposed!.factItems)}}:{})};
  const frozen={operation:article?'createArticleVersion':'createGraphicPostVersion',outputId,body,document};
  const prior=sessionStorage.getItem(storageKey);if(prior&&editorCanonical(JSON.parse(prior))!==editorCanonical(frozen))throw Error('原采用结果尚未确认，必须保留原选择与请求恢复，不能自动换key。');
  sessionStorage.setItem(storageKey,JSON.stringify(frozen));setPending(true);
  const receipt=await client[frozen.operation]({params:{outputId},query:undefined,body});
  const exact=await client[article?'getArticleVersion':'getGraphicPostVersion']({params:{outputId,versionId:receipt.versionId},query:undefined,body:undefined});
  if(exact.versionId!==receipt.versionId||editorCanonical(exact.document)!==editorCanonical(document))throw Error('指定采用版本与原选择的机械投影不符，原请求保留');
  const current=await client[article?'getArticle':'getGraphicPost']({params:{outputId},query:undefined,body:undefined});
  // 已确认回执保留至卡生命周期结束，刷新仍以原body/key恢复，不覆盖后续稿。
  return {receipt,exact,current,currentMatches:current.currentVersionId===receipt.versionId&&editorCanonical(current.current)===editorCanonical(exact.document)};
 }
 return {enabled,ready:!enabled||Boolean(source&&base&&!error),base,proposed,document,fields,setFields,facts,setFacts,error,pending,article:Boolean(article),joint:result?.kind==='work.creation.member',save};
}
export function AssistedWorkSelection({review}:{review:ReturnType<typeof useAssistedWorkReview>}){
 if(!review.enabled)return null;
 if(review.error)return <p role="alert" className="text-sm text-destructive">{review.error}</p>;
 if(!review.ready)return <p className="text-sm text-muted-foreground">正在核对原候选来源与稿件版本…</p>;
 return <section aria-label="本次采纳选择" className="space-y-3 rounded-xl border border-border p-3 text-sm"><p>正文采用这份候选；元信息与事实由你选择。未勾选项保留原稿。</p>
 {['title','summary','tags'].filter(field=>Object.hasOwn(review.proposed,field)).map(field=><label key={field} className="block"><input type="checkbox" disabled={review.pending} checked={review.fields.includes(field)} onChange={event=>review.setFields(event.target.checked?[...review.fields,field]:review.fields.filter(value=>value!==field))}/> 采用候选{field==='title'?'标题':field==='summary'?'摘要':'标签'}<span className="block break-words text-muted-foreground">原稿：{JSON.stringify(review.base[field]??null)} → 候选：{JSON.stringify(review.proposed[field])}</span>{review.article&&field!=='tags'&&<span className="block break-words text-xs">引用：{JSON.stringify(review.fields.includes(field)?review.proposed[`${field}SourceRefs`]??[]:review.base[`${field}SourceRefs`]??[])}</span>}</label>)}
 {review.article&&<div><p>事实：{review.base.factItems.length} 项 → 候选 {review.proposed.factItems.length} 项</p><label><input type="checkbox" disabled={review.pending||!review.joint} checked={review.facts==='replace'} onChange={event=>review.setFacts(event.target.checked?'replace':'keep')}/> 替换为联合候选事实（新改项仍待确认）</label><details><summary>核对事实、来源与确认状态</summary><pre className="whitespace-pre-wrap break-words">{JSON.stringify({原稿:review.base.factItems,采用后:review.document.factItems},null,2)}</pre></details></div>}
 <p className="break-words text-xs text-muted-foreground">采用后元信息来源：{review.document.metadataSource?JSON.stringify(review.document.metadataSource):'无整组声明，逐字段引用保留真实来源。'}</p>{review.pending&&<p>原采用请求已冻结，继续恢复原选择；核对后续稿时不会覆盖新的输入。</p>}</section>;
}
type AssistantAdoptionReceipt=ReturnType<typeof assistantAdoptionReceiptSchema.parse>;
/** 正式来源仍由后台验证；此桥接只让原编辑器保留本地输入并刷新精确版本。 */
export async function adoptAssistantDocumentThroughEditor(input:{
  candidate:AssistantActionCandidate;client:CreationClient;assertCurrent:()=>void;
  sourceScope:CreationScope;currentScope:CreationScope;
  editor:Pick<ReturnType<typeof useDraftChatRequest>,"readEditorState"|"adoptEditorCandidate">;
  receipt?:AssistantAdoptionReceipt;
}):Promise<{receipt:AssistantAdoptionReceipt;adoption:EditorAdoption|null}> {
  const {candidate,client,editor}=input,action=candidate.request.action;
  if(action.kind!=="article.save"&&action.kind!=="graphic.save")throw Error("当前候选不是文章或图文保存。");
  const source=candidate.source;
  const save=async()=>{
    input.assertCurrent();
    const receipt=assistantAdoptionReceiptSchema.parse(input.receipt??await client.adoptAssistantAction({params:undefined,query:undefined,body:source}));
    input.assertCurrent();
    if(editorCanonical(receipt.source)!==editorCanonical(source))throw Error("原回执与候选来源不符。");
    return receipt;
  };
  const state=editor.readEditorState();
  if((state?.outputId??state?.target?.outputId)!==action.outputId)return {receipt:await save(),adoption:null};
  if(creationScopeKey(input.sourceScope)!==creationScopeKey(input.currentScope))
    throw new EditorCandidateConflictError("当前编辑器与候选的账号组不同，请回原工作区核对。");
  const article=action.kind==="article.save";
  const original=article?articleResource.parse(candidate.observations.article):graphicPostResource.parse(candidate.observations.graphic);
  if(original.outputId!==action.outputId||original.currentVersionId!==action.expectedCurrentVersionId)
    throw new EditorCandidateConflictError("候选观察与原作品版本不一致。");
  const base={kind:"artifact" as const,artifactId:original.artifactId,versionId:original.currentVersionId};
  const baseDigest=await editorDigest(original.current);
  const target={schemaVersion:1,projectId:original.projectId,outputId:original.outputId,
    owner:article?"wechat_article":"graphic_post",contentType:article?"article":"image",savedBase:base,documentDigest:baseDigest,
    selection:article?{kind:"article",sectionIds:[]}:{kind:"graphic_post",cardIds:[]}};
  const value=workEditorCandidate.parse({kind:"work.editor.candidate",schemaVersion:1,target,base,baseDigest,
    candidateDigest:await editorDigest(action.document),summary:article?"采用已核对的文章候选":"采用已核对的图文候选",
    candidate:{kind:article?"article":"graphic_post",document:action.document},changes:[],
    apply:{operation:article?"createArticleVersion":"createGraphicPostVersion",outputId:action.outputId,
      body:{expectedCurrentVersionId:action.expectedCurrentVersionId,document:action.document}},imageRequest:null,failureCode:null,error:null});
  let receipt:AssistantAdoptionReceipt|undefined;
  const requestId=`assistant-editor:${source.callId}:${source.candidateDigest}`;
  const adoption=await withEditorCandidateSave(value,requestId,async()=>{
    receipt=await save();
    const versionId=receipt.result&&typeof receipt.result==="object"?(receipt.result as {versionId?:unknown}).versionId:undefined;
    if(typeof versionId!=="string"||!versionId)throw Error("原采用回执缺少作品版本。");
    const exact=await client[article?"getArticleVersion":"getGraphicPostVersion"]({params:{outputId:action.outputId,versionId},query:undefined,body:undefined});
    input.assertCurrent();
    if(exact.versionId!==versionId||editorCanonical(exact.document)!==editorCanonical(action.document))
      throw Error("指定版本读回与原采用候选不一致，请核对同一来源回执。");
    const current=await client[article?"getArticle":"getGraphicPost"]({params:{outputId:action.outputId},query:undefined,body:undefined});
    input.assertCurrent();
    return {receipt:{versionId},exact,current,currentMatches:current.currentVersionId===versionId&&editorCanonical(current.current)===editorCanonical(exact.document)};
  },()=>editor.adoptEditorCandidate(value,requestId));
  if(!adoption||!receipt)throw new EditorCandidateConflictError("编辑器已改变，本次没有绕过编辑器保存，请重新核对。");
  return {receipt,adoption};
}
/** UI owner operation; same body/key retry follows the existing owner receipt. */
export async function saveWorkEditorCandidate(
  client: any,
  result: EditorSaveCandidate,
  requestId: string,
) {
  const bound=boundEditorCandidateSave(result,requestId);
  if(bound)return bound;
  const member =
    result.kind === "work.creation.member"
      ? result.member === "article"
        ? result.proposal.target.articleMember
        : result.proposal.target.graphicMember
      : null;
  const apply: NonNullable<WorkEditorCandidate["apply"]> | null =
    result.kind === "work.creation.member"
      ? result.member === "article"
        ? {
            operation: "createArticleVersion",
            outputId: member!.outputId,
            body: {
              expectedCurrentVersionId: member!.baseVersionId,
              document: result.proposal.article,
            },
          }
        : {
            operation: "createGraphicPostVersion",
            outputId: member!.outputId,
            body: {
              expectedCurrentVersionId: member!.baseVersionId,
              document: result.proposal.graphic,
            },
          }
      : result.apply;
  if (!apply || (result.kind !== "work.creation.member" && !result.candidate))
    throw Error(
      result.kind === "work.creation.member"
        ? "候选尚不可采纳。"
        : (result.error ?? "候选尚不可采纳。"),
    );
  if (
    result.kind !== "work.creation.member" &&
    apply.outputId !== result.target.outputId
  )
    throw Error("候选作品身份不一致。");
  if (apply.operation === "applyProductionEditor")
    return client.applyProductionEditor({
      params: { outputId: apply.outputId },
      query: undefined,
      body: { ...apply.body, requestId },
    });
  const article = apply.operation === "createArticleVersion";
  const receipt = await client[apply.operation]({
    params: { outputId: apply.outputId },
    query: undefined,
    body: { ...apply.body, clientRequestId: requestId },
  });
  const exact = await client[
    article ? "getArticleVersion" : "getGraphicPostVersion"
  ]({
    params: { outputId: apply.outputId, versionId: receipt.versionId },
    query: undefined,
    body: undefined,
  });
  if (
    exact.versionId !== receipt.versionId ||
    editorCanonical(exact.document) !== editorCanonical(apply.body.document)
  )
    throw Error("指定版本读回与采纳内容不一致，原请求保留。");
  const current = await client[article ? "getArticle" : "getGraphicPost"]({
    params: { outputId: apply.outputId },
    query: undefined,
    body: undefined,
  });
  return {
    receipt,
    exact,
    current,
    currentMatches:
      current.currentVersionId === receipt.versionId &&
      editorCanonical(current.current) === editorCanonical(exact.document),
  };
}
export function ChatWorkEditorCard({
  result,
  toolCallId,
  location=null,
}: {
  result: unknown;
  toolCallId: string;
  location?:WorkCandidateLocation|null;
}) {
  const client = useCreationClient(),
    scope = useCreationScope();
  const editor = useDraftChatRequest();
  const parsed = workEditorCandidate.safeParse(result),
    context = workEditorContext.safeParse(result);
  const review=useAssistedWorkReview(client,parsed.success?parsed.data:null,location,creationScopeKey(scope));
  const [expanded, setExpanded] = React.useState(false),
    [previewReady, setPreviewReady] = React.useState(false),
    [busy, setBusy] = React.useState(false),
    [error, setError] = React.useState<string | null>(null),
    [adoption, setAdoption] = React.useState<EditorAdoption | null>(null),
    [video, setVideo] = React.useState<string | null>(null);
  const alive = React.useRef(true),
    url = React.useRef<string | null>(null);
  React.useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      if (url.current) URL.revokeObjectURL(url.current);
    };
  }, []);
  if (context.success) {
    const value = context.data;
    return (
      <details className="rounded-xl border border-border bg-surface p-4 text-sm">
        <summary className="cursor-pointer font-medium">
          已读取当前
          {value.target.contentType === "article"
            ? "文章"
            : value.target.contentType === "image"
              ? "图文"
              : "视频"}
          与选区
        </summary>
        <div className="mt-3 space-y-2">
          <p>
            {value.complete ? "已读取所选范围" : "当前为局部窗口，可继续读取"}
          </p>
          {value.error ? <p role="alert">{value.error}</p> : null}
          {value.fieldWindow ? (
            <p className="whitespace-pre-wrap">{value.fieldWindow.text}</p>
          ) : (
            <p>{value.selected.length} 个选中对象</p>
          )}
        </div>
      </details>
    );
  }
  if (!parsed.success)
    return (
      <p role="alert" className="text-sm text-destructive">
        此候选格式无法读取，原稿保留。
      </p>
    );
  const value = parsed.data,
    candidate = value.candidate;
  const key = `t1070:${toolCallId}:${value.target.outputId}:${value.candidateDigest ?? value.baseDigest}`;
  const path =
    value.target.contentType === "article"
      ? `/projects/${value.target.projectId}/article?outputId=${value.target.outputId}`
      : value.target.contentType === "image"
        ? `/projects/${value.target.projectId}/outputs/${value.target.outputId}/image`
        : `/projects/${value.target.projectId}/production?outputId=${value.target.outputId}`;
  async function preview() {
    setExpanded(true);
    if (candidate?.kind !== "native_scene") return;
    setBusy(true);
    setError(null);
    try {
      const output = await editor.previewEditorCandidate(value);
      if (!output?.blob.size)
        throw Error("请打开对应视频工作台，再预览这份候选。");
      if (alive.current) {
        if (url.current) URL.revokeObjectURL(url.current);
        url.current = URL.createObjectURL(output.blob);
        setVideo(url.current);
        setPreviewReady(true);
      }
    } catch (cause) {
      if (alive.current)
        setError(cause instanceof Error ? cause.message : "预览未完成。");
    } finally {
      if (alive.current) setBusy(false);
    }
  }
  async function adopt() {
    setBusy(true);
    setError(null);
    try {
      const requestId=await editorDigest(key);
      const run=async()=>{let saved=await editor.adoptEditorCandidate(value,requestId);if(!saved){if(candidate?.kind==='native_scene')throw Error('请打开对应视频工作台后采纳。');const output=await saveWorkEditorCandidate(client,value,requestId);saved={status:output.currentMatches?'adopted':'saved-not-synced',versionId:output.receipt.versionId};}return saved;};
      const saved=review.enabled?await withEditorCandidateSave(value,requestId,()=>review.save(requestId),run):await run();
      if (alive.current) setAdoption(saved);
    } catch (cause) {
      if (alive.current)
        setError(
          cause instanceof Error
            ? cause.message
            : "采纳尚未确认，请恢复同一请求。",
        );
    } finally {
      if (alive.current) setBusy(false);
    }
  }
  return (
    <Dialog open={expanded && candidate?.kind !== "native_scene"} onOpenChange={setExpanded}>
    <section
      className="space-y-3 rounded-xl border border-primary/30 bg-primary/5 p-4 text-sm"
      aria-label="编导编辑候选"
    >
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-semibold">
          {value.target.contentType === "article"
            ? "文章"
            : value.target.contentType === "image"
              ? "图文"
              : "视频"}
          编辑候选
        </h3>
        <span className="text-muted-foreground">
          {value.changes.length} 项改动
        </span>
      </div>
      <p>{value.summary}</p>
      {value.scriptDiagnostics?.warnings.map((warning,index)=><p key={`warning:${index}`} className="text-text-muted">{warning}</p>)}
      {value.scriptDiagnostics?.errors.length?<details><summary className="cursor-pointer">{value.scriptDiagnostics.errors.length} 个文字问题 · 原段已保留</summary>{value.scriptDiagnostics.errors.map((issue,index)=><p key={index} className="mt-2">第 {issue.line} 行：{issue.message}{issue.hint?`；${issue.hint}`:''}</p>)}</details>:null}
      {value.error ? (
        <p role="alert" className="text-destructive">
          {value.error}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <DialogTrigger asChild><Button
          size="sm"
          variant="outline"
          disabled={busy || !candidate}
          onClick={() => void preview()}
        >
          {busy ? "处理中…" : expanded ? "重新预览" : "预览改动"}
        </Button></DialogTrigger>
        <Button
          size="sm"
          disabled={
            busy ||
            !candidate ||
            !value.apply ||
            !previewReady ||
            !review.ready ||
            (candidate.kind === "native_scene" && !video) ||
            adoption?.status === "adopted"
          }
          onClick={() => void adopt()}
        >
          {adoption?.status === "saved-native-unknown"
            ? "恢复原时间轴回执"
            : error
              ? "恢复 / 采纳原请求"
              : "采纳到当前作品"}
        </Button>
        <Link className="self-center text-primary underline" href={path}>
          打开作品
        </Link>
      </div>
      {expanded && candidate && (
        <div className="space-y-3">
          <details>
            <summary className="cursor-pointer">查看字段差异</summary>
            <div className="mt-2 space-y-2">
              {value.changes.map((change, index) => (
                <div key={index} className="rounded-lg border bg-surface p-3">
                  <p className="font-medium">{change.label}</p>
                  <p className="whitespace-pre-wrap text-muted-foreground">
                    原稿：
                    {typeof change.before === "string"
                      ? change.before
                      : JSON.stringify(change.before)}
                  </p>
                  <p className="whitespace-pre-wrap">
                    候选：
                    {typeof change.after === "string"
                      ? change.after
                      : JSON.stringify(change.after)}
                  </p>
                </div>
              ))}
            </div>
          </details>
          {candidate.kind === "native_scene" ? (
            video ? (
              <video
                aria-label="候选视频预览"
                controls
                src={video}
                className="w-full rounded-lg"
              />
            ) : (
              <p>正在准备实际预览…</p>
            )
          ) : null}
        </div>
      )}
      {error ? (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      ) : null}
      <AssistedWorkSelection review={review}/>
      {adoption ? (
        <p role="status" className="text-success">
          {adoption.message ??
            (adoption.status === "adopted"
              ? "已保存并采用。可继续微调。"
              : adoption.status === "saved-native-unknown"
                ? "已保存，时间轴响应尚未确认。请恢复原回执。"
                : "已保存，当前稿有新修改，未覆盖输入。")}
        </p>
      ) : null}
    </section>
    {candidate && candidate.kind !== "native_scene" && <DialogContent className="flex max-h-[calc(100dvh-2rem)] flex-col overflow-y-auto sm:max-w-5xl">
      <DialogTitle>{candidate.kind === "article" ? "文章改动预览" : "图文改动预览"}</DialogTitle>
      <DialogDescription>查看完整内容，关闭预览后采纳。</DialogDescription>
      {expanded && <NoteRelayEditor
        key={`${creationScopeKey(scope)}:${key}`}
        projectId={value.target.projectId}
        accountId={scope.accountId}
        outputId={value.target.outputId}
        sourceVersionId={key}
        platform={candidate.kind === "article" ? "wechat" : "rednote"}
        value={review.enabled&&review.ready?review.document:candidate.document}
        readOnlyCandidate
        onPreviewReady={() => setPreviewReady(true)}
        onLayoutChange={() => {}}
      />}
    </DialogContent>}
    </Dialog>
  );
}
