"use client";

import * as React from "react";
import type {WorkEditorTarget} from "@creatoros/contract";
import {useDraftChatRequest,editorDigest,editorCanonical,editorCandidateOutputId,derivedEditorDraft,matchesDerivedCandidate,type EditorSaveCandidate,type DraftEditorPort} from "@/features/draft-workbench/draft-chat-request";
import {saveWorkEditorCandidate} from "@/features/copilot/chat-work-editor-card";
import Link from "next/link";
import Image from "next/image";

import {useCreationClient,useCreationScope,creationScopeKey} from "@/lib/creation-workspace-scope";
import { client } from "@/lib/contract-client";
import { Button } from "@/components/ui/button";
import { describeUserError } from "@/lib/ai-error-humanize";

import { ArticleResultActions } from "./article-result-actions";
import {NoteRelayEditor} from "@/features/reference-editors/noterelay/noterelay-editor";
import {inheritArticleScript,reorganizePrompt} from "@/features/projects/script-first-content";
import { DoocsArticleEditor } from "./doocs-article-editor";

type SourceRef = import("@creatoros/contract").ArticleSourceRef;
type Section = { sectionId: string; order: number; heading: string; headingLevel: number; body: string; sourceRefs: SourceRef[] };
type FactItem = { id: string; text: string; sourceRefs: SourceRef[]; reviewState: "needs_confirmation" | "confirmed" };
type VisualBrief = { sectionId: string; brief: string; proposedAssetId?: string; proposedAssetFileId?: string };
type ImageUse = { sectionId: string; assetId: string; assetFileId: string; sourceKind: "existing" | "generated" | "screenshot"; reviewState: "selected" };
type CoverImageUse = { assetId: string; assetFileId: string; sourceKind: "existing" | "generated" | "screenshot"; reviewState: "selected" };
type ImageAsset = { id: string; name: string; assetType: string; status: string; currentFileId: string | null };
type ArticleDocument = {
  schemaVersion: 1;
  title: string;
  titleSourceRefs?: SourceRef[];
  summary: string;
  summarySourceRefs?: SourceRef[];
  sections: Section[];
  factItems: FactItem[];
  visualBriefs: VisualBrief[];
  imageUses: ImageUse[];
  coverImageUse?: CoverImageUse | null;
  tags?: string[];
  metadataSource?: import("@creatoros/contract").ArticleDocument["metadataSource"];
  imageMatchWarnings?: string[];
  nativeLayout?: import("@creatoros/contract").ArticleNativeLayout;
};
type ArticleState = {
  projectId: string;
  scriptContext?: import("@creatoros/contract").ProjectScriptContext;
  outputId: string;
  artifactId: string;
  currentVersionId: string;
  current: ArticleDocument;
  versions: { id: string; versionNumber: number; createdAt: string; changeSummary: string }[];
};
type BrandProfile = { id: string; versionNumber: number; oneLiner: string };
export type ArticleInitialRead = {scopeKey:string;projectId:string;outputId:string;result:Promise<{article:ArticleState;error?:never}|{article?:never;error:string}>};
export type ArticleBrandProfileRead = {scopeKey:string;result:Promise<BrandProfile|null>};
type ArticleSaveRequest = { clientRequestId: string; payloadDigest: string; body: { expectedCurrentVersionId: string; document: ArticleDocument } };
type CandidateSection = Section & { op: "insert" | "replace"; afterSectionId?: string | null };
type Candidate = {
  candidateId: string;
  proposedTitle: string;
  proposedTitleSourceRefs: SourceRef[];
  proposedSummary: string;
  proposedSummarySourceRefs: SourceRef[];
  proposedFactItems: FactItem[];
  proposedSections: CandidateSection[];
  proposedVisualBriefs: VisualBrief[];
};
type SourceAsset = { id: string; name: string; currentFileId: string; extractedText: string };
type ArticleClient = {
  createOutput(input: { params: { projectId: string }; query: undefined; body: { title: string; contentType: "article"; clientRequestId: string } }): Promise<{ id: string }>;
  getArticle(input: { params: { outputId: string }; query: undefined; body: undefined }): Promise<ArticleState>;
  getArticleVersion(input: { params: { outputId: string; versionId: string }; query: undefined; body: undefined }): Promise<{ versionId: string; document: ArticleDocument }>;
  getAssetFileDownloadUrl(input: { params: { assetId: string; assetFileId: string }; query: undefined; body: undefined }): Promise<{ url: string; fileName: string }>;
  listAssets(input: { params: undefined; query: { page: number; pageSize: number; status: "active" }; body: undefined }): Promise<ImageAsset[]>;
  listMaterialLinks(input: { params: undefined; query: { page: number; pageSize: number; projectId: string }; body: undefined }): Promise<Array<{ entityType: string; entityId: string }>>;
  getAsset(input: { params: { assetId: string }; query: undefined; body: undefined }): Promise<SourceAsset & { assetType: string; status: string; extractStatus: string | null }>;
  generateArticleCandidate(input: { params: { outputId: string }; query: undefined; body: { clientRequestId: string; brandProfileVersionId?: string; sourceAssets: Array<{assetId: string; assetFileId: string}> } }): Promise<{ taskId: string; candidateId: string; status: "queued" }>;
  getTask(input: { params: { taskId: string }; query: undefined; body: undefined }): Promise<Pick<Awaited<ReturnType<typeof client.getTask>>, "status" | "errorMessage">>;
  getArticleCandidate(input: { params: { candidateId: string }; query: undefined; body: undefined }): Promise<Candidate>;
  adoptArticleCandidate(input: { params: { candidateId: string }; query: undefined; body: { expectedCurrentVersionId: string; selectedSectionIds: string[]; selectedMetadataFields: ("title" | "summary" | "factItems")[]; clientRequestId: string } }): Promise<unknown>;
  createArticleVersion(input: { params: { outputId: string }; query: undefined; body: { expectedCurrentVersionId: string; document: ArticleDocument; clientRequestId: string } }): Promise<{ versionId: string; document: ArticleDocument }>;
};

