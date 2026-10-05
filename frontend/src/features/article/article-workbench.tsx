"use client";

import * as React from "react";
import Link from "next/link";
import Image from "next/image";

import { client } from "@/lib/contract-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { describeUserError } from "@/lib/ai-error-humanize";
import { copilotDeepLink } from "@/features/copilot/copilot-deeplink";
import { OutputConversionPanel } from "@/features/projects/output-conversion-panel";
import { ArticleResultActions } from "./article-result-actions";
import {NoteRelayEditor} from "@/features/reference-editors/noterelay/noterelay-editor";
import {LazyDisclosure} from "@/features/reference-editors/noterelay/lazy-disclosure";
import {fillScriptMetadata} from "@/features/projects/script-derived-metadata";
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
  scriptContext?: import("@creatoros/contract").ProjectScriptContext;
  outputId: string;
  artifactId: string;
  currentVersionId: string;
  current: ArticleDocument;
  versions: { id: string; versionNumber: number; createdAt: string; changeSummary: string }[];
};
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
  getTask(input: { params: { taskId: string }; query: undefined; body: undefined }): Promise<{ status: "queued" | "running" | "awaiting_confirmation" | "succeeded" | "failed" | "cancelled"; errorMessage: string | null }>;
  getArticleCandidate(input: { params: { candidateId: string }; query: undefined; body: undefined }): Promise<Candidate>;
  adoptArticleCandidate(input: { params: { candidateId: string }; query: undefined; body: { expectedCurrentVersionId: string; selectedSectionIds: string[]; selectedMetadataFields: ("title" | "summary" | "factItems")[]; clientRequestId: string } }): Promise<unknown>;
  createArticleVersion(input: { params: { outputId: string }; query: undefined; body: { expectedCurrentVersionId: string; document: ArticleDocument; clientRequestId: string } }): Promise<{ versionId: string; document: ArticleDocument }>;
};
const articleClient = client as unknown as ArticleClient;

