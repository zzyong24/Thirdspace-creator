"use client";

import * as React from "react";
import Image from "next/image";
import {graphicPostCardBriefs,type GraphicPostCardBrief,type CreativeBundle, CreativeCapability, CreativeKind, CreativeResult } from "@creatoros/contract";

import { Button } from "@/components/ui/button";
import { client } from "@/lib/contract-client";
import { describeUserError } from "@/lib/ai-error-humanize";

const TEXT_KINDS = ["title", "body", "summary", "tags", "cardBriefs"] as const;
type TextKind = (typeof TEXT_KINDS)[number];
type MediaValue = { assetId: string; assetFileId: string; order: number; role: "cover" | "card"; cardId?:string };
const LABEL: Record<TextKind, string> = { title: "标题", body: "正文", summary: "简介", tags: "标签",cardBriefs:"图卡文字" };
const STATUS: Record<CreativeResult["status"], string> = {
  queued: "排队中", running: "生成中", awaiting_confirmation: "待确认", succeeded: "待采纳",
  failed: "生成失败", cancelled: "已取消", adopted: "已采纳",
};

function resultErrorText(error: unknown, fallback: string): string {
  // SEMANTIC_BOUNDARY_ALLOW: Translate structured protocol codes only; do not infer failure causes from wording.
  const details = error && typeof error === "object" ? error as { code?: unknown; status?: unknown } : null;
  if (details?.code === "SOURCE_UNAVAILABLE") {
    return "生成时的来源或规则已变化或暂不可用。输入和已生成候选仍保留，请重新生成这一项。";
  }
  if (details?.code === "VERSION_CONFLICT" || details?.code === "ConflictError" || details?.status === 409) {
    return "稿件或发布内容已更新。已生成候选和编辑内容仍保留，请刷新后重新审阅；正文已改变时请重新生成相应候选。";
  }
  return describeUserError(error, fallback);
}

function errorText(error: unknown): string {
  return resultErrorText(error, "操作未完成，输入和已生成内容仍保留。请重试。");
}

function candidateText(result: CreativeResult): string {
  if (typeof result.value === "string") return result.value;
  if (Array.isArray(result.value)) return result.value.filter((item): item is string => typeof item === "string").join("、");
  return "";
}

function mediaValue(value: unknown, role: MediaValue["role"], cardId?:string): MediaValue[] | null {
  if (!Array.isArray(value) || value.length !== 1) return null;
  const item = value[0];
  if (!item || typeof item !== "object" || typeof item.assetId !== "string" || typeof item.assetFileId !== "string" ||
      item.role !== role || item.order !== 0) return null;
  if(cardId && item.cardId!==cardId)return null;
  return [{ assetId: item.assetId, assetFileId: item.assetFileId, order: 0, role, ...(typeof item.cardId==="string"?{cardId:item.cardId}:{}) }];
}