function requestId(): string { return crypto.randomUUID(); }

// SEMANTIC_BOUNDARY_ALLOW: 仅规范化 JSON 协议对象的字段顺序，用于核对同一版本的完整回执；
// 先按真实 wire JSON 序列化规则省略非 JSON 的 undefined，再排序对象键；不删除实际 JSON 字段、
// 不改变数组顺序，也不参与文章内容或创作取舍。
function canonicalJson(value: unknown): string {
  const serialized = JSON.stringify(value);
  if (serialized === undefined) return "undefined";
  const canonicalize = (jsonValue: unknown): string => {
    if (Array.isArray(jsonValue)) return `[${jsonValue.map(canonicalize).join(",")}]`;
    if (jsonValue !== null && typeof jsonValue === "object") {
      const record = jsonValue as Record<string, unknown>;
      return `{${Object.keys(record).sort().map(key => `${JSON.stringify(key)}:${canonicalize(record[key])}`).join(",")}}`;
    }
    return JSON.stringify(jsonValue);
  };
  return canonicalize(JSON.parse(serialized));
}
function tokenFor(ref: { current: { id: string; payload: string } }, payload: unknown): string {
  const serialized = JSON.stringify(payload);
  if (ref.current.payload !== serialized) ref.current = { id: requestId(), payload: serialized };
  return ref.current.id;
}
function errorText(error: unknown): string {
  return describeUserError(error, "操作没有完成，请检查连接后重试。若持续失败，请查看诊断日志。");
}


function SourceReferences({ refs }: { refs: SourceRef[] | undefined }) {
  if (!refs?.length) return null;
  return <ul className="mt-1 space-y-1 text-xs text-muted-foreground">
    {refs.map((ref, index) => <li key={`${ref.kind}-${ref.kind === "output_version" ? ref.sourceOutputId : ref.kind === "moments_version" ? ref.momentsId : ref.kind === "work_basis_version" ? ref.compositionId : ref.id}-${ref.versionId}-${index}`}>
      来源：{ref.kind === "output_version" ? `已保存的${ref.sourceType === "article" ? "文章" : ref.sourceType === "image" ? "图文" : "视频"}稿` : ref.kind === "moments_version" ? "朋友圈历史稿" : ref.kind === "work_basis_version" ? "作品共享依据" : ref.kind === "project_script" ? "主脚本或大纲的保存版本" : ref.kind === "project" ? "项目资料" : "账号素材"}
    </li>)}
  </ul>;
}

function sectionLabel(document: ArticleDocument, sectionId: string): string {
  const index = document.sections.findIndex((section) => section.sectionId === sectionId);
  return index < 0 ? "文章配图" : document.sections[index]!.heading.trim() || `第 ${index + 1} 段`;
}

function ArticleImagePreview({ image, label, candidate = false }: { image: ImageUse; label: string; candidate?: boolean }) {
  const articleClient=useCreationClient() as unknown as ArticleClient;
  const [src, setSrc] = React.useState<string | null>(null);
  const [unavailable, setUnavailable] = React.useState(false);
  React.useEffect(() => {
    let active = true;
    setSrc(null); setUnavailable(false);
    void articleClient.getAssetFileDownloadUrl({ params: { assetId: image.assetId, assetFileId: image.assetFileId }, query: undefined, body: undefined })
      .then((result) => { if (active) setSrc(result.url); })
      .catch(() => { if (active) setUnavailable(true); });
    return () => { active = false; };
  }, [image.assetId, image.assetFileId]);
  return <figure className="mt-2 rounded-md border p-2">
    {src ? <img src={src} alt={`${label} 的${candidate ? "匹配配图候选" : "已选配图"}`} className="max-h-64 w-auto rounded object-contain" />
      : <div className="text-xs text-muted-foreground">{unavailable ? "此版本的图片已不可用" : "正在读取此版本图片…"}</div>}
    <figcaption className="mt-1 text-xs text-muted-foreground">{label} · {candidate ? "匹配配图候选" : "所选图片"}</figcaption>
  </figure>;
}

function ArticleCoverDisplay({ image }: { image: CoverImageUse }) {
  const articleClient=useCreationClient() as unknown as ArticleClient;
  const [url, setUrl] = React.useState<string | null>(null);
  const [unavailable, setUnavailable] = React.useState(false);
  React.useEffect(() => {
    let active = true;
    void articleClient.getAssetFileDownloadUrl({ params: { assetId: image.assetId, assetFileId: image.assetFileId }, query: undefined, body: undefined })
      .then((result) => { if (active) setUrl(result.url); })
      .catch(() => { if (active) setUnavailable(true); });
    return () => { active = false; };
  }, [image.assetId, image.assetFileId]);
  return <figure className="rounded-lg border border-border p-3"><figcaption className="mb-2 text-sm font-medium">已采纳的文章封面</figcaption>
    {url ? <Image src={url} alt="已采纳的文章封面" width={640} height={360} unoptimized className="max-h-64 w-full rounded-md object-contain" />
      : <p className="text-xs text-muted-foreground">{unavailable ? "此封面图片暂无法读取" : "正在读取封面图片…"}</p>}</figure>;
}