function requestId(): string { return crypto.randomUUID(); }
function tokenFor(ref: { current: { id: string; payload: string } }, payload: unknown): string {
  const serialized = JSON.stringify(payload);
  if (ref.current.payload !== serialized) ref.current = { id: requestId(), payload: serialized };
  return ref.current.id;
}
function errorText(error: unknown): string {
  return describeUserError(error, "操作没有完成，请检查连接后重试。若持续失败，请查看诊断日志。");
}
function editSection(document: ArticleDocument, sectionId: string, field: "heading" | "body", value: string): ArticleDocument {
  return { ...document, sections: document.sections.map((section) => section.sectionId === sectionId ? { ...section, [field]: value } : section) };
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

export function ArticleWorkbench({ projectId, projectTitle, accountId, initialOutputs, initialOutputId, activeBrandProfile = null }: {
  projectId: string;
  projectTitle: string;
  accountId?: string | null;
  /** 旧调用方兼容；本地写作不再以完整 Brief 或平台目标为前置条件。 */
  briefReady?: boolean;
  articleTargetSelected?: boolean;
  initialOutputs: { id: string; title: string }[];
  initialOutputId?: string;
  activeBrandProfile?: { id: string; versionNumber: number; oneLiner: string } | null;
}) {
  const [outputs, setOutputs] = React.useState(initialOutputs);
  const [outputId, setOutputId] = React.useState(initialOutputId
    ? initialOutputs.some(output => output.id === initialOutputId) ? initialOutputId : ""
    : initialOutputs.length === 1 ? initialOutputs[0]!.id : "");
  const [pendingSwitch, setPendingSwitch] = React.useState<{outputId: string} | {create: true} | null>(null);
  const [state, setState] = React.useState<ArticleState | null>(null);
  const [draft, setDraft] = React.useState<ArticleDocument | null>(null);
  const [tagsInput, setTagsInput] = React.useState("");
  const [candidate, setCandidate] = React.useState<Candidate | null>(null);
  const [pendingTaskId, setPendingTaskId] = React.useState<string | null>(null);
  const [useBrandProfile, setUseBrandProfile] = React.useState(Boolean(activeBrandProfile));
  const [sourceAssets, setSourceAssets] = React.useState<SourceAsset[]>([]);
  const [selectedSourceIds, setSelectedSourceIds] = React.useState<string[]>([]);
  const [sourceRefresh, setSourceRefresh] = React.useState(0);
  const [sourceLoading, setSourceLoading] = React.useState(false);
  const [sourceError, setSourceError] = React.useState<string | null>(null);
  const [preview, setPreview] = React.useState<{ versionId: string; document: ArticleDocument } | null>(null);
  const [imageSectionId, setImageSectionId] = React.useState<string | null>(null);
  const [imageAssets, setImageAssets] = React.useState<ImageAsset[]>([]);
  const [imagePage, setImagePage] = React.useState(1);
  const [selectedImageId, setSelectedImageId] = React.useState("");
  const [imageLoading, setImageLoading] = React.useState(false);
  const [imageError, setImageError] = React.useState<string | null>(null);
  const [selectedSections, setSelectedSections] = React.useState<string[]>([]);
  const [selectedMetadata, setSelectedMetadata] = React.useState<("title" | "summary" | "factItems")[]>([]);
  const [busy, setBusy] = React.useState<"create" | "load" | "generate" | "adopt" | "save" | null>(null);
  const [message, setMessage] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const firstLoads = React.useRef(new Set<string>());
  const stateRef = React.useRef(state);
  const draftRef = React.useRef(draft);
  React.useLayoutEffect(() => { stateRef.current = state; draftRef.current = draft; }, [state,draft]);
  const loadSerial = React.useRef(0);
  React.useEffect(() => () => { loadSerial.current += 1; }, []);
  const createRequestId = React.useRef({ id: requestId(), payload: "" });
  const generateRequestId = React.useRef({ id: requestId(), payload: "" });
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

  const load = React.useCallback(async (id: string) => {
    const serial = ++loadSerial.current;
    setBusy("load"); setError(null);
    try {
      const loaded = await articleClient.getArticle({ params: { outputId: id }, query: undefined, body: undefined });
      if (serial !== loadSerial.current) return;
      const key = `${accountId ?? "anonymous"}:${id}`;
      const current = structuredClone(loaded.current);
      const initial = firstLoads.current.has(key) ? current : fillScriptMetadata(current, loaded.scriptContext);
      firstLoads.current.add(key);
      stateRef.current = loaded; draftRef.current = initial;
      setState(loaded); setDraft(initial); setTagsInput((initial.tags ?? []).join("、")); setCandidate(null);
      setSelectedSections([]); setSelectedMetadata([]); setPreview(null);
    } catch (err) { if (serial === loadSerial.current) { setError(errorText(err)); setState(null); setDraft(null); } }
    finally { if (serial === loadSerial.current) setBusy(null); }
  }, [accountId]);
  React.useEffect(() => { if (outputId) void load(outputId); }, [outputId, load]);
  React.useEffect(() => {
    let active = true;
    setSourceLoading(true); setSourceError(null);
    void (async () => {
      try {
        const links: Array<{entityType: string; entityId: string}> = [];
        let complete = false;
        for (let page = 1; page <= 20; page++) {
          const rows = await articleClient.listMaterialLinks({params: undefined,
            query: {projectId, page, pageSize: 100}, body: undefined});
          links.push(...rows);
          if (rows.length < 100) { complete = true; break; }
        }
        if (!complete) throw new Error("项目资料超过当前可列出的范围，请缩小项目资料后重试。");
        const ids = [...new Set(links.filter((link) => link.entityType === "asset").map((link) => link.entityId))];
        const assets = await Promise.allSettled(ids.map((assetId) => articleClient.getAsset({params: {assetId}, query: undefined, body: undefined})));
        if (!active) return;
        const available = assets.flatMap((result) => result.status === "fulfilled" && result.value.assetType === "document" &&
          result.value.status === "active" && result.value.extractStatus === "done" && result.value.extractedText?.trim()
          ? [result.value] : []);
        setSourceAssets(available);
        setSelectedSourceIds((selected) => selected.filter((id) => available.some((asset) => asset.id === id)));
      } catch (err) { if (active) { setSourceAssets([]); setSourceError(errorText(err)); } }
      finally { if (active) setSourceLoading(false); }
    })();
    return () => { active = false; };
  }, [projectId, sourceRefresh]);
  React.useEffect(() => {
    if (!outputId) return;
    setPendingTaskId(sessionStorage.getItem(`creatoros:article-task:${outputId}`));
  }, [outputId]);
  React.useEffect(() => {
    if (!imageSectionId) return;
    let active = true;
    setImageLoading(true); setImageError(null);
    void articleClient.listAssets({ params: undefined, query: { page: imagePage, pageSize: 50, status: "active" }, body: undefined })
      .then((rows) => { if (active) setImageAssets(rows); })
      .catch((err) => { if (active) { setImageAssets([]); setImageError(errorText(err)); } })
      .finally(() => { if (active) setImageLoading(false); });
    return () => { active = false; };
  }, [imageSectionId, imagePage]);
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
  async function generate() {
    if (!state || busy) return;
    if (dirty && !(await save())) return;
    const frozen = stateRef.current;
    if (!frozen) return;
    setBusy("generate"); setError(null); setMessage(null);
    try {
      const brandProfileVersionId = useBrandProfile ? activeBrandProfile?.id : undefined;
      const sourceAssetsForRequest = sourceAssets.filter((asset) => selectedSourceIds.includes(asset.id))
        .map((asset) => ({assetId: asset.id, assetFileId: asset.currentFileId}));
      const next = await articleClient.generateArticleCandidate({ params: { outputId: frozen.outputId }, query: undefined,
        body: { clientRequestId: tokenFor(generateRequestId, { outputId: frozen.outputId, versionId: frozen.currentVersionId,
          brandProfileVersionId, sourceAssets: sourceAssetsForRequest }),
          ...(brandProfileVersionId ? { brandProfileVersionId } : {}), sourceAssets: sourceAssetsForRequest } });
      generateRequestId.current = { id: requestId(), payload: "" };
      sessionStorage.setItem(`creatoros:article-task:${frozen.outputId}`, next.taskId);
      setPendingTaskId(next.taskId);
      setMessage("已开始生成候选。生成完成后会在这里供你审读。");
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
  async function save(documentOverride?: ArticleDocument) {
    const documentToSave = documentOverride ?? draft;
    if (!state || !documentToSave || busy) return false;
    const serial = loadSerial.current;
    const beforeSaveDigest = JSON.stringify(draftRef.current);
    setBusy("save"); setError(null); setMessage(null);
    try {
      const storageKey = `creatoros:article:request:${accountId ?? "anonymous"}:${state.outputId}`;
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
      if (exact.versionId !== result.versionId || JSON.stringify(exact.document) !== JSON.stringify(requestValue.body.document)) {
        throw new Error("保存回执与指定版本读回不一致，未清理恢复记录。");
      }
      const latest = await articleClient.getArticle({ params: { outputId: state.outputId }, query: undefined, body: undefined });
      if (serial !== loadSerial.current) return false;
      const editedDuringSave = JSON.stringify(draftRef.current) !== beforeSaveDigest;
      stateRef.current = latest;
      sessionStorage.removeItem(storageKey);
      saveRequestId.current = { id: requestValue.clientRequestId, payload: requestValue.payloadDigest };
      if (latest.currentVersionId !== result.versionId) {
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
      setTagsInput((latest.current.tags ?? []).join("、"));
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
  function moveSection(sectionId:string,direction:-1|1) {
    if(!draft)return;
    const ordered=[...draft.sections].sort((a,b)=>a.order-b.order),index=ordered.findIndex(section=>section.sectionId===sectionId),target=index+direction;
    if(index<0||target<0||target>=ordered.length)return;
    [ordered[index],ordered[target]]=[ordered[target]!,ordered[index]!];
    setDraft({...draft,sections:ordered.map((section,order)=>({...section,order}))});
  }
  function chooseImage() {
    if (!draft || !imageSectionId) return;
    const asset = imageAssets.find((item) => item.id === selectedImageId && item.assetType === "image" && item.status === "active" && item.currentFileId);
    if (!asset?.currentFileId) return;
    const chosen: ImageUse = { sectionId: imageSectionId, assetId: asset.id, assetFileId: asset.currentFileId,
      sourceKind: "existing", reviewState: "selected" };
    setDraft({ ...draft, imageUses: [...draft.imageUses.filter((item) => item.sectionId !== imageSectionId), chosen] });
    setImageSectionId(null); setSelectedImageId("");
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

  return <main data-page="article-workbench" className="mx-auto w-full max-w-[1600px] space-y-4 px-5 py-4 text-sm md:px-8">
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
    {error && <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
    {message && <p role="status" className="rounded-md bg-success-soft p-3 text-sm text-success">{message}</p>}
    {busy === "load" && <p className="text-sm text-muted-foreground">正在读取已保存的文章…</p>}
    {state && draft && <>
      <section className="rounded-xl border p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <h2 className="text-[13.5px] font-semibold">当前稿件</h2>
          <div className="flex flex-wrap gap-3"><Button className="min-h-11 px-5 text-sm" onClick={() => void generate()} disabled={Boolean(busy) || Boolean(pendingTaskId)}>{pendingTaskId || busy === "generate" ? "正在生成…" : "根据脚本扩写文章"}</Button>
            <Button className="min-h-11 px-5 text-sm" variant="outline" title={busy === "save" ? "正在保存…" : dirty ? "有未保存的修改" : "修改已保存"} onClick={() => void save()} disabled={Boolean(busy) || !dirty}>{busy === "save" ? "保存中…" : "保存修改"}</Button></div>
        </div>
        {state.scriptContext?.message && <p className="mt-3 text-sm text-muted-foreground">{state.scriptContext.message}</p>}
        {draft.imageMatchWarnings?.map((warning,index)=><p key={index} role="status" className="mt-3 text-sm text-muted-foreground">{warning}</p>)}
        <div className="mt-6 grid items-start gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(360px,1fr)]"><fieldset disabled={Boolean(busy)} aria-label="编辑文章" className="min-w-0 space-y-5">
          {draft.coverImageUse && <ArticleCoverDisplay image={draft.coverImageUse} />}
          <div><label className="block text-sm">标题<Input className="mt-1" value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} /></label>
            <SourceReferences refs={draft.titleSourceRefs} /></div>
          <div><label className="block text-sm">摘要<textarea className="mt-1 min-h-24 w-full rounded-md border bg-background p-3" value={draft.summary} onChange={(event) => setDraft({ ...draft, summary: event.target.value })} /></label>
            <SourceReferences refs={draft.summarySourceRefs} /></div>
          <label className="block text-sm">标签<Input className="mt-1" value={tagsInput} onChange={event=>{setTagsInput(event.target.value);setDraft({...draft,tags:event.target.value.split(/[、,，\n]+/).map(tag=>tag.trim()).filter(Boolean)});}} placeholder="多个标签用顿号分隔" /></label>
          <div className="space-y-8 border-t border-border pt-6">
          {[...draft.sections].sort((a,b)=>a.order-b.order).map((section,index) => <section key={section.sectionId} className="space-y-3" aria-label={`第 ${index+1} 段`}>
            <div className="flex items-start justify-between gap-3"><label className="min-w-0 flex-1 text-sm"><span className="sr-only">段落标题</span><Input className="h-10 text-[13px] font-semibold md:text-[13px]" value={section.heading} placeholder="段落标题" onChange={event=>setDraft(editSection(draft,section.sectionId,"heading",event.target.value))}/></label>
              <details className="relative shrink-0"><summary className="cursor-pointer rounded-md border border-border px-3 py-3 text-sm">段落操作</summary><div className="absolute right-0 z-20 mt-2 flex min-w-36 flex-col gap-1 rounded-lg border border-border bg-surface p-2 shadow-lg">
                <Button variant="ghost" disabled={index===0} onClick={()=>moveSection(section.sectionId,-1)}>上移</Button>
                <Button variant="ghost" disabled={index===draft.sections.length-1} onClick={()=>moveSection(section.sectionId,1)}>下移</Button>
                <Button variant="ghost" onClick={()=>{setImageSectionId(section.sectionId);setImagePage(1);setSelectedImageId("");}}>为此段选图</Button>
                <Button variant="ghost" onClick={()=>setDraft({...draft,sections:draft.sections.filter(item=>item.sectionId!==section.sectionId).sort((a,b)=>a.order-b.order).map((item,order)=>({...item,order})),imageUses:draft.imageUses.filter(item=>item.sectionId!==section.sectionId),visualBriefs:draft.visualBriefs.filter(item=>item.sectionId!==section.sectionId)})}>删除段落</Button>
              </div></details></div>
            <label className="block text-sm"><span className="sr-only">段落正文</span><textarea className="min-h-56 w-full resize-y rounded-lg border border-border bg-background p-4 text-sm leading-relaxed" value={section.body} placeholder="编辑这一段正文" onChange={event=>setDraft(editSection(draft,section.sectionId,"body",event.target.value))}/></label><SourceReferences refs={section.sourceRefs}/>
          </section>)}
          <Button variant="outline" onClick={()=>setDraft({...draft,sections:[...draft.sections,{sectionId:requestId(),order:draft.sections.length,heading:"",headingLevel:2,body:"",sourceRefs:[]}]})}>添加段落</Button>
          </div>
          {!draft.sections.length && <p className="text-sm text-muted-foreground">暂无正文。可以生成候选，审读后采纳。</p>}
          {!!draft.factItems.length && <div className="rounded-lg bg-amber-50 p-4"><h3 className="text-sm font-medium">待确认事实</h3><ul className="mt-2 list-inside list-disc text-sm">{draft.factItems.map((item) => <li key={item.id}>{item.text} · {item.reviewState === "confirmed" ? "已确认" : "待确认"}<SourceReferences refs={item.sourceRefs} /></li>)}</ul></div>}
          {!!draft.visualBriefs.length && <div className="text-sm"><h3 className="font-medium">配图建议</h3>{draft.visualBriefs.map((item) => {
            const currentSection = state.current.sections.find((section) => section.sectionId === item.sectionId);
            const draftSection = draft.sections.find((section) => section.sectionId === item.sectionId);
            const savedBrief = state.current.visualBriefs.find((brief) => brief.sectionId === item.sectionId);
            const saved = Boolean(currentSection && draftSection && currentSection.heading === draftSection.heading && currentSection.body === draftSection.body && savedBrief?.brief === item.brief);
            return <p key={item.sectionId} className="mt-2 text-muted-foreground">{item.brief}（{draft.imageUses.some(image=>image.sectionId===item.sectionId) ? "已有配图" : "尚未选用图片"}）
              {saved && currentSection ? <Link className="ml-2 underline" href={copilotDeepLink("project", "material.generate.image",
                {kind: "article_section", id: item.sectionId, title: currentSection.heading, projectId, outputId, versionId: state.currentVersionId},
                `为当前公众号文章的「${currentSection.heading}」段落生成待审看的图片：${item.brief}`, `project:${projectId}`)}>
                为此段生成图片候选
              </Link> : <span className="ml-2 text-xs">先保存此段正文与配图建议</span>}
            </p>;
          })}<p className="mt-2 text-xs text-muted-foreground">在 AI 助手中审看并采纳进素材库后，返回这里为段落选图。</p></div>}
          {!!draft.imageUses.length && <div className="text-sm"><h3 className="font-medium">已选用图片</h3>{draft.imageUses.map((item) => <ArticleImagePreview key={`${item.sectionId}-${item.assetFileId}`} image={item} label={sectionLabel(draft, item.sectionId)} />)}</div>}
          {imageSectionId && <div className="rounded-lg border border-blue-200 p-4 text-sm">
            <div className="flex items-center justify-between"><h3 className="font-medium">选择账号素材库中的图片</h3><Button variant="ghost" size="sm" onClick={() => setImageSectionId(null)}>关闭</Button></div>
            {imageLoading ? <p className="mt-3 text-muted-foreground">正在读取素材…</p> : null}
            {imageError ? <p role="alert" className="mt-3 text-red-700">{imageError}</p> : null}
            {!imageLoading && !imageError && <>
              <select aria-label="选择图片素材" className="mt-3 w-full rounded-md border bg-background p-2" value={selectedImageId} onChange={(event) => setSelectedImageId(event.target.value)}>
                <option value="">选择已入库图片</option>
                {imageAssets.filter((item) => item.assetType === "image" && item.status === "active" && item.currentFileId).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
              {!imageAssets.some((item) => item.assetType === "image" && item.status === "active" && item.currentFileId) &&
                <p className="mt-2 text-muted-foreground">当前账号还没有已确认的图片。可以先通过 AI 助手生成候选并采纳，或在素材中心上传。</p>}
              {selectedImageId && imageAssets.find((item) => item.id === selectedImageId)?.currentFileId && <ArticleImagePreview label={sectionLabel(draft, imageSectionId)} image={{ sectionId: imageSectionId, assetId: selectedImageId,
                assetFileId: imageAssets.find((item) => item.id === selectedImageId)!.currentFileId!, sourceKind: "existing", reviewState: "selected" }} />}
              <div className="mt-3 flex items-center gap-2"><Button variant="outline" size="sm" disabled={imagePage === 1} onClick={() => setImagePage((page) => page - 1)}>上一页</Button>
                <span>第 {imagePage} 页</span><Button variant="outline" size="sm" disabled={imageAssets.length < 50} onClick={() => setImagePage((page) => page + 1)}>下一页</Button>
                <Button size="sm" disabled={!selectedImageId} onClick={chooseImage}>确认选用此图</Button></div>
            </>}
          </div>}
        </fieldset>
        <div className="min-w-0 space-y-4">        {accountId && <NoteRelayEditor accountId={accountId} outputId={state.outputId} sourceVersionId={state.currentVersionId} platform="wechat" value={draft} disabled={Boolean(busy)} onLayoutChange={layout=>setDraft(current=>current?{...current,nativeLayout:layout}:current)}/>}
        <LazyDisclosure label="使用 Doocs 编辑器（保留原版式）">{()=>accountId && <DoocsArticleEditor key={`${accountId}:${state.outputId}:${state.currentVersionId}`} accountId={accountId}
          outputId={state.outputId} sourceVersionId={state.currentVersionId} value={draft} savedDocument={state.current} onChange={setDraft} onSave={save} />}</LazyDisclosure>
</div></div>
      </section>
      <LazyDisclosure label="AI 辅助生成与内容扩展">{()=> <>
      {!showArticleControls && articleControls}
    {state && <section className="rounded-xl border p-4 text-sm">
      <h2 className="font-medium">写作身份</h2>
      <p className="mt-1 text-muted-foreground">生成前选择本次使用的身份。手写内容不受此选项影响。</p>
      <label className="mt-3 flex items-start gap-2"><input type="radio" name="article-brand" checked={!useBrandProfile}
        onChange={() => setUseBrandProfile(false)} /><span>中性写作方法</span></label>
      {activeBrandProfile ? <label className="mt-2 flex items-start gap-2"><input type="radio" name="article-brand"
        checked={useBrandProfile} onChange={() => setUseBrandProfile(true)} />
        <span>使用当前账号品牌版本 v{activeBrandProfile.versionNumber}<br />
          <span className="text-muted-foreground">{activeBrandProfile.oneLiner}</span></span></label>
        : <p className="mt-2 text-muted-foreground">当前账号尚无可用品牌版本，将使用中性写作方法。</p>}
    </section>}
    {state && <section className="rounded-xl border p-4 text-sm">
      <div className="flex items-center justify-between gap-3"><h2 className="font-medium">本次生成的参考资料</h2>
        <Button size="sm" variant="outline" onClick={() => setSourceRefresh((value) => value + 1)}>刷新项目资料</Button></div>
      <p className="mt-1 text-muted-foreground">项目资料会自动作为来源。勾选的项目文档按当前文件版本提供给模型；不勾选也能生成候选。</p>
      {sourceLoading && <p className="mt-2 text-muted-foreground">正在读取项目资料…</p>}
      {sourceError && <p role="alert" className="mt-2 text-red-700">{sourceError}</p>}
      {!sourceLoading && !sourceError && !sourceAssets.length && <p className="mt-2 text-muted-foreground">
        当前项目没有已关联且完成文字抽取的文档。<Link className="underline" href="/assets">去素材中心添加资料</Link>
      </p>}
      {sourceAssets.map((asset) => <label key={asset.id} className="mt-2 flex items-start gap-2 rounded-md border p-2">
        <input type="checkbox" checked={selectedSourceIds.includes(asset.id)} onChange={(event) => setSelectedSourceIds(
          event.target.checked ? [...selectedSourceIds, asset.id] : selectedSourceIds.filter((id) => id !== asset.id))} />
        <span><strong>{asset.name}</strong><br /><span className="text-xs text-muted-foreground">已保存的文档资料</span></span>
      </label>)}
    </section>}



      {accountId && <OutputConversionPanel key={`${accountId}:${state.outputId}`} accountId={accountId} projectId={projectId} outputId={state.outputId}
        sourceType="article" versionId={state.currentVersionId} dirty={dirty} fields={{title: state.current.title, summary: state.current.summary}}
        sections={state.current.sections} images={[...state.current.imageUses, ...(state.current.coverImageUse ? [state.current.coverImageUse] : [])]} />}
      {accountId && <ArticleResultActions key={state.outputId} accountId={accountId} outputId={state.outputId}
        currentVersionId={state.currentVersionId} dirty={JSON.stringify(draft) !== JSON.stringify(state.current)}
        bodyReplaceBlocked={draft.imageUses.length > 0 || draft.visualBriefs.length > 0}
        sections={draft.sections.map((section) => ({ sectionId: section.sectionId, heading: section.heading }))}
        onAdopt={() => load(state.outputId)} />}
      </>}</LazyDisclosure>
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
        {dirty && <p className="mt-3 text-sm text-muted-foreground">请先保存当前修改，再审读采用候选。</p>}
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