type MediaPreviewProps={ image: MediaValue; resultId: string; onPreviewReady: (resultId: string) => void };
function MediaPreview(props:MediaPreviewProps){return <MediaPreviewSession key={`${props.resultId}:${props.image.assetId}:${props.image.assetFileId}`} {...props}/>;}
function MediaPreviewSession({ image, resultId, onPreviewReady }:MediaPreviewProps) {
  const [url, setUrl] = React.useState<string | null>(null);
  const [error, setError] = React.useState(false);
  React.useEffect(() => {
    let active = true;
    void client.getAssetFileDownloadUrl({ params: { assetId: image.assetId, assetFileId: image.assetFileId }, query: undefined, body: undefined })
      .then((result) => { if (active) { setUrl(result.url); onPreviewReady(resultId); } })
      .catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, [image.assetId, image.assetFileId, onPreviewReady, resultId]);
  return url ? <Image src={url} alt={image.role === "cover" ? "待审阅的生成封面" : "待审阅的生成图卡"} width={480} height={320} unoptimized className="max-h-72 w-full rounded-md bg-surface-subtle object-contain" />
    : <p className="text-xs text-muted-foreground">{error ? "图片暂时无法预览，请刷新候选后再采纳。" : "正在读取图片预览…"}</p>;
}

function capabilityExplanation(capability: CreativeCapability | undefined): string {
  if (!capability || capability.state === "unknown") return "尚未核验当前模型能否生成";
  if (capability.state === "supported") return "当前可生成";
  if (capability.reasonCode === "ADAPTER_NOT_READY") return "生成能力尚未接通";
  if (capability.reasonCode === "MODEL_NOT_CONFIGURED") return "当前模型凭据不可用，请检查模型设置";
  if (capability.reasonCode === "MODEL_UNAVAILABLE") return "当前模型暂不可用";
  return "暂不可用，可稍后刷新能力状态";
}

function resultError(code: string | null): string | null {
  if (!code) return null;
  if (code === "SOURCE_UNAVAILABLE") return "来源暂不可读取";
  if (code === "CAPABILITY_UNAVAILABLE") return "当前生成能力不可用";
  if (code === "CANDIDATE_NOT_READY") return "候选尚未准备好";
  return "本项未完成，可以单独重试";
}

function pickCapability(items: readonly CreativeCapability[], kind: CreativeKind, platform: string | null): CreativeCapability | undefined {
  return items.find((item) => item.outputType === "image" && item.kind === kind && item.platform === platform)
    ?? items.find((item) => item.outputType === "image" && item.kind === kind && item.platform === null);
}

type GraphicPostResultsProps={
  accountId:string;outputId:string;targetPlatform:string|null;currentVersionId:string;manualDraftDirty:boolean;
  prepareGeneration:()=>Promise<boolean>;onAdopt:()=>Promise<void>;
  onResultListResolved?:(bodyResult:CreativeResult|null)=>void;
  series?:{cards:GraphicPostCardBrief[];selectedCardId:string|null;selectedCardIds:string[]};
};
type SeriesRequest={items:{kind:'image_card';targetSectionId:string}[];clientRequestId:string};
type PageAdoptionAttempt={accountId:string;outputId:string;resultId:string;digest:string;editedValue:MediaValue[];expectedVersionId:string;clientRequestId:string};
function pageAdoptionStorageKey(accountId:string,outputId:string,resultId:string){return `creatoros:graphic-page-adoption:${JSON.stringify([accountId,outputId,resultId])}`;}
function readPageAdoption(accountId:string,outputId:string,result:CreativeResult):PageAdoptionAttempt|null{
  try{
    const cached:unknown=JSON.parse(window.sessionStorage.getItem(pageAdoptionStorageKey(accountId,outputId,result.resultId))??'null');
    if(!cached||typeof cached!=='object')return null;
    const item=cached as Partial<PageAdoptionAttempt>;
    // SEMANTIC_BOUNDARY_ALLOW: Validate the exact saved request and ownership IDs, not page meaning.
    if(item.accountId!==accountId||item.outputId!==outputId||item.resultId!==result.resultId||typeof item.expectedVersionId!=='string'||!item.expectedVersionId||typeof item.clientRequestId!=='string'||item.clientRequestId.length<8||item.clientRequestId.length>128||typeof item.digest!=='string')return null;
    const selected=mediaValue(item.editedValue,'card',result.targetSectionId??undefined);
    if(!selected||JSON.stringify(item.editedValue)!==JSON.stringify(selected)||item.digest!==JSON.stringify({resultId:result.resultId,selected}))return null;
    return {...item,editedValue:selected} as PageAdoptionAttempt;
  }catch{return null;}
}
function writePageAdoption(attempt:PageAdoptionAttempt){
  try{window.sessionStorage.setItem(pageAdoptionStorageKey(attempt.accountId,attempt.outputId,attempt.resultId),JSON.stringify(attempt));}catch{/* Original in-memory request remains available when session storage is unavailable. */}
}
function clearPageAdoption(accountId:string,outputId:string,resultId:string){
  try{window.sessionStorage.removeItem(pageAdoptionStorageKey(accountId,outputId,resultId));}catch{/* In-memory acknowledgement still prevents a second attempt in this session. */}
}
function readSeriesRequests(key:string):SeriesRequest[]{
  try{
    const cached:unknown=JSON.parse(window.sessionStorage.getItem(key)??'null');
    // SEMANTIC_BOUNDARY_ALLOW: Validate saved protocol IDs only, never page meaning.
    if(Array.isArray(cached)&&cached.length&&cached.every(group=>group&&typeof group==='object'&&typeof group.clientRequestId==='string'&&group.clientRequestId.length>=8&&group.clientRequestId.length<=128&&Array.isArray(group.items)&&group.items.length>=1&&group.items.length<=12&&group.items.every((item:unknown)=>item&&typeof item==='object'&&'kind' in item&&item.kind==='image_card'&&'targetSectionId' in item&&typeof item.targetSectionId==='string')))return cached.map(group=>({clientRequestId:group.clientRequestId,items:group.items.map((item:{targetSectionId:string})=>({kind:'image_card',targetSectionId:item.targetSectionId}))}));
  }catch{/* Unavailable storage does not block creation. */}return [];
}
export function GraphicPostResults(props:GraphicPostResultsProps){return <GraphicPostResultsSession key={`${props.accountId}:${props.outputId}`} {...props}/>;}
function GraphicPostResultsSession({accountId,outputId,targetPlatform,currentVersionId,manualDraftDirty,prepareGeneration,onAdopt,onResultListResolved,series}:GraphicPostResultsProps){
  const [capabilities, setCapabilities] = React.useState<CreativeCapability[] | null>(null);
  const [results, setResults] = React.useState<Partial<Record<TextKind, CreativeResult>>>({});
  const [coverResult, setCoverResult] = React.useState<CreativeResult | null>(null);
  const [pageResults,setPageResults]=React.useState<Record<string,CreativeResult>>({});
  const [seriesBundles,setSeriesBundles]=React.useState<CreativeBundle[]>([]);
  const [seriesBusy,setSeriesBusy]=React.useState(false);
  const [previewedPages,setPreviewedPages]=React.useState<Record<string,boolean>>({});
  const scope=React.useRef({accountId,outputId,epoch:0});
  const dirtyRef=React.useRef(manualDraftDirty);
  React.useLayoutEffect(()=>{dirtyRef.current=manualDraftDirty;},[manualDraftDirty]);
  const seriesStorageKey=`creatoros:graphic-series-request:${accountId}:${outputId}`;
  const [initialSeriesQueue]=React.useState(()=>readSeriesRequests(seriesStorageKey));
  const seriesQueue=React.useRef<SeriesRequest[]>(initialSeriesQueue);
  const [unknownSeries,setUnknownSeries]=React.useState(initialSeriesQueue.length>0);
  function persistSeriesQueue(){try{if(seriesQueue.current.length)window.sessionStorage.setItem(seriesStorageKey,JSON.stringify(seriesQueue.current));else window.sessionStorage.removeItem(seriesStorageKey);}catch{/* Storage can be disabled; in-memory original requests still remain. */}}
  const pageAdoptions=React.useRef<Record<string,PageAdoptionAttempt>>({});
  const [cardResult, setCardResult] = React.useState<CreativeResult | null>(null);
  const [edits, setEdits] = React.useState<Partial<Record<TextKind, { resultId: string; text: string }>>>({});
  const [cardTextEdits,setCardTextEdits]=React.useState<{resultId:string;cards:GraphicPostCardBrief[]}|null>(null);
  const [bundle, setBundle] = React.useState<CreativeBundle | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [busyKind, setBusyKind] = React.useState<TextKind | null>(null);
  const [busyBundle, setBusyBundle] = React.useState(false);
  const [retrying, setRetrying] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [message, setMessage] = React.useState<string | null>(null);
  const pollInFlight = React.useRef(false);
  const loadRequest = React.useRef(0);
  const generationRequests = React.useRef<Partial<Record<TextKind, string>>>({});
  const adoptRequests = React.useRef<Partial<Record<TextKind, { resultId: string; digest: string; id: string }>>>({});
  const retryRequests = React.useRef<Record<string, string>>({});
  const bundleRequest = React.useRef<string | null>(null);
  const coverRequest = React.useRef<string | null>(null);
  const coverAdoption = React.useRef<{ digest: string; id: string } | null>(null);
  const [coverBusy, setCoverBusy] = React.useState<"generate" | "adopt" | null>(null);
  const [previewedCoverId, setPreviewedCoverId] = React.useState<string | null>(null);
  const cardRequest = React.useRef<string | null>(null);
  const cardAdoption = React.useRef<{ digest: string; id: string } | null>(null);
  const [cardBusy, setCardBusy] = React.useState<"generate" | "adopt" | null>(null);
  const [previewedCardId, setPreviewedCardId] = React.useState<string | null>(null);

  const rememberResult = React.useCallback((result: CreativeResult) => {
    if (result.kind === "cover") {
      setCoverResult((current) => current && current.resultId !== result.resultId && current.createdAt > result.createdAt ? current : result);
      return;
    }
    if (result.kind === "image_card" && result.targetSectionId) {
      setPageResults(current=>({...current,[result.resultId]:result}));
      return;
    }
    if (result.kind === "image_card") {
      setCardResult((current) => current && current.resultId !== result.resultId && current.createdAt > result.createdAt ? current : result);
      return;
    }
    if (!TEXT_KINDS.includes(result.kind as TextKind)) return;
    const kind = result.kind as TextKind;
    setResults((current) => {
      const previous = current[kind];
      if (previous && previous.resultId !== result.resultId && previous.createdAt > result.createdAt) return current;
      return { ...current, [kind]: result };
    });
    // Local edits contain user changes only; queued results have no editable value yet.
  }, []);

  const load = React.useCallback(async () => {
    const request = ++loadRequest.current;
    const settled = await Promise.allSettled([
      client.listCreativeCapabilities({ params: undefined, query: { accountId, outputId }, body: undefined }),
      client.listResults({ params: { outputId }, query: { pageSize: 50 }, body: undefined }),
      client.listBundles({ params: { outputId }, query: { pageSize: 20 }, body: undefined }),
    ]);
    if (request !== loadRequest.current) return;
    if (settled[0].status === "fulfilled") setCapabilities(settled[0].value.items);
    else setError("创作能力暂未读取到，生成入口已暂停；手工编辑仍可继续。");
    if (settled[1].status === "fulfilled") {
      const latestBody = [...settled[1].value.items]
        .filter((result) => result.kind === "body")
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0] ?? null;
      onResultListResolved?.(latestBody);
      const seen = new Set<TextKind>();
      for (const result of [...settled[1].value.items].sort((left, right) => right.createdAt.localeCompare(left.createdAt))) {
        if (result.kind === "cover") { rememberResult(result); continue; }
        if (result.kind === "image_card") { rememberResult(result); continue; }
        if (!TEXT_KINDS.includes(result.kind as TextKind)) continue;
        const kind = result.kind as TextKind;
        if (seen.has(kind)) continue;
        seen.add(kind);
        rememberResult(result);
      }
    }
    if (settled[2].status === "fulfilled") {
      setSeriesBundles(settled[2].value.items.filter(item=>item.items.some(part=>part.kind==="image_card"&&part.targetSectionId)));
      const latestBundle = settled[2].value.items.find(item=>!item.items.some(part=>part.kind==="image_card"&&part.targetSectionId)) ?? null;
      setBundle(latestBundle);
      const readableItems=[...(latestBundle?.items??[]),...settled[2].value.items.filter(group=>group.items.some(item=>item.targetSectionId)).flatMap(group=>group.items)];
      if (readableItems.length) {
        const reads = await Promise.allSettled(readableItems.map((item) => client.getResult({ params: { resultId: item.resultId }, query: undefined, body: undefined })));
        if (request !== loadRequest.current) return;
        for (const read of reads) if (read.status === "fulfilled") rememberResult(read.value);
      }
    }
    if (settled.every((item) => item.status === "rejected")) setError("创作能力和历史结果暂未读取到，请刷新重试。");
    setLoading(false);
  }, [accountId, outputId, rememberResult, onResultListResolved]);

  React.useEffect(() => {
    scope.current={accountId,outputId,epoch:scope.current.epoch+1};
    let active = true;
    void Promise.resolve().then(() => { if (active) void load(); });
    return () => { active = false; loadRequest.current += 1; scope.current.epoch+=1; };
  }, [load,accountId,outputId]);

  // Every poll has at most one in-flight request; refresh reconstructs from server lists.
  React.useEffect(() => {
    const pending = Object.values(results).some((result) => result && ["queued", "running", "awaiting_confirmation"].includes(result.status))
      || Boolean(coverResult && ["queued", "running"].includes(coverResult.status))
      || Boolean(cardResult && ["queued", "running"].includes(cardResult.status))
      || Object.values(pageResults).some(result=>["queued","running"].includes(result.status));
    const bundlePending = bundle?.items.some((item) => ["queued", "running"].includes(item.status))
      || seriesBundles.some(group=>group.items.some(item=>["queued","running"].includes(item.status)));
    if (!pending && !bundlePending) return;
    let active = true;
    const timer = window.setInterval(() => {
      if (pollInFlight.current || !active) return;
      pollInFlight.current = true;
      void (async () => {
        try {
          const resultIds = new Set<string>();
          for (const result of Object.values(results)) if (result && ["queued", "running", "awaiting_confirmation"].includes(result.status)) resultIds.add(result.resultId);
          if (coverResult && ["queued", "running"].includes(coverResult.status)) resultIds.add(coverResult.resultId);
          if (cardResult && ["queued", "running"].includes(cardResult.status)) resultIds.add(cardResult.resultId);
          for(const result of Object.values(pageResults))if(["queued","running"].includes(result.status))resultIds.add(result.resultId);
          for(const group of seriesBundles)for(const item of group.items)if(["queued","running"].includes(item.status))resultIds.add(item.resultId);
          for (const item of bundle?.items ?? []) if (["queued", "running", "awaiting_confirmation"].includes(item.status)) resultIds.add(item.resultId);
          const reads = await Promise.allSettled([...resultIds].map((resultId) => client.getResult({ params: { resultId }, query: undefined, body: undefined })));
          if (active) for (const read of reads) if (read.status === "fulfilled") rememberResult(read.value);
          if(active && seriesBundles.length){
            const groups=await Promise.allSettled(seriesBundles.filter(group=>group.items.some(item=>["queued","running"].includes(item.status))).map(group=>client.getBundle({params:{bundleId:group.bundleId},query:undefined,body:undefined})));
            if(active)setSeriesBundles(current=>current.map(group=>{const read=groups.find(value=>value.status==="fulfilled"&&value.value.bundleId===group.bundleId);return read?.status==="fulfilled"?read.value:group;}));
          }
          if (bundle && active) {
            const latest = await client.getBundle({ params: { bundleId: bundle.bundleId }, query: undefined, body: undefined });
            if (active) setBundle(latest);
          }
        } catch (reason) {
          if (active) setError(errorText(reason));
        } finally {
          pollInFlight.current = false;
        }
      })();
    }, 1800);
    return () => { active = false; window.clearInterval(timer); };
  }, [bundle, cardResult, coverResult, rememberResult, results,pageResults,seriesBundles]);

  async function generateCover() {
    const epoch=scope.current.epoch;
    if (coverBusy || cardBusy || busyKind || busyBundle || (coverResult && ["queued", "running"].includes(coverResult.status))) return;
    setCoverBusy("generate"); setError(null); setMessage(null);
    try {
      if (!(await prepareGeneration()) || epoch!==scope.current.epoch) return;
      const clientRequestId = coverRequest.current ?? crypto.randomUUID();
      coverRequest.current = clientRequestId;
      const result = await client.generateResult({ params: { outputId }, query: undefined,
        body: { kind: "cover", clientRequestId } });
      if(epoch!==scope.current.epoch)return;
      coverRequest.current = null;
      rememberResult(result);
      setMessage("封面已提交生成。图片出现后请预览，再决定是否采纳。");
    } catch (reason) { if(epoch===scope.current.epoch)setError(errorText(reason)); }
    finally { if(epoch===scope.current.epoch)setCoverBusy(null); }
  }

  async function adoptCover() {
    const epoch=scope.current.epoch;
    const result = coverResult;
    const selected = mediaValue(result?.value, "cover");
    if (!result || result.status !== "awaiting_confirmation" || !selected || manualDraftDirty || coverBusy || cardBusy || previewedCoverId !== result.resultId) return;
    const digest = JSON.stringify({ resultId: result.resultId, versionId: currentVersionId, selected });
    const request = coverAdoption.current?.digest === digest ? coverAdoption.current : { digest, id: crypto.randomUUID() };
    coverAdoption.current = request;
    setCoverBusy("adopt"); setError(null); setMessage(null);
    try {
      await client.adoptResult({ params: { resultId: result.resultId }, query: undefined,
        body: { expected: { owner: "graphic_post", versionId: currentVersionId }, editedValue: selected, clientRequestId: request.id } });
      if(epoch!==scope.current.epoch)return;
      coverAdoption.current = null;
      const latest=await client.getResult({ params: { resultId: result.resultId }, query: undefined, body: undefined });
      if(epoch!==scope.current.epoch)return;rememberResult(latest);
      await onAdopt();
      if(epoch!==scope.current.epoch)return;
      setMessage("封面已采纳并保存到图文作品。");
    } catch (reason) { if(epoch===scope.current.epoch)setError(errorText(reason)); }
    finally { if(epoch===scope.current.epoch)setCoverBusy(null); }
  }

  async function generateCard() {
    const epoch=scope.current.epoch;
    if (cardBusy || coverBusy || busyKind || busyBundle || (cardResult && ["queued", "running"].includes(cardResult.status))) return;
    setCardBusy("generate"); setError(null); setMessage(null);
    try {
      if (!(await prepareGeneration()) || epoch!==scope.current.epoch) return;
      const clientRequestId = cardRequest.current ?? crypto.randomUUID();
      cardRequest.current = clientRequestId;
      const result = await client.generateResult({ params: { outputId }, query: undefined,
        body: { kind: "image_card", clientRequestId } });
      if(epoch!==scope.current.epoch)return;
      cardRequest.current = null;
      rememberResult(result);
      setMessage("图卡已提交生成。请预览候选图，再决定是否采纳到作品。");
    } catch (reason) { if(epoch===scope.current.epoch)setError(errorText(reason)); }
    finally { if(epoch===scope.current.epoch)setCardBusy(null); }
  }

  async function adoptCard() {
    const epoch=scope.current.epoch;
    const result = cardResult;
    const selected = mediaValue(result?.value, "card");
    if (!result || result.status !== "awaiting_confirmation" || !selected || manualDraftDirty || cardBusy || coverBusy || previewedCardId !== result.resultId) return;
    const digest = JSON.stringify({ resultId: result.resultId, versionId: currentVersionId, selected });
    const request = cardAdoption.current?.digest === digest ? cardAdoption.current : { digest, id: crypto.randomUUID() };
    cardAdoption.current = request;
    setCardBusy("adopt"); setError(null); setMessage(null);
    try {
      await client.adoptResult({ params: { resultId: result.resultId }, query: undefined,
        body: { expected: { owner: "graphic_post", versionId: currentVersionId }, editedValue: selected, clientRequestId: request.id } });
      if(epoch!==scope.current.epoch)return;
      cardAdoption.current = null;
      const latest=await client.getResult({ params: { resultId: result.resultId }, query: undefined, body: undefined });
      if(epoch!==scope.current.epoch)return;rememberResult(latest);
      await onAdopt();
      if(epoch!==scope.current.epoch)return;
      setMessage("图卡已采纳并追加到图文作品，可继续生成下一张。");
    } catch (reason) { if(epoch===scope.current.epoch)setError(errorText(reason)); }
    finally { if(epoch===scope.current.epoch)setCardBusy(null); }
  }

  async function generate(kind: TextKind) {
    const epoch=scope.current.epoch;
    if (busyKind || busyBundle || (results[kind] && ["queued", "running", "awaiting_confirmation"].includes(results[kind]!.status))) return;
    setBusyKind(kind); setError(null); setMessage(null);
    try {
      if (!(await prepareGeneration()) || epoch!==scope.current.epoch) return;
      const clientRequestId = generationRequests.current[kind] ?? crypto.randomUUID();
      generationRequests.current[kind] = clientRequestId;
      const next = await client.generateResult({ params: { outputId }, query: undefined,
        body: { kind, clientRequestId } });
      if(epoch!==scope.current.epoch)return;
      delete generationRequests.current[kind];
      rememberResult(next);
      setMessage(`${LABEL[kind]}已提交生成，完成后可在下方审阅。`);
    } catch (reason) { if(epoch===scope.current.epoch)setError(errorText(reason)); }
    finally { if(epoch===scope.current.epoch)setBusyKind(null); }
  }

  async function adopt(kind: TextKind) {
    const epoch=scope.current.epoch;
    const result = results[kind];
    if (!result || result.status !== "succeeded" || manualDraftDirty || busyKind) return;
    setBusyKind(kind); setError(null); setMessage(null);
    try {
      const text = edits[kind]?.resultId === result.resultId ? edits[kind]!.text : candidateText(result);
      const cardValue=kind==="cardBriefs"?graphicPostCardBriefs.parse(cardTextEdits?.resultId===result.resultId?cardTextEdits.cards:result.value):null;
      const editedValue = cardValue??(kind === "tags" ? text.split(/[、,，\n]+/).map((tag) => tag.trim()).filter(Boolean) : text);
      const digest = JSON.stringify({ resultId: result.resultId, currentVersionId, editedValue });
      const request = adoptRequests.current[kind]?.digest === digest
        ? adoptRequests.current[kind]!
        : { resultId: result.resultId, digest, id: crypto.randomUUID() };
      adoptRequests.current[kind] = request;
      await client.adoptResult({ params: { resultId: result.resultId }, query: undefined,
        body: { expected: { owner: "graphic_post", versionId: currentVersionId }, editedValue, clientRequestId: request.id } });
      if(epoch!==scope.current.epoch)return;
      delete adoptRequests.current[kind];
      const latest = await client.getResult({ params: { resultId: result.resultId }, query: undefined, body: undefined });
      if(epoch!==scope.current.epoch)return;rememberResult(latest);
      await onAdopt();
      if(epoch!==scope.current.epoch)return;
      setMessage(`${LABEL[kind]}已采纳到作品。`);
    } catch (reason) { if(epoch===scope.current.epoch)setError(errorText(reason)); }
    finally { if(epoch===scope.current.epoch)setBusyKind(null); }
  }

  async function createAll() {
    const epoch=scope.current.epoch;
    const supported = TEXT_KINDS.filter((kind) => pickCapability(capabilities ?? [], kind, targetPlatform)?.state === "supported");
    if (!supported.length || busyBundle || busyKind || bundle?.items.some((item) => ["queued", "running"].includes(item.status))) return;
    setBusyBundle(true); setError(null); setMessage(null);
    try {
      if (!(await prepareGeneration()) || epoch!==scope.current.epoch) return;
      const clientRequestId = bundleRequest.current ?? crypto.randomUUID();
      bundleRequest.current = clientRequestId;
      const next = await client.createBundle({ params: { outputId }, query: undefined,
        body: { items: supported.map((kind) => ({ kind })), clientRequestId } });
      if(epoch!==scope.current.epoch)return;
      bundleRequest.current = null;
      setBundle(next);
      const reads = await Promise.allSettled(next.items.map((item) => client.getResult({ params: { resultId: item.resultId }, query: undefined, body: undefined })));
      if(epoch!==scope.current.epoch)return;
      for (const read of reads) if (read.status === "fulfilled") rememberResult(read.value);
      setMessage("已开始备齐可用内容，各项完成后可分别审阅和采用。");
    } catch (reason) { if(epoch===scope.current.epoch)setError(errorText(reason)); }
    finally { if(epoch===scope.current.epoch)setBusyBundle(false); }
  }

  async function retry(resultId: string, originalRequestId?:string) {
    if (retrying) return;
    const epoch=scope.current.epoch;
    setRetrying(resultId);setError(null);
    try {
      const clientRequestId = originalRequestId ?? retryRequests.current[resultId] ?? crypto.randomUUID();
      retryRequests.current[resultId] = clientRequestId;
      const next = await client.retryResult({ params: { resultId }, query: undefined, body: { clientRequestId } });
      if(epoch!==scope.current.epoch)return;
      delete retryRequests.current[resultId];rememberResult(next);
      const groups=seriesBundles.filter(group=>group.items.some(item=>item.resultId===resultId));
      const reads=await Promise.allSettled(groups.map(group=>client.getBundle({params:{bundleId:group.bundleId},query:undefined,body:undefined})));
      if(epoch!==scope.current.epoch)return;
      setSeriesBundles(current=>current.map(group=>{const read=reads.find(value=>value.status==='fulfilled'&&value.value.bundleId===group.bundleId);return read?.status==='fulfilled'?read.value:group;}));
      if (bundle) {
        const latest = await client.getBundle({ params: { bundleId: bundle.bundleId }, query: undefined, body: undefined });
        if(epoch===scope.current.epoch)setBundle(latest);
      }
    } catch (reason) {if(epoch===scope.current.epoch)setError(errorText(reason));}
    finally {if(epoch===scope.current.epoch)setRetrying(null);}
  }

  async function generatePages(recover=false) {
    if(seriesBusy || !series)return;
    const epoch=scope.current.epoch;
    setSeriesBusy(true);setError(null);setMessage(null);
    try {
      if(!recover && !(await prepareGeneration()))return;
      if(epoch!==scope.current.epoch)return;
      const selected=series.cards.filter(card=>series.selectedCardIds.includes(card.cardId));
      if(!seriesQueue.current.length){
        for(let offset=0;offset<selected.length;offset+=12)seriesQueue.current.push({items:selected.slice(offset,offset+12).map(card=>({kind:'image_card',targetSectionId:card.cardId})),clientRequestId:crypto.randomUUID()});
      }
      // All chunks retain their original target IDs and idempotency keys across an unknown outcome.
      while(seriesQueue.current.length){
        persistSeriesQueue();
        const request=seriesQueue.current[0]!;
        const next=await client.createBundle({params:{outputId},query:undefined,body:request});
        if(epoch!==scope.current.epoch)return;
        seriesQueue.current.shift();persistSeriesQueue();setUnknownSeries(false);
        setSeriesBundles(current=>[next,...current.filter(group=>group.bundleId!==next.bundleId)]);
        const reads=await Promise.allSettled(next.items.map(item=>client.getResult({params:{resultId:item.resultId},query:undefined,body:undefined})));
        if(epoch!==scope.current.epoch)return;
        for(const read of reads)if(read.status==='fulfilled')rememberResult(read.value);
      }
      setMessage('所选页已提交。每页完成后分别预览和采用，其他页仍可编辑。');
    } catch(reason){if(epoch===scope.current.epoch){setUnknownSeries(Boolean(seriesQueue.current.length));setError(errorText(reason));}}
    finally {if(epoch===scope.current.epoch)setSeriesBusy(false);}
  }
  async function adoptPage(result:CreativeResult){
    const selected=mediaValue(result.value,'card',result.targetSectionId??undefined);
    if(!selected||!result.targetSectionId||dirtyRef.current||seriesBusy||!previewedPages[result.resultId])return;
    const epoch=scope.current.epoch;setSeriesBusy(true);setError(null);setMessage(null);
    try{
      const digest=JSON.stringify({resultId:result.resultId,selected});
      let request=pageAdoptions.current[result.resultId]??readPageAdoption(accountId,outputId,result);
      if(request&&request.digest!==digest)throw new Error('原采用请求结果尚未确认。请先刷新原候选，输入和图片仍保留。');
      if(!request){
        const fresh=await client.getGraphicPost({params:{outputId},query:undefined,body:undefined});
        if(epoch!==scope.current.epoch||dirtyRef.current)return;
        request={accountId,outputId,resultId:result.resultId,digest,editedValue:selected,expectedVersionId:fresh.currentVersionId,clientRequestId:crypto.randomUUID()};
      }
      pageAdoptions.current[result.resultId]=request;
      writePageAdoption(request);
      await client.adoptResult({params:{resultId:request.resultId},query:undefined,body:{expected:{owner:'graphic_post',versionId:request.expectedVersionId},editedValue:request.editedValue,clientRequestId:request.clientRequestId}});
      if(epoch!==scope.current.epoch)return;
      delete pageAdoptions.current[result.resultId];
      clearPageAdoption(accountId,outputId,result.resultId);
      const latest=await client.getResult({params:{resultId:result.resultId},query:undefined,body:undefined});
      if(epoch!==scope.current.epoch)return;rememberResult(latest);await onAdopt();
      if(epoch===scope.current.epoch)setMessage('已采用到这一页，其他页和正文保留。');
    }catch(reason){if(epoch===scope.current.epoch){
      // A definite CAS conflict allows a fresh explicit attempt; unknown outcomes retain their exact request.
      if(reason&&typeof reason==='object'&&('status' in reason&&reason.status===409)){
        delete pageAdoptions.current[result.resultId];clearPageAdoption(accountId,outputId,result.resultId);
      }
      setError(errorText(reason));
    }}finally{if(epoch===scope.current.epoch)setSeriesBusy(false);}
  }
  const markPagePreviewed=React.useCallback((resultId:string)=>setPreviewedPages(current=>({...current,[resultId]:true})),[]);
  const visiblePages=Object.values(pageResults).filter(result=>result.targetSectionId===series?.selectedCardId).sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
  const selectedPagePending=Object.values(pageResults).some(result=>series?.selectedCardIds.includes(result.targetSectionId??'')&&['queued','running'].includes(result.status));
  const supportedKinds = TEXT_KINDS.filter((kind) => pickCapability(capabilities ?? [], kind, targetPlatform)?.state === "supported");
  const bundleInProgress = bundle?.items.some((item) => ["queued", "running"].includes(item.status)) ?? false;
  const coverCapability = pickCapability(capabilities ?? [], "cover", targetPlatform);
  const cardCapability = pickCapability(capabilities ?? [], "image_card", targetPlatform);
  const selectedCover = mediaValue(coverResult?.value, "cover");
  const selectedCard = mediaValue(cardResult?.value, "card");

  return <section aria-label="按结果生成" className="space-y-4 rounded-xl border border-border bg-surface p-5">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-semibold">{series?"出图与候选":"直接生成需要的结果"}</h2><p className="mt-1 text-sm text-muted-foreground">每项独立生成。审阅并点击“采用”后，才写入正式作品。</p></div>
      <div className="flex flex-wrap gap-2"><Button size="sm" variant="ghost" onClick={() => void load()}>刷新能力与候选</Button>
      {!series && supportedKinds.length > 0 && <Button variant="outline" disabled={busyBundle || bundleInProgress || Boolean(busyKind)} onClick={() => void createAll()}>{busyBundle || bundleInProgress ? "准备中…" : "一次备齐可用内容"}</Button>}</div>
    </div>
    {loading && <p className="text-sm text-muted-foreground">正在读取创作能力与历史候选…</p>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {message && <p role="status" className="text-sm text-success">{message}</p>}
    {manualDraftDirty && <p className="text-xs text-muted-foreground">当前手工稿有未保存修改。采纳候选前请保存，避免覆盖正在编辑的内容。</p>}
    {bundle && <div className="rounded-lg bg-surface-subtle p-3 text-sm"><strong>最近一次备齐：</strong>{bundle.status === "partial_completed" ? "部分完成" : bundle.status === "complete" ? "已完成" : bundle.status === "failed" ? "未完成" : "处理中"}
      <ul className="mt-2 flex flex-wrap gap-2">{bundle.items.map((item) => <li key={`${item.kind}:${item.resultId}`} className="rounded-md border border-border px-2 py-1">{TEXT_KINDS.includes(item.kind as TextKind) ? LABEL[item.kind as TextKind] : item.kind}：{STATUS[item.status]}{(item.status === "failed" || item.status === "cancelled") && <button type="button" disabled={Boolean(retrying)} className="ml-2 text-primary underline disabled:opacity-50" onClick={() => void retry(item.resultId)}>{retrying === item.resultId ? "重试中…" : "重试"}</button>}</li>)}</ul>
    </div>}
    {series && <div aria-label="当前页图片候选" className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {series.cards.length===0 && pickCapability(capabilities??[],'cardBriefs',targetPlatform)?.state==='supported' && <Button disabled={Boolean(busyKind)} onClick={()=>void generate('cardBriefs')}>规划组图</Button>}
        {series.cards.length>0 && cardCapability?.state==='supported' && <Button disabled={seriesBusy||unknownSeries||selectedPagePending||series.selectedCardIds.length===0} onClick={()=>void generatePages()}>{seriesBusy?'提交中…':`生成所选 ${series.selectedCardIds.length} 页`}</Button>}
        {unknownSeries && <Button variant="outline" disabled={seriesBusy} onClick={()=>void generatePages(true)}>恢复原组图请求</Button>}
      </div>
      {series.cards.length>0&&cardCapability?.state!=='supported'&&<p className="text-xs text-muted-foreground">{capabilityExplanation(cardCapability)}。仍可选用已有图片或进入画布。</p>}
      {seriesBundles.map(group=><div key={group.bundleId} className="rounded-md bg-surface-subtle p-3 text-xs"><strong>所选页生成：{group.status==='partial_completed'?'部分完成':group.status==='complete'?'已完成':group.status==='failed'?'未完成':'处理中'}</strong><ul className="mt-2 space-y-1">{group.items.map(item=><li key={item.resultId}>{series.cards.find(card=>card.cardId===item.targetSectionId)?.title||'原目标页'}：{STATUS[item.status]}{['failed','cancelled'].includes(item.status)&&<Button size="sm" variant="ghost" disabled={Boolean(retrying)} onClick={()=>void retry(item.resultId)}>只重试这一页</Button>}</li>)}</ul></div>)}
      {visiblePages.map(result=>{const images=mediaValue(result.value,'card',result.targetSectionId??undefined);return <article key={result.resultId} className="space-y-2 rounded-lg border border-border p-3"><p className="text-xs text-muted-foreground">{STATUS[result.status]} · {result.createdAt.slice(0,16).replace('T',' ')}{resultError(result.errorCode)?` · ${resultError(result.errorCode)}`:''}</p>
        {images&&['awaiting_confirmation','adopted'].includes(result.status)&&<MediaPreview image={images[0]!} resultId={result.resultId} onPreviewReady={markPagePreviewed}/>}
        {result.status==='awaiting_confirmation'&&images&&<Button size="sm" disabled={manualDraftDirty||seriesBusy||!previewedPages[result.resultId]} onClick={()=>void adoptPage(result)}>采用到这一页</Button>}
        {result.status==='awaiting_confirmation'&&!images&&<p className="text-xs text-muted-foreground">候选精确文件或目标页尚未读到，请刷新；不会自动追加到其他页。</p>}
        {result.retryOf&&!result.taskId&&result.retryRequestId&&<Button size="sm" variant="outline" disabled={Boolean(retrying)} onClick={()=>void retry(result.retryOf!,result.retryRequestId!)}>恢复这次单页重试</Button>}
        {['failed','cancelled'].includes(result.status)&&<Button size="sm" variant="outline" disabled={Boolean(retrying)||Object.values(pageResults).some(next=>next.retryOf===result.resultId)} onClick={()=>void retry(result.resultId)}>只重试这一页</Button>}
      </article>;})}
      {series.selectedCardId&&!visiblePages.length&&<p className="text-xs text-muted-foreground">这一页暂无图片候选。可以生成、使用已有图片，或在画布继续制作。</p>}
    </div>}
    <details open={!series||(series.cards.length===0&&Boolean(results.cardBriefs))} className="space-y-3"><summary className="cursor-pointer text-sm font-medium">{series?'规划与配文候选':'文字候选'}</summary>
    <div className="grid gap-3 md:grid-cols-2">{TEXT_KINDS.map((kind) => {
      const capability = pickCapability(capabilities ?? [], kind, targetPlatform);
      const result = results[kind];
      const supported = capability?.state === "supported";
      const resultPending = result && ["queued", "running", "awaiting_confirmation"].includes(result.status);
      const value = result && edits[kind]?.resultId === result.resultId
        ? edits[kind]!.text
        : result ? candidateText(result) : "";
      const parsedCards=graphicPostCardBriefs.safeParse(result?.value);
      const cards=cardTextEdits?.resultId===result?.resultId?cardTextEdits?.cards:parsedCards.success?parsedCards.data:[];
      const hasCandidateValue = result && (kind==="cardBriefs"?parsedCards.success:kind === "tags"
        ? Array.isArray(result.value) && result.value.every((item) => typeof item === "string")
        : typeof result.value === "string");
      return <div key={kind} className="rounded-lg border border-border p-4"><div className="flex items-start justify-between gap-2"><div><h3 className="font-medium">{LABEL[kind]}</h3><p className="mt-1 text-xs text-muted-foreground">{capabilityExplanation(capability)}</p></div>
        {supported && <Button size="sm" variant="outline" disabled={Boolean(resultPending) || busyKind === kind || busyBundle} onClick={() => void generate(kind)}>{busyKind === kind || resultPending ? "生成中…" : result ? `重新生成${LABEL[kind]}` : `生成${LABEL[kind]}`}</Button>}</div>
        {result && <div className="mt-3 space-y-2"><p className="text-xs text-muted-foreground">{STATUS[result.status]}{resultError(result.errorCode) ? ` · ${resultError(result.errorCode)}` : ""}</p>
          {(result.status === "succeeded" || result.status === "adopted") && <p className="text-xs text-muted-foreground">{result.appliedRules === "applied" ? "已应用账号规则" : "未应用账号规则"} · 已记录来源 {result.sourceRefs.length} 条</p>}
          {result.status === "adopted" && !hasCandidateValue && <p className="text-xs text-muted-foreground">已保存到正式作品，请在下方稿件查看。</p>}
          {result.status === "succeeded" && !hasCandidateValue && <p className="text-xs text-muted-foreground">候选内容尚未读到，请稍后刷新；当前正式稿未改变。</p>}
          {(result.status === "succeeded" || result.status === "adopted") && hasCandidateValue && <>{kind==="cardBriefs"?<div className="space-y-3">{cards?.map((card,index)=><fieldset key={card.cardId} disabled={result.status==="adopted" || Boolean(busyKind)} className="space-y-2 rounded-lg bg-surface-subtle p-3">
            <legend className="px-1 text-xs font-medium">图卡 {index+1}</legend>
            <label className="block text-xs">标题<input aria-label={`图卡${index+1}标题候选`} value={card.title} onChange={event=>setCardTextEdits({resultId:result.resultId,cards:cards.map((c,i)=>i===index?{...c,title:event.target.value}:c)})} className="mt-1 w-full rounded-md border border-border bg-background p-2 text-sm"/></label>
            <label className="block text-xs">正文<textarea aria-label={`图卡${index+1}正文候选`} value={card.body} onChange={event=>setCardTextEdits({resultId:result.resultId,cards:cards.map((c,i)=>i===index?{...c,body:event.target.value}:c)})} className="mt-1 min-h-24 w-full rounded-md border border-border bg-background p-2 text-sm"/></label>
          </fieldset>)}</div>:<textarea aria-label={`${LABEL[kind]}候选`} value={value} disabled={result.status === "adopted"} onChange={(event) => setEdits((current) => ({ ...current, [kind]: { resultId: result.resultId, text: event.target.value } }))} className="min-h-24 w-full rounded-md border border-border bg-background p-2 text-sm" />}
            {result.status === "succeeded" && <Button size="sm" disabled={manualDraftDirty || busyKind === kind} onClick={() => void adopt(kind)}>{busyKind === kind ? "采纳中…" : `采用${LABEL[kind]}到作品`}</Button>}</>}
          {(result.status === "failed" || result.status === "cancelled") && <Button size="sm" variant="outline" disabled={Boolean(retrying)} onClick={() => void retry(result.resultId)}>{retrying === result.resultId ? "重试中…" : "重试这一项"}</Button>}
        </div>}
      </div>;
    })}</div>
    </details>
    {(!series||coverResult||cardResult) && <div className="rounded-lg border border-dashed border-border p-3 text-sm">{series&&<h3 className="mb-3 font-medium">先前未绑定页的图片候选</h3>}<div className="flex flex-wrap items-start justify-between gap-2"><div><h3 className="font-medium">封面</h3><p className="mt-1 text-xs text-muted-foreground">{capabilityExplanation(coverCapability)}</p></div>
      {!series && coverCapability?.state === "supported" && <Button size="sm" variant="outline" disabled={Boolean(coverBusy) || Boolean(cardBusy) || Boolean(busyKind) || busyBundle || Boolean(coverResult && ["queued", "running"].includes(coverResult.status))} onClick={() => void generateCover()}>{coverBusy === "generate" || (coverResult && ["queued", "running"].includes(coverResult.status)) ? "生成中…" : coverResult ? "重新生成封面" : "生成封面"}</Button>}</div>
      {coverResult && <div className="mt-3 space-y-2"><p className="text-xs text-muted-foreground">{coverResult.status === "awaiting_confirmation" ? "待审阅" : coverResult.status === "adopted" ? "已采纳" : coverResult.status === "failed" ? "生成未完成" : coverResult.status === "cancelled" ? "已取消" : "生成中"}{resultError(coverResult.errorCode) ? ` · ${resultError(coverResult.errorCode)}` : ""}</p>
        {selectedCover && ["awaiting_confirmation", "adopted"].includes(coverResult.status) && <><MediaPreview image={selectedCover[0]!} resultId={coverResult.resultId} onPreviewReady={setPreviewedCoverId} />{coverResult.status === "awaiting_confirmation" && <Button size="sm" disabled={manualDraftDirty || Boolean(coverBusy) || Boolean(cardBusy) || previewedCoverId !== coverResult.resultId} onClick={() => void adoptCover()}>{coverBusy === "adopt" ? "采纳中…" : "采纳这张封面"}</Button>}</>}
        {coverResult.status === "awaiting_confirmation" && !selectedCover && <p className="text-xs text-muted-foreground">图片结果尚未读到，请刷新候选。正式稿未改变。</p>}
      </div>}
      <div className="mt-4 border-t border-border pt-3"><div className="flex flex-wrap items-start justify-between gap-2"><div><h3 className="font-medium">图卡</h3><p className="mt-1 text-xs text-muted-foreground">{series?"先前生成的图片可继续采用，保持原未绑定页的用途。":`${capabilityExplanation(cardCapability)}。每次生成一张；采纳后追加到作品，下方也可从素材库选图并排序。`}</p></div>
        {!series && cardCapability?.state === "supported" && <Button size="sm" variant="outline" disabled={Boolean(cardBusy) || Boolean(coverBusy) || Boolean(busyKind) || busyBundle || Boolean(cardResult && ["queued", "running"].includes(cardResult.status))} onClick={() => void generateCard()}>{cardBusy === "generate" || (cardResult && ["queued", "running"].includes(cardResult.status)) ? "生成中…" : cardResult?.status === "adopted" ? "生成下一张图卡" : cardResult ? "重新生成图卡" : "生成图卡"}</Button>}</div>
        {cardResult && <div className="mt-3 space-y-2"><p className="text-xs text-muted-foreground">{cardResult.status === "awaiting_confirmation" ? "待审阅" : cardResult.status === "adopted" ? "已采纳" : cardResult.status === "failed" ? "生成未完成" : cardResult.status === "cancelled" ? "已取消" : "生成中"}{resultError(cardResult.errorCode) ? ` · ${resultError(cardResult.errorCode)}` : ""}</p>
          {selectedCard && ["awaiting_confirmation", "adopted"].includes(cardResult.status) && <><MediaPreview image={selectedCard[0]!} resultId={cardResult.resultId} onPreviewReady={setPreviewedCardId} />{cardResult.status === "awaiting_confirmation" && <Button size="sm" disabled={manualDraftDirty || Boolean(cardBusy) || Boolean(coverBusy) || previewedCardId !== cardResult.resultId} onClick={() => void adoptCard()}>{cardBusy === "adopt" ? "采纳中…" : "采纳这张图卡"}</Button>}</>}
          {cardResult.status === "awaiting_confirmation" && !selectedCard && <p className="text-xs text-muted-foreground">图片结果尚未读到，请刷新候选。正式稿未改变。</p>}
          {(cardResult.status === "failed" || cardResult.status === "cancelled") && <Button size="sm" variant="outline" disabled={Boolean(retrying)} onClick={() => void retry(cardResult.resultId)}>{retrying === cardResult.resultId ? "重试中…" : "重试图卡"}</Button>}
        </div>}
      </div>
    </div>}
  </section>;
}