function ArticleWorkbenchSession({ projectId, projectTitle, accountId, initialOutputs, initialOutputId, activeBrandProfile = null, initialArticleRead, brandProfileRead }: {
  projectId: string;
  projectTitle: string;
  accountId?: string | null;
  /** 旧调用方兼容；本地写作不再以完整 Brief 或平台目标为前置条件。 */
  briefReady?: boolean;
  articleTargetSelected?: boolean;
  initialOutputs: { id: string; title: string }[];
  initialOutputId?: string;
  activeBrandProfile?: BrandProfile | null;
  initialArticleRead?: ArticleInitialRead;
  brandProfileRead?: ArticleBrandProfileRead;
}) {
  const scope=useCreationScope(),articleClient=useCreationClient() as unknown as ArticleClient,workspaceOwner=creationScopeKey(scope);
  const chat=useDraftChatRequest();
  const [initialWritingChoice]=React.useState(()=>chat.readWritingContext(workspaceOwner,projectId));
  const [firstArticleRead]=React.useState(initialArticleRead);
  const [deferredBrand]=React.useState(()=>brandProfileRead?.scopeKey===workspaceOwner?brandProfileRead:undefined);
  const [brandProfile,setBrandProfile]=React.useState(activeBrandProfile);
  const [brandReady,setBrandReady]=React.useState(!deferredBrand);
  const writingReady=Boolean(initialWritingChoice)||brandReady;
  const brandVersion=initialWritingChoice?initialWritingChoice.brandProfileVersionId:brandProfile?.id??null;
  React.useEffect(()=>{
    if(!deferredBrand)return;
    let active=true;
    void deferredBrand.result.then(profile=>{if(active){setBrandProfile(profile);setBrandReady(true);}},()=>{if(active){setBrandProfile(null);setBrandReady(true);}});
    return()=>{active=false;};
  },[deferredBrand]);
  const sourceVersionChoices=React.useRef(initialWritingChoice?.sourceAssets??[]);
  const [outputs, setOutputs] = React.useState(initialOutputs);
  const [outputId, setOutputId] = React.useState(initialOutputId
    ? initialOutputs.some(output => output.id === initialOutputId) ? initialOutputId : ""
    : initialOutputs.length === 1 ? initialOutputs[0]!.id : "");
  const [pendingSwitch, setPendingSwitch] = React.useState<{outputId: string} | {create: true} | null>(null);
  const [state, setState] = React.useState<ArticleState | null>(null);
  const [draft, setDraftState] = React.useState<ArticleDocument | null>(null);
  const [candidate, setCandidate] = React.useState<Candidate | null>(null);
  const [pendingTaskId, setPendingTaskId] = React.useState<string | null>(null);
  const [partialTask, setPartialTask] = React.useState(false);
  const useBrandProfile=brandVersion!==null;
  const [sourceAssets] = React.useState<SourceAsset[]>([]);
  const [selectedSourceIds] = React.useState<string[]>(initialWritingChoice?.sourceAssets.map(s=>s.assetId)??[]);
  const [preview, setPreview] = React.useState<{ versionId: string; document: ArticleDocument } | null>(null);
  const [selectedSections, setSelectedSections] = React.useState<string[]>([]);
  const [selectedMetadata, setSelectedMetadata] = React.useState<("title" | "summary" | "factItems")[]>([]);
  const [busy, setBusy] = React.useState<"create" | "load" | "generate" | "adopt" | "save" | null>(null);
  const [message, setMessage] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const firstLoads = React.useRef(new Set<string>());
  const stateRef = React.useRef(state);
  const mountedRef=React.useRef(true);
  React.useEffect(()=>{mountedRef.current=true;return()=>{mountedRef.current=false;};},[]);
  const draftRef = React.useRef(draft);
  React.useLayoutEffect(() => { stateRef.current = state; draftRef.current = draft; }, [state,draft]);
  const derivedRef=React.useRef<ReturnType<typeof derivedEditorDraft>>(null),admittedRef=React.useRef<{candidate:string;proof:NonNullable<ReturnType<typeof derivedEditorDraft>>}|null>(null);
  const generationRef=React.useRef(0),targetRef=React.useRef<WorkEditorTarget|null>(null),portRef=React.useRef<DraftEditorPort|null>(null),savePromiseRef=React.useRef<Promise<boolean>|null>(null);
  const selectionRef=React.useRef<Extract<WorkEditorTarget,{owner:"wechat_article"}>["selection"]>({kind:"article",sectionIds:[]});
  const setDraft=React.useCallback((value:React.SetStateAction<ArticleDocument | null>)=>{const next=typeof value==='function'?value(draftRef.current):value;if(editorCanonical(next)!==editorCanonical(draftRef.current)){derivedRef.current=null;admittedRef.current=null;generationRef.current++;draftRef.current=next;selectionRef.current={kind:"article",sectionIds:[]};chat.notifyEditorChanged();}setDraftState(next);},[chat.notifyEditorChanged]);
  function save(documentOverride?:ArticleDocument):Promise<boolean>{derivedRef.current=null;admittedRef.current=null;if(savePromiseRef.current)return savePromiseRef.current;const work=saveCore(documentOverride);savePromiseRef.current=work;return work.finally(()=>{if(savePromiseRef.current===work)savePromiseRef.current=null;});}

  const registeredEditorRef=React.useRef<{outputId:string;port:DraftEditorPort}|null>(null);
  const loadSerial = React.useRef(0);
  React.useEffect(() => () => { loadSerial.current += 1; }, []);
  const createRequestId = React.useRef({ id: requestId(), payload: "" });
  const adoptRequestId = React.useRef({ id: requestId(), payload: "" });
  const saveRequestId = React.useRef({ id: requestId(), payload: "" });
  const dirty = Boolean(state && draft && JSON.stringify(draft) !== JSON.stringify(state.current));

  function selectOutput(id: string) {
    setOutputId(id);
    // Next 支持原生 History API；保持已选作品深链，不触发整页重新读取或丢失草稿。
    if (window.location.pathname === `/projects/${projectId}/article`) {
      const url = new URL(window.location.href);
      url.searchParams.set("outputId", id);
      window.history.replaceState(null, "", url);
    }
  }

  const load = React.useCallback(async (id: string, firstRead?:ArticleInitialRead) => {
    const serial = ++loadSerial.current;
    setBusy("load"); setError(null); setPartialTask(false);
    try {
      let loaded:ArticleState;
      if(firstRead){const result=await firstRead.result;if(result.error!==undefined)throw Error(result.error);loaded=result.article;}
      else loaded = await articleClient.getArticle({ params: { outputId: id }, query: undefined, body: undefined });
      if (serial !== loadSerial.current) return;
      if(loaded.projectId!==projectId||loaded.outputId!==id)throw Error('文章不属于当前项目或作品，请返回项目重新打开。');
      const key = `${workspaceOwner}:${id}`;
      const current = structuredClone(loaded.current);
      const first=!firstLoads.current.has(key);
      const initial = first ? inheritArticleScript(current, loaded.scriptContext) : current;
      firstLoads.current.add(key);
      stateRef.current = loaded; draftRef.current = initial;
      setState(loaded); setDraft(initial);
      derivedRef.current=first?derivedEditorDraft({scopeKey:workspaceOwner,projectId,outputId:loaded.outputId,owner:"wechat_article",artifactId:loaded.artifactId,currentVersionId:loaded.currentVersionId,current:current,draft:initial,generation:generationRef.current,scriptContext:loaded.scriptContext}):null;admittedRef.current=null;
      setCandidate(null);
      setSelectedSections([]); setSelectedMetadata([]); setPreview(null);
      const registered=registeredEditorRef.current;
      if(mountedRef.current&&registered?.outputId===id&&loaded.outputId===id)chat.notifyEditorReady(registered.port);
    } catch (err) { if (serial === loadSerial.current) { setError(errorText(err)); setState(null); setDraft(null); } }
    finally { if (serial === loadSerial.current) setBusy(null); }
  }, [accountId,chat.notifyEditorReady]);
  React.useEffect(() => {
    if(!outputId)return;
    const firstRead=!firstLoads.current.has(`${workspaceOwner}:${outputId}`)&&firstArticleRead?.scopeKey===workspaceOwner&&firstArticleRead.projectId===projectId&&firstArticleRead.outputId===outputId?firstArticleRead:undefined;
    void load(outputId,firstRead);
  }, [outputId, load, firstArticleRead, workspaceOwner, projectId]);
  React.useEffect(() => {
    if (!outputId) return;
    setPendingTaskId(sessionStorage.getItem(`creatoros:article-task:${outputId}`));
  }, [outputId]);
  React.useEffect(() => {
    if (!pendingTaskId || !outputId) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let readFailures = 0;
    const key = `creatoros:article-task:${outputId}`;
    async function poll() {
      try {
        const task = await articleClient.getTask({ params: { taskId: pendingTaskId! }, query: undefined, body: undefined });
        if (!active) return;
        if (task.status === "partial") {
          setError(null);
          setMessage(null); setPartialTask(true);
          setPendingTaskId(null);
          return;
        }
        if (task.status === "awaiting_confirmation" || task.status === "succeeded") {
          const next = await articleClient.getArticleCandidate({ params: { candidateId: pendingTaskId! }, query: undefined, body: undefined });
          if (!active) return;
          setError(null);
          setCandidate(next); setSelectedSections(next.proposedSections.map((section) => section.sectionId));
          setSelectedMetadata([...(!draftRef.current?.title.trim() ? ["title" as const] : []), ...(!draftRef.current?.summary.trim() ? ["summary" as const] : []), "factItems"]);
          setMessage("候选已生成。请审读后选择要采纳的内容；当前稿件尚未改变。");
          setPendingTaskId(null); sessionStorage.removeItem(key);
          return;
        }
        if (task.status === "failed" || task.status === "cancelled") {
          setError(errorText(new Error(task.errorMessage || "文章生成未完成")));
          setPendingTaskId(null); sessionStorage.removeItem(key);
          return;
        }
        readFailures = 0;
        setError(null);
        timer = setTimeout(() => { void poll(); }, 2500);
      } catch (err) {
        if (!active) return;
        readFailures += 1;
        if (readFailures >= 3) setError(`${errorText(err)} 生成任务仍保留，系统会继续读取；刷新页面也可恢复。`);
        timer = setTimeout(() => { void poll(); }, Math.min(2500 * readFailures, 15000));
      }
    }
    void poll();
    return () => { active = false; if (timer) clearTimeout(timer); };
  }, [outputId, pendingTaskId]);

  const writingChoice=()=>{if(!writingReady)throw Error('正在读取当前定位，请稍后再组织内容。');return {schemaVersion:1 as const,brandProfileVersionId:useBrandProfile?brandVersion:null,sourceAssets:selectedSourceIds.map(id=>sourceVersionChoices.current.find(s=>s.assetId===id)??(()=>{const asset=sourceAssets.find(s=>s.id===id);if(!asset?.currentFileId)throw Error('所选资料的原文件版本不可用，请明确重新选择');return {assetId:id,assetFileId:asset.currentFileId};})())};};
  React.useEffect(()=>{if(writingReady)chat.setWritingContext(workspaceOwner,projectId,writingChoice());},[workspaceOwner,projectId,useBrandProfile,brandVersion,writingReady,selectedSourceIds,sourceAssets,chat.setWritingContext]);
  const derivedCurrent=(proof:NonNullable<ReturnType<typeof derivedEditorDraft>>)=>Boolean(mountedRef.current&&derivedRef.current===proof&&
    stateRef.current?.outputId===proof.outputId&&stateRef.current.artifactId===proof.artifactId&&stateRef.current.currentVersionId===proof.currentVersionId&&
    workspaceOwner===proof.scopeKey&&projectId===proof.projectId&&generationRef.current===proof.generation&&
    editorCanonical(stateRef.current.current)===proof.baseFingerprint&&editorCanonical(draftRef.current)===proof.draftFingerprint&&
    editorCanonical(stateRef.current.scriptContext?.scriptRef)===proof.scriptFingerprint&&stateRef.current.scriptContext?.scriptText===proof.scriptText);
  React.useLayoutEffect(()=>{portRef.current={admitCandidate:async(candidate)=>{
   const proof=derivedRef.current;if(!proof||!derivedCurrent(proof)||!await matchesDerivedCandidate(proof,candidate)||await proof.scriptTextDigest!==await editorDigest(proof.scriptText))return null;
   const latest=await articleClient.getArticle({params:{outputId:proof.outputId},query:undefined,body:undefined});
   const exact=await articleClient.getArticleVersion({params:{outputId:proof.outputId,versionId:proof.currentVersionId},query:undefined,body:undefined});
   if(!derivedCurrent(proof)||latest.projectId!==proof.projectId||latest.artifactId!==proof.artifactId||latest.currentVersionId!==proof.currentVersionId||exact.versionId!==proof.currentVersionId||editorCanonical(exact.document)!==proof.baseFingerprint||editorCanonical(latest.current)!==proof.baseFingerprint)return null;
   admittedRef.current={candidate:editorCanonical(candidate),proof};return {isCurrent:()=>derivedCurrent(proof)};
  },readState:()=>({target:targetRef.current,outputId:stateRef.current?.outputId,generation:generationRef.current,dirty:Boolean(stateRef.current&&draftRef.current&&editorCanonical(draftRef.current)!==editorCanonical(stateRef.current.current)),preparation:stateRef.current&&draftRef.current&&writingReady?{scopeKey:workspaceOwner,projectId,outputId:stateRef.current.outputId,owner:"wechat_article",versionId:stateRef.current.currentVersionId,documentFingerprint:editorCanonical(draftRef.current),selection:selectionRef.current,writingContext:writingChoice()}:undefined}),prepareForTurn:async(options)=>{
   writingChoice();
   if(savePromiseRef.current)await savePromiseRef.current;
   const initial=stateRef.current;if(!initial||!draftRef.current)throw Error("当前稿件尚未准备好。");
   if(editorCanonical(draftRef.current)!==editorCanonical(initial.current)&&!(await save()))throw Error("请先确认保存当前修改，原请求已保留。");
   const current=stateRef.current!;const latest=await articleClient.getArticle({params:{outputId:current.outputId},query:undefined,body:undefined});
   if(options?.requireScript&&(latest.scriptContext?.state!=="ready"||!latest.scriptContext.scriptRef||!latest.scriptContext.scriptText.trim()))throw Error("请先在脚本中保存原稿，再重新组织内容。");
   const exact=await articleClient.getArticleVersion({params:{outputId:current.outputId,versionId:latest.currentVersionId},query:undefined,body:undefined});
   if(latest.currentVersionId!==current.currentVersionId||editorCanonical(exact.document)!==editorCanonical(latest.current)||editorCanonical(draftRef.current)!==editorCanonical(exact.document))throw Error("当前作品已改变，请核对保存版本后重试。");
   const target:WorkEditorTarget={schemaVersion:1,projectId,outputId:latest.outputId,owner:"wechat_article",writingContext:writingChoice(),contentType:"article",savedBase:{kind:"artifact",artifactId:latest.artifactId,versionId:latest.currentVersionId},documentDigest:await editorDigest(exact.document),selection:selectionRef.current};targetRef.current=target;return target;
  },previewCandidate:async()=>null,adoptCandidate:async(result:EditorSaveCandidate,requestId:string,isCurrent?:()=>boolean)=>{
   const initial=stateRef.current;if(!initial||initial.outputId!==editorCandidateOutputId(result))throw Error("当前作品已改变。");
   const frozen=editorCanonical(draftRef.current),generation=generationRef.current;
   const saved=await saveWorkEditorCandidate(articleClient,result,requestId);
   if(isCurrent&&!isCurrent())return {status:"saved-not-synced",versionId:saved.receipt.versionId};
   const sync=(editorCanonical(initial.current)===frozen||Boolean(admittedRef.current&&admittedRef.current.candidate===editorCanonical(result)&&derivedCurrent(admittedRef.current.proof)))&&generation===generationRef.current&&editorCanonical(draftRef.current)===frozen&&saved.currentMatches;
   let syncedGeneration:number|undefined;
   if(mountedRef.current&&stateRef.current?.outputId===initial.outputId){stateRef.current=saved.current;setState(saved.current);if(sync){setDraft(structuredClone(saved.current.current));if(editorCanonical(draftRef.current)===editorCanonical(saved.current.current))syncedGeneration=generationRef.current;}else setMessage("已保存，当前稿有新修改，未覆盖输入。");}
   return {status:syncedGeneration!==undefined?"adopted":"saved-not-synced",versionId:saved.receipt.versionId,...(syncedGeneration!==undefined?{syncedGeneration}:{})};
  }};});
  React.useEffect(()=>{
    const port:DraftEditorPort={admitCandidate:c=>portRef.current!.admitCandidate!(c),readState:()=>portRef.current!.readState(),prepareForTurn:options=>portRef.current!.prepareForTurn(options),previewCandidate:c=>portRef.current!.previewCandidate(c),adoptCandidate:(c,id,isCurrent)=>portRef.current!.adoptCandidate(c,id,isCurrent)};
    const registered={outputId,port};registeredEditorRef.current=registered;
    const unregister=chat.registerEditor(port);
    return()=>{if(registeredEditorRef.current===registered)registeredEditorRef.current=null;unregister();};
  },[chat.registerEditor,outputId]);
  async function createArticle() {
    setBusy("create"); setError(null); setMessage(null);
    try {
      const title = `${projectTitle} · 公众号文章`;
      const created = await articleClient.createOutput({ params: { projectId }, query: undefined,
        body: { title, contentType: "article", clientRequestId: tokenFor(createRequestId, { projectId, title }) } });
      createRequestId.current = { id: requestId(), payload: "" };
      setOutputs((prev) => [...prev, { id: created.id, title }]);
      selectOutput(created.id);
    } catch (err) { setError(errorText(err)); }
    finally { setBusy(null); }
  }
  async function adopt() {
    if (!state || !candidate || busy || dirty) return;
    if (!selectedSections.length && !selectedMetadata.length) { setError("至少选择一项要采纳的内容。"); return; }
    if (selectedMetadata.includes("factItems") && !window.confirm("采纳待确认事实清单会替换当前清单，确认继续吗？")) return;
    setBusy("adopt"); setError(null); setMessage(null);
    try {
      const payload = { candidateId: candidate.candidateId, expectedCurrentVersionId: state.currentVersionId,
        selectedSectionIds: selectedSections, selectedMetadataFields: selectedMetadata };
      await articleClient.adoptArticleCandidate({ params: { candidateId: candidate.candidateId }, query: undefined,
        body: { expectedCurrentVersionId: state.currentVersionId, selectedSectionIds: selectedSections,
          selectedMetadataFields: selectedMetadata, clientRequestId: tokenFor(adoptRequestId, payload) } });
      adoptRequestId.current = { id: requestId(), payload: "" };
      await load(state.outputId);
      setMessage("已采纳并保存为新版本。");
    } catch (err) { setError(errorText(err)); }
    finally { setBusy(null); }
  }
  async function saveCore(documentOverride?: ArticleDocument) {
    const documentToSave = documentOverride ?? draft;
    if (!state || !documentToSave || busy) return false;
    if(canonicalJson(documentToSave)===canonicalJson(state.current)&&!sessionStorage.getItem(`creatoros:article:request:${workspaceOwner}:${state.outputId}`))return true;
    const serial = loadSerial.current;
    const beforeSaveDigest = JSON.stringify(draftRef.current);
    setBusy("save"); setError(null); setMessage(null);
    try {
      const storageKey = `creatoros:article:request:${workspaceOwner}:${state.outputId}`;
      const payload = { outputId: state.outputId, expectedCurrentVersionId: state.currentVersionId, document: documentToSave };
      const payloadDigest = JSON.stringify(payload);
      let request = sessionStorage.getItem(storageKey);
      let requestValue: ArticleSaveRequest | null = null;
      if (request) {
        try { requestValue = JSON.parse(request) as ArticleSaveRequest; } catch { sessionStorage.removeItem(storageKey); }
      }
      let recoveringPriorSave = false;
      if (requestValue) recoveringPriorSave = requestValue.payloadDigest !== payloadDigest;
      if (!requestValue) {
        requestValue = { clientRequestId: requestId(), payloadDigest, body: { expectedCurrentVersionId: state.currentVersionId, document: documentToSave } };
        request = JSON.stringify(requestValue);
        sessionStorage.setItem(storageKey, request);
      }
      const result = await articleClient.createArticleVersion({ params: { outputId: state.outputId }, query: undefined,
        body: { ...requestValue.body, clientRequestId: requestValue.clientRequestId } });
      const exact = await articleClient.getArticleVersion({ params: { outputId: state.outputId, versionId: result.versionId }, query: undefined, body: undefined });
      if (exact.versionId !== result.versionId || canonicalJson(exact.document) !== canonicalJson(requestValue.body.document)) {
        throw new Error("保存回执与指定版本读回不一致，未清理恢复记录。");
      }
      const latest = await articleClient.getArticle({ params: { outputId: state.outputId }, query: undefined, body: undefined });
      if (serial !== loadSerial.current) return false;
      const editedDuringSave = JSON.stringify(draftRef.current) !== beforeSaveDigest;
      stateRef.current = latest;
      sessionStorage.removeItem(storageKey);
      saveRequestId.current = { id: requestValue.clientRequestId, payload: requestValue.payloadDigest };
      if (latest.currentVersionId !== result.versionId || canonicalJson(latest.current)!==canonicalJson(exact.document)) {
        setState(latest); if (!editedDuringSave) setDraft(documentToSave);
        setError(`此请求已保存为版本 ${exact.versionId}，但当前稿件已被并发更新。保留本地草稿，请比较后再决定。`);
        return false;
      }
      setState(latest);
      if (recoveringPriorSave) {
        if (!editedDuringSave) setDraft(documentToSave);
        setError("已恢复上一笔保存回执。当前编辑仍保留，请再次保存以写入新版本。");
        return false;
      }
      if (editedDuringSave) {
        setMessage("原输入已保存。保存期间的新编辑仍保留，请再次保存后生成。");
        return false;
      }
      setDraft(structuredClone(latest.current));

      setMessage("稿件已保存为新版本并完成指定版本读回。");
      return true;
    } catch (err) { if (serial === loadSerial.current) setError(errorText(err)); return false; }
    finally { if (serial === loadSerial.current) setBusy(null); }
  }
  async function previewVersion(versionId: string) {
    if (!state || busy) return;
    setError(null);
    try {
      const next = await articleClient.getArticleVersion({ params: { outputId: state.outputId, versionId }, query: undefined, body: undefined });
      setPreview(next);
    } catch (err) { setError(errorText(err)); }
  }
  const [reorganizing,setReorganizing]=React.useState(false);
  const reorganizationInFlight=React.useRef(false);
  async function reorganize(){
    if(reorganizationInFlight.current||busy||!state)return;
    reorganizationInFlight.current=true;setReorganizing(true);setError(null);
    try{
      const output=state.outputId;
      const preparedEditorTurn=await chat.prepareEditorRequest(workspaceOwner);
      if(!preparedEditorTurn)await portRef.current!.prepareForTurn({requireScript:true});
      if(mountedRef.current&&stateRef.current?.outputId===output)chat.openChat({prefill:reorganizePrompt("wechat"),autoSend:true,preparedEditorTurn});
      else chat.discardPreparedEditorTurn(preparedEditorTurn);
    }catch(reason){if(mountedRef.current)setError(errorText(reason));}
    finally{reorganizationInFlight.current=false;if(mountedRef.current)setReorganizing(false);}
  }

  const showArticleControls = !state || outputs.length > 1;
  const articleControls = (
    <section className="flex flex-wrap items-center gap-3 rounded-xl border p-4">
      <select aria-label="选择文章" id="article-output" className="rounded-md border bg-background px-3 py-2 text-sm" value={outputId}
        onChange={(event) => dirty ? setPendingSwitch({outputId: event.target.value}) : selectOutput(event.target.value)} disabled={Boolean(busy)}>
        {!outputId && <option value="">{outputs.length ? "选择要编辑的文章" : "尚未创建文章"}</option>}
        {outputs.map((output) => <option key={output.id} value={output.id}>{output.title}</option>)}
      </select>
      <Button variant="outline" onClick={() => dirty ? setPendingSwitch({create: true}) : void createArticle()} disabled={Boolean(busy)}>新建文章</Button>
    </section>
  );

  return <main data-page="article-workbench" data-studio-layout="document" className="mx-auto w-full max-w-[1200px] @container space-y-4 px-3 py-4 text-sm sm:px-5 md:px-8">
    {showArticleControls && articleControls}
    {pendingSwitch && <section role="alertdialog" aria-label="当前文章有未保存修改" className="space-y-3 rounded-xl border border-border bg-surface p-4">
      <p>当前文章有未保存的修改。保存后继续，或明确放弃这些修改。</p>
      <div className="flex flex-wrap gap-2">
        <Button disabled={Boolean(busy)} onClick={() => void (async () => {
          const target = pendingSwitch;
          if (await save()) {setPendingSwitch(null); if ("create" in target) await createArticle(); else selectOutput(target.outputId);}
        })()}>保存后继续</Button>
        <Button variant="outline" disabled={Boolean(busy)} onClick={() => {const target = pendingSwitch; setPendingSwitch(null); if ("create" in target) void createArticle(); else selectOutput(target.outputId);}}>放弃修改并继续</Button>
        <Button variant="ghost" disabled={Boolean(busy)} onClick={() => setPendingSwitch(null)}>继续编辑当前稿</Button>
      </div>
    </section>}
    {error && <div role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}{state?<Button variant="outline" className="ml-3" disabled={Boolean(busy)} onClick={()=>void save()}>恢复保存并核对</Button>:outputId&&<Button variant="outline" className="ml-3" disabled={Boolean(busy)} onClick={()=>void load(outputId)}>重新读取文章</Button>}</div>}
    {partialTask && <p data-slot="article-task-partial" role="status" className="rounded-md bg-warning/10 p-3 text-sm text-foreground">本次文章生成部分完成，候选尚未就绪；请查看原任务结果。</p>}
    {message && <p role="status" className="rounded-md bg-success-soft p-3 text-sm text-success">{message}</p>}
    {busy === "load" && <p className="text-sm text-muted-foreground">正在读取已保存的文章…</p>}
    {state && draft && <>
      <header className="flex flex-wrap items-start justify-between gap-4 py-2">
        <div><h1 className="text-lg font-semibold">公众号成稿</h1></div>
        <Button className="min-h-11 px-5" disabled={Boolean(busy)||reorganizing||!writingReady||!state.scriptContext?.scriptText.trim()||state.scriptContext.state!=="ready"} onClick={()=>void reorganize()}>{reorganizing?"正在准备…":"重新组织内容"}</Button>
      </header>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>{dirty?"已承接脚本，开始对话或导出时保存":"当前成稿已保存"}</span>
        <Link href={`/projects/${projectId}`} className="underline underline-offset-4">{state.scriptContext?.state==="ready"?"查看脚本原稿":"前往脚本撰写原稿"}</Link>
      </div>
      {!writingReady&&<p role="status" className="text-xs text-muted-foreground">正在读取当前定位，正文可先查看和导出。</p>}
      {state.scriptContext?.message&&<p role="status" className="text-sm text-muted-foreground">{state.scriptContext.message}</p>}
      {draft.imageMatchWarnings?.map((warning,index)=><p key={index} role="status" className="text-sm text-muted-foreground">{warning}</p>)}
      {(scope.groupId||accountId)&&(draft.nativeLayout?.editor==='doocs-md'?<DoocsArticleEditor deliveryOnly showPreview prepareDelivery={async()=>{if(!(await save())||!stateRef.current)return null;return {versionId:stateRef.current.currentVersionId,document:stateRef.current.current};}} projectId={projectId} accountId={accountId??null} outputId={state.outputId} sourceVersionId={state.currentVersionId} value={draft} savedDocument={state.current} onChange={setDraft} onSave={save}/>:<NoteRelayEditor simplified prepareDelivery={save} projectId={projectId} accountId={accountId??null} outputId={state.outputId} sourceVersionId={state.currentVersionId} platform="wechat" value={draft} disabled={Boolean(busy)} onLayoutChange={layout=>setDraft(current=>current?{...current,nativeLayout:layout}:current)}
        extraDelivery={<DoocsArticleEditor deliveryOnly prepareDelivery={async()=>{if(!(await save())||!stateRef.current)return null;return {versionId:stateRef.current.currentVersionId,document:stateRef.current.current};}} projectId={projectId} accountId={accountId??null} outputId={state.outputId} sourceVersionId={state.currentVersionId} value={draft} savedDocument={state.current} onChange={setDraft} onSave={save}/>} />)}
      {(scope.groupId||accountId)&&<ArticleResultActions resultsOnly prepareDelivery={save} key={state.outputId} accountId={accountId??null} outputId={state.outputId} currentVersionId={state.currentVersionId} dirty={dirty} bodyReplaceBlocked={draft.imageUses.length>0||draft.visualBriefs.length>0} sections={draft.sections.map(section=>({sectionId:section.sectionId,heading:section.heading}))} onAdopt={()=>load(state.outputId)}/>}
      {candidate && <section className="rounded-xl border border-primary/30 bg-primary/5 p-5">
        <h2 className="font-semibold">待审读候选</h2><p className="mt-1 text-sm text-muted-foreground">勾选的内容才会写入新版本；未选部分保持当前稿件。</p>
        <div className="mt-4 space-y-3 text-sm">
          {(["title", "summary", "factItems"] as const).map((field) => <label key={field} className="flex gap-2 rounded-md border bg-background p-3">
            <input type="checkbox" aria-label={field === "title" ? "候选标题" : field === "summary" ? "候选摘要" : "候选事实清单"} checked={selectedMetadata.includes(field)} onChange={(event) => setSelectedMetadata(event.target.checked ? [...selectedMetadata, field] : selectedMetadata.filter((value) => value !== field))} />
            <span><strong>{field === "title" ? "标题" : field === "summary" ? "摘要" : "待确认事实（替换当前清单）"}</strong><br />
              {field === "title" ? <>{candidate.proposedTitle}<SourceReferences refs={candidate.proposedTitleSourceRefs} /></>
                : field === "summary" ? <>{candidate.proposedSummary}<SourceReferences refs={candidate.proposedSummarySourceRefs} /></>
                  : <div data-testid="article-fact-diff" className="mt-1 space-y-1">
                    <p>当前清单：{state.current.factItems.map((item) => item.text).join("；") || "无"}</p>
                    <p>候选清单：{candidate.proposedFactItems.map((item) => item.text).join("；") || "无（采纳后清空当前清单）"}</p>
                    {candidate.proposedFactItems.map((item) => <SourceReferences key={item.id} refs={item.sourceRefs} />)}
                  </div>}
            </span>
          </label>)}
          {candidate.proposedSections.map((section) => <label key={section.sectionId} className="flex gap-2 rounded-md border bg-background p-3">
            <input type="checkbox" checked={selectedSections.includes(section.sectionId)} onChange={(event) => setSelectedSections(event.target.checked ? [...selectedSections, section.sectionId] : selectedSections.filter((id) => id !== section.sectionId))} />
            <span><strong>{section.op === "insert" ? "新增" : "替换"} · {section.heading}</strong><br /><span className="whitespace-pre-wrap">{section.body}</span><SourceReferences refs={section.sourceRefs} /></span>
          </label>)}
          {!!candidate.proposedVisualBriefs.length && <div className="text-muted-foreground">配图建议：{candidate.proposedVisualBriefs.map((item) => item.brief).join("；")}。匹配到的素材会随所选段落采用，已有配图会保留。</div>}
          {candidate.proposedVisualBriefs.filter(item=>item.proposedAssetId&&item.proposedAssetFileId&&selectedSections.includes(item.sectionId)).map(item=><ArticleImagePreview key={item.sectionId} candidate label={candidate.proposedSections.find(section=>section.sectionId===item.sectionId)?.heading||"候选段落"} image={{sectionId:item.sectionId,assetId:item.proposedAssetId!,assetFileId:item.proposedAssetFileId!,sourceKind:"existing",reviewState:"selected"}}/>)}
        </div>
        {dirty && <Button className="mt-3" variant="outline" disabled={Boolean(busy)} onClick={()=>void save()}>保存承接稿后审阅候选</Button>}
        <Button className="mt-4" onClick={() => void adopt()} disabled={Boolean(busy) || dirty || (!selectedSections.length && !selectedMetadata.length)}>确认采纳所选内容</Button>
      </section>}
      <details className="rounded-xl border p-4"><summary className="cursor-pointer text-sm font-medium">历史版本</summary><ol className="mt-3 space-y-2 text-sm text-muted-foreground">
        {state.versions.map((version) => <li key={version.id} className="flex flex-wrap items-center gap-3">v{version.versionNumber} · {new Date(version.createdAt).toLocaleString("zh-CN")} · {version.changeSummary}
          <Button variant="outline" size="sm" onClick={() => void previewVersion(version.id)}>查看此版</Button></li>)}
      </ol>
      {preview && <div className="mt-4 rounded-lg bg-surface-subtle p-4 text-sm" data-testid="article-history-preview">
        <div className="flex items-center justify-between"><strong>历史版本预览</strong><Button variant="ghost" size="sm" onClick={() => setPreview(null)}>关闭</Button></div>
        <h3 className="mt-3 text-lg font-semibold">{preview.document.title || "未命名文章"}</h3>
        <SourceReferences refs={preview.document.titleSourceRefs} />
        <p className="mt-2 text-muted-foreground">{preview.document.summary}</p>
        {preview.document.coverImageUse && <ArticleCoverDisplay image={preview.document.coverImageUse} />}
        <SourceReferences refs={preview.document.summarySourceRefs} />
        {preview.document.sections.map((section) => <div key={section.sectionId} className="mt-4"><h4 className="font-medium">{section.heading}</h4><p className="mt-1 whitespace-pre-wrap">{section.body}</p><SourceReferences refs={section.sourceRefs} /></div>)}
        {!!preview.document.factItems.length && <div className="mt-4">待确认事实：{preview.document.factItems.map((item) => <div key={item.id}>{item.text}<SourceReferences refs={item.sourceRefs} /></div>)}</div>}
        {preview.document.imageUses.map((item) => <ArticleImagePreview key={`${item.sectionId}-${item.assetFileId}`} image={item} label={sectionLabel(preview.document, item.sectionId)} />)}
      </div>}
      </details>
    </>}
  </main>;
}

export function ArticleWorkbench(props:Parameters<typeof ArticleWorkbenchSession>[0]){const selection=useCreationScope();return <ArticleWorkbenchSession key={creationScopeKey(selection)+":"+(props.projectId+":"+(props.initialOutputId??""))} {...props}/>;}
