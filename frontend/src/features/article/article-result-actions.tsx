"use client";

import {codexCapabilityExplanation} from '@/lib/codex-capability-explanation';
import {useCreationClient,useCreationScope} from "@/lib/creation-workspace-scope";

import * as React from "react";
import Image from "next/image";
import type { CreativeCapability, CreativeResult } from "@creatoros/contract";

import { Button } from "@/components/ui/button";
import { client } from "@/lib/contract-client";
import { describeUserError } from "@/lib/ai-error-humanize";

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


const KINDS = ["title", "summary", "body"] as const;
type Kind = (typeof KINDS)[number];
const LABEL: Record<Kind, string> = { title: "标题", summary: "摘要", body: "正文" };
const PENDING = ["queued", "running", "awaiting_confirmation"];
type CoverUse = { assetId: string; assetFileId: string; order: 0; role: "cover" };
type CardUse = { assetId: string; assetFileId: string; order: 0; role: "card" };

function mediaValue<Role extends "cover" | "card">(value: unknown, role: Role): Array<{ assetId: string; assetFileId: string; order: 0; role: Role }> | null {
  if (!Array.isArray(value) || value.length !== 1) return null;
  const item = value[0];
  if (!item || typeof item !== "object" || typeof item.assetId !== "string" || typeof item.assetFileId !== "string" ||
    item.order !== 0 || item.role !== role) return null;
  return [{ assetId: item.assetId, assetFileId: item.assetFileId, order: 0, role }];
}
const coverValue = (value: unknown): CoverUse[] | null => mediaValue(value, "cover");
const cardValue = (value: unknown): CardUse[] | null => mediaValue(value, "card");

function MediaPreview({ image, resultId, onReady }: { image: CoverUse | CardUse; resultId: string; onReady: (id: string) => void }) {
 const client=useCreationClient(),workspaceSelection=useCreationScope();

  const [url, setUrl] = React.useState<string | null>(null);
  const [error, setError] = React.useState(false);
  React.useEffect(() => {
    let active = true;
    void client.getAssetFileDownloadUrl({ params: { assetId: image.assetId, assetFileId: image.assetFileId }, query: undefined, body: undefined })
      .then((result) => { if (active) { setUrl(result.url); onReady(resultId); } })
      .catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, [image.assetId, image.assetFileId, onReady, resultId]);
  return url ? <Image src={url} alt={image.role === "cover" ? "待审阅的文章封面" : "待审阅的段落配图"} width={480} height={320} unoptimized className="max-h-72 w-full rounded-md bg-surface-subtle object-contain" />
    : <p className="text-xs text-muted-foreground">{error ? "图片暂无法预览，请刷新后再采纳。" : "正在读取图片预览…"}</p>;
}

function ability(items: readonly CreativeCapability[], kind: Kind | "cover" | "image_card") {
  return items.find((item) => item.outputType === "article" && item.platform === "wechatOfficialAccount" && item.kind === kind)
    ?? items.find((item) => item.outputType === "article" && item.platform === null && item.kind === kind);
}

function abilityText(item: CreativeCapability | undefined) {
  if (!item || item.state === "unknown") return "生成能力尚未核验";
  if (item.state === "supported") return "当前可生成";
  const codexReason=codexCapabilityExplanation(item.reasonCode);if(codexReason)return codexReason;
  if (item.reasonCode === "MODEL_NOT_CONFIGURED") return "当前模型凭据不可用，请检查模型设置";
  if (item.reasonCode === "ADAPTER_NOT_READY") return "此项尚未接通";
  return "当前不可用，可稍后刷新状态";
}

export function ArticleResultActions({ accountId, outputId, currentVersionId, dirty, bodyReplaceBlocked, sections, onAdopt }: {
  accountId:string|null;
  outputId: string;
  currentVersionId: string;
  dirty: boolean;
  bodyReplaceBlocked: boolean;
  sections: readonly { sectionId: string; heading: string }[];
  onAdopt: () => Promise<void>;
}) {
 const client=useCreationClient(),workspaceSelection=useCreationScope();

  const [capabilities, setCapabilities] = React.useState<CreativeCapability[] | null>(null);
  const [results, setResults] = React.useState<Partial<Record<Kind, CreativeResult>>>({});
  const [coverResult, setCoverResult] = React.useState<CreativeResult | null>(null);
  const [cardResults, setCardResults] = React.useState<Record<string, CreativeResult>>({});
  const [edits, setEdits] = React.useState<Partial<Record<Kind, { id: string; value: string }>>>({});
  const [busy, setBusy] = React.useState<Kind | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [message, setMessage] = React.useState<string | null>(null);
  const requestIds = React.useRef<Partial<Record<Kind, string>>>({});
  const adoptionIds = React.useRef<Partial<Record<Kind, { digest: string; id: string }>>>({});
  const serial = React.useRef(0);
  const pollInFlight = React.useRef(false);
  const coverRequestId = React.useRef<string | null>(null);
  const coverAdoptionId = React.useRef<{ digest: string; id: string } | null>(null);
  const [coverBusy, setCoverBusy] = React.useState<"generate" | "adopt" | null>(null);
  const [previewedCoverId, setPreviewedCoverId] = React.useState<string | null>(null);
  const cardRequestIds = React.useRef<Record<string, string>>({});
  const cardAdoptionIds = React.useRef<Record<string, { digest: string; id: string }>>({});
  const [cardBusy, setCardBusy] = React.useState<string | null>(null);
  const [previewedCardIds, setPreviewedCardIds] = React.useState<ReadonlySet<string>>(() => new Set());
  const markCardReady = React.useCallback((id: string) => {
    setPreviewedCardIds((current) => current.has(id) ? current : new Set(current).add(id));
  }, []);

  const remember = React.useCallback((result: CreativeResult) => {
    if (result.kind === "image_card") {
      const sectionId = result.targetSectionId;
      if (!sectionId) return;
      setCardResults((current) => current[sectionId] && current[sectionId]!.resultId !== result.resultId && current[sectionId]!.createdAt > result.createdAt
        ? current : { ...current, [sectionId]: result });
      return;
    }
    if (result.kind === "cover") {
      setCoverResult((current) => current && current.resultId !== result.resultId && current.createdAt > result.createdAt ? current : result);
      return;
    }
    if (!KINDS.includes(result.kind as Kind)) return;
    const kind = result.kind as Kind;
    setResults((current) => current[kind] && current[kind]!.createdAt > result.createdAt
      ? current : { ...current, [kind]: result });
    // Local edits contain user changes only; queued results have no editable value yet.
  }, []);

  const load = React.useCallback(async () => {
    const current = ++serial.current;
    const reads = await Promise.allSettled([
      client.listCreativeCapabilities({ params: undefined, query:{...(!workspaceSelection.groupId&&accountId?{accountId}:{}),outputId}, body: undefined }),
      client.listResults({ params: { outputId }, query: { pageSize: 50 }, body: undefined }),
    ]);
    if (current !== serial.current) return;
    if (reads[0].status === "fulfilled") setCapabilities(reads[0].value.items);
    else { setCapabilities(null); setError("创作能力暂未读取到。手工编辑仍可继续。"); }
    if (reads[1].status === "fulfilled") {
      for (const result of [...reads[1].value.items].sort((a, b) => a.createdAt.localeCompare(b.createdAt))) remember(result);
    } else setError("历史候选暂未读取到，可刷新重试；正式稿未改变。");
  }, [accountId, outputId, remember]);

  React.useEffect(() => {
    let active = true;
    void Promise.resolve().then(() => { if (active) void load(); });
    return () => { active = false; serial.current += 1; };
  }, [load]);
  React.useEffect(() => {
    if (!Object.values(results).some((result) => result && PENDING.includes(result.status)) &&
      !(coverResult && ["queued", "running"].includes(coverResult.status)) &&
      !Object.values(cardResults).some((result) => ["queued", "running"].includes(result.status))) return;
    let active = true;
    const timer = window.setInterval(() => {
      if (!active || pollInFlight.current) return;
      pollInFlight.current = true;
      void (async () => {
        try {
          const ids = Object.values(results).filter((result): result is CreativeResult => Boolean(result && PENDING.includes(result.status))).map((result) => result.resultId);
          if (coverResult && ["queued", "running"].includes(coverResult.status)) ids.push(coverResult.resultId);
          for (const card of Object.values(cardResults)) if (["queued", "running"].includes(card.status)) ids.push(card.resultId);
          const reads = await Promise.allSettled(ids.map((resultId) => client.getResult({ params: { resultId }, query: undefined, body: undefined })));
          if (active) for (const read of reads) if (read.status === "fulfilled") remember(read.value);
        } finally { pollInFlight.current = false; }
      })();
    }, 1800);
    return () => { active = false; window.clearInterval(timer); };
  }, [cardResults, coverResult, remember, results]);

  async function generateCover() {
    if (busy || dirty || coverBusy || (coverResult && ["queued", "running"].includes(coverResult.status))) return;
    setCoverBusy("generate"); setError(null); setMessage(null);
    const id = coverRequestId.current ?? crypto.randomUUID();
    coverRequestId.current = id;
    try {
      const result = await client.generateResult({ params: { outputId }, query: undefined, body: { kind: "cover", clientRequestId: id } });
      coverRequestId.current = null;
      remember(result);
      setMessage("文章封面已提交生成。图片出现后请预览，再决定是否采纳。");
    } catch (reason) { setError(resultErrorText(reason, "封面生成未完成，请重试。")); }
    finally { setCoverBusy(null); }
  }
  async function adoptCover() {
    const result = coverResult;
    const selected = coverValue(result?.value);
    if (!result || result.status !== "awaiting_confirmation" || !selected || dirty || busy || coverBusy || previewedCoverId !== result.resultId) return;
    const digest = JSON.stringify({ resultId: result.resultId, versionId: currentVersionId, selected });
    const request = coverAdoptionId.current?.digest === digest ? coverAdoptionId.current : { digest, id: crypto.randomUUID() };
    coverAdoptionId.current = request;
    setCoverBusy("adopt"); setError(null); setMessage(null);
    try {
      await client.adoptResult({ params: { resultId: result.resultId }, query: undefined,
        body: { expected: { owner: "wechat_article", versionId: currentVersionId }, editedValue: selected, clientRequestId: request.id } });
      coverAdoptionId.current = null;
      remember(await client.getResult({ params: { resultId: result.resultId }, query: undefined, body: undefined }));
      await onAdopt();
      setMessage("封面已采纳并保存到文章新版本。");
    } catch (reason) { setError(resultErrorText(reason, "封面采纳未完成。请刷新文章版本后重试。")); }
    finally { setCoverBusy(null); }
  }

  async function generateCard(sectionId: string) {
    if (busy || dirty || coverBusy || cardBusy || !sections.some((item) => item.sectionId === sectionId) ||
      (cardResults[sectionId] && ["queued", "running"].includes(cardResults[sectionId]!.status))) return;
    setCardBusy(sectionId); setError(null); setMessage(null);
    const id = cardRequestIds.current[sectionId] ?? crypto.randomUUID();
    cardRequestIds.current[sectionId] = id;
    try {
      const result = await client.generateResult({ params: { outputId }, query: undefined,
        body: { kind: "image_card", targetSectionId: sectionId, clientRequestId: id } });
      delete cardRequestIds.current[sectionId];
      remember(result);
      setMessage("段落配图已提交生成。图片出现后请预览，再决定是否采纳。");
    } catch (reason) { setError(resultErrorText(reason, "段落配图生成未完成，请重试。")); }
    finally { setCardBusy(null); }
  }

  async function adoptCard(sectionId: string) {
    const result = cardResults[sectionId];
    const selected = cardValue(result?.value);
    if (!result || result.targetSectionId !== sectionId || result.status !== "awaiting_confirmation" || !selected ||
      dirty || busy || cardBusy || !sections.some((item) => item.sectionId === sectionId) || !previewedCardIds.has(result.resultId)) return;
    const digest = JSON.stringify({ resultId: result.resultId, sectionId, versionId: currentVersionId, selected });
    const request = cardAdoptionIds.current[sectionId]?.digest === digest
      ? cardAdoptionIds.current[sectionId]! : { digest, id: crypto.randomUUID() };
    cardAdoptionIds.current[sectionId] = request;
    setCardBusy(sectionId); setError(null); setMessage(null);
    try {
      await client.adoptResult({ params: { resultId: result.resultId }, query: undefined,
        body: { expected: { owner: "wechat_article", versionId: currentVersionId }, editedValue: selected, clientRequestId: request.id } });
      delete cardAdoptionIds.current[sectionId];
      remember(await client.getResult({ params: { resultId: result.resultId }, query: undefined, body: undefined }));
      await onAdopt();
      setMessage("配图已采纳到对应段落的新文章版本。");
    } catch (reason) { setError(resultErrorText(reason, "段落配图采纳未完成。请刷新文章版本后重试。")); }
    finally { setCardBusy(null); }
  }

  async function generate(kind: Kind) {
    if (busy || dirty || (kind === "body" && bodyReplaceBlocked)) return;
    setBusy(kind); setError(null); setMessage(null);
    const id = requestIds.current[kind] ?? crypto.randomUUID();
    requestIds.current[kind] = id;
    try {
      const result = await client.generateResult({ params: { outputId }, query: undefined, body: { kind, clientRequestId: id } });
      delete requestIds.current[kind];
      remember(result);
      setMessage(`${LABEL[kind]}候选已提交。完成后审阅，再决定是否采纳。`);
    } catch (reason) { setError(resultErrorText(reason, `${LABEL[kind]}生成未完成，请重试。`)); }
    finally { setBusy(null); }
  }
  async function adopt(kind: Kind) {
    const result = results[kind];
    if (!result || result.status !== "succeeded" || dirty || busy || (kind === "body" && bodyReplaceBlocked)) return;
    const value = edits[kind]?.id === result.resultId ? edits[kind]!.value : result.value;
    if (typeof value !== "string") return;
    const digest = JSON.stringify({ resultId: result.resultId, versionId: currentVersionId, value });
    const request = adoptionIds.current[kind]?.digest === digest ? adoptionIds.current[kind]! : { digest, id: crypto.randomUUID() };
    adoptionIds.current[kind] = request;
    setBusy(kind); setError(null); setMessage(null);
    try {
      await client.adoptResult({ params: { resultId: result.resultId }, query: undefined,
        body: { expected: { owner: "wechat_article", versionId: currentVersionId }, editedValue: value, clientRequestId: request.id } });
      delete adoptionIds.current[kind];
      remember(await client.getResult({ params: { resultId: result.resultId }, query: undefined, body: undefined }));
      await onAdopt();
      setMessage(`${LABEL[kind]}已采纳并保存为文章新版本。`);
    } catch (reason) { setError(resultErrorText(reason, "采纳未完成，正式稿未改变。请检查版本后重试。")); }
    finally { setBusy(null); }
  }

  return <section className="space-y-3 rounded-xl border border-border bg-surface p-5" aria-label="按结果创作文章">
    <div className="flex flex-wrap items-center justify-between gap-2"><div><h2 className="font-semibold">按需要生成</h2><p className="mt-1 text-sm text-muted-foreground">标题、摘要、正文和封面可分别生成。候选只有点击采纳后才进入正式稿。</p></div>
      <Button size="sm" variant="ghost" onClick={() => void load()}>刷新能力与候选</Button></div>
    {dirty && <p className="text-xs text-muted-foreground">当前稿件有未保存修改。请先保存，再生成或采纳候选。</p>}
    {bodyReplaceBlocked && <p className="text-xs text-muted-foreground">当前文章已有配图或配图建议，整篇正文替换暂不可用；仍可逐段手工编辑。</p>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {message && <p role="status" className="text-sm text-success">{message}</p>}
    <div className="grid gap-3 md:grid-cols-3">{KINDS.map((kind) => {
      const cap = ability(capabilities ?? [], kind);
      const result = results[kind];
      const pending = Boolean(result && PENDING.includes(result.status));
      const blocked = kind === "body" && bodyReplaceBlocked;
      const value = result && edits[kind]?.id === result.resultId ? edits[kind]!.value : typeof result?.value === "string" ? result.value : "";
      return <div key={kind} className="rounded-lg border border-border p-3"><div className="flex items-start justify-between gap-2"><div><h3 className="font-medium">{LABEL[kind]}</h3><p className="mt-1 text-xs text-muted-foreground">{blocked ? "已有配图，暂不能整篇替换" : abilityText(cap)}</p></div>
        {cap?.state === "supported" && !blocked && <Button size="sm" variant="outline" disabled={Boolean(busy) || dirty || pending} onClick={() => void generate(kind)}>{pending || busy === kind ? "生成中…" : `生成${LABEL[kind]}`}</Button>}</div>
        {result && <div className="mt-3 space-y-2"><p className="text-xs text-muted-foreground">{result.status === "succeeded" ? "待采纳" : result.status === "adopted" ? "已采纳" : result.status === "failed" ? "生成未完成" : pending ? "生成中" : "已取消"}</p>
          {result.status === "adopted" && typeof result.value !== "string" && <p className="text-xs text-muted-foreground">已保存到正式文章，请在当前稿件查看。</p>}
          {(result.status === "succeeded" || result.status === "adopted") && typeof result.value === "string" && <><textarea aria-label={`${LABEL[kind]}候选`} value={value} disabled={result.status === "adopted"} onChange={(event) => setEdits((current) => ({ ...current, [kind]: { id: result.resultId, value: event.target.value } }))} className="min-h-28 w-full rounded-md border border-border bg-background p-2 text-sm" />
            {result.status === "succeeded" && <Button size="sm" disabled={dirty || blocked || Boolean(busy)} onClick={() => void adopt(kind)}>采纳{LABEL[kind]}到文章</Button>}</>}
          {(result.status === "failed" || result.status === "cancelled") && <p className="text-xs text-muted-foreground">可点击上方按钮重新生成这一项。</p>}
        </div>}
      </div>;
    })}</div>
    <div className="rounded-lg border border-border p-4"><div className="flex flex-wrap items-start justify-between gap-2"><div><h3 className="font-medium">文章封面</h3><p className="mt-1 text-xs text-muted-foreground">{abilityText(ability(capabilities ?? [], "cover"))}</p></div>
      {ability(capabilities ?? [], "cover")?.state === "supported" && <Button size="sm" variant="outline" disabled={Boolean(busy) || dirty || Boolean(coverBusy) || Boolean(coverResult && ["queued", "running"].includes(coverResult.status))} onClick={() => void generateCover()}>{coverBusy === "generate" || (coverResult && ["queued", "running"].includes(coverResult.status)) ? "生成中…" : coverResult ? "重新生成封面" : "生成封面"}</Button>}</div>
      {coverResult && <div className="mt-3 space-y-2"><p className="text-xs text-muted-foreground">{coverResult.status === "awaiting_confirmation" ? "待审阅" : coverResult.status === "adopted" ? "已采纳" : coverResult.status === "failed" ? "生成未完成" : coverResult.status === "cancelled" ? "已取消" : "生成中"}</p>
        {coverValue(coverResult.value) && ["awaiting_confirmation", "adopted"].includes(coverResult.status) && <><MediaPreview image={coverValue(coverResult.value)![0]!} resultId={coverResult.resultId} onReady={setPreviewedCoverId} />
          {coverResult.status === "awaiting_confirmation" && <Button size="sm" disabled={Boolean(busy) || dirty || Boolean(coverBusy) || previewedCoverId !== coverResult.resultId} onClick={() => void adoptCover()}>{coverBusy === "adopt" ? "采纳中…" : "采纳这张封面"}</Button>}</>}
        {coverResult.status === "awaiting_confirmation" && !coverValue(coverResult.value) && <p className="text-xs text-muted-foreground">真实图片尚未读到，请刷新候选；文章未改变。</p>}
      </div>}
    </div>
    <div className="rounded-lg border border-border p-4"><h3 className="font-medium">逐段生成配图</h3><p className="mt-1 text-xs text-muted-foreground">{abilityText(ability(capabilities ?? [], "image_card"))}。每张候选明确绑定当前段落，审阅采纳后才写入文章。</p>
      <div className="mt-3 space-y-3">{sections.map((section, index) => {
        const result = cardResults[section.sectionId];
        const image = cardValue(result?.value)?.[0];
        const pending = Boolean(result && ["queued", "running"].includes(result.status));
        return <div key={section.sectionId} className="rounded-md border border-border p-3"><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-medium">第 {index + 1} 段 · {section.heading || "未命名段落"}</p>
          {ability(capabilities ?? [], "image_card")?.state === "supported" && <Button size="sm" variant="outline" disabled={dirty || Boolean(busy) || Boolean(coverBusy) || Boolean(cardBusy) || pending} onClick={() => void generateCard(section.sectionId)}>{pending || cardBusy === section.sectionId ? "生成中…" : result ? "重新生成这段配图" : "生成这段配图"}</Button>}</div>
          {result && <div className="mt-3 space-y-2"><p className="text-xs text-muted-foreground">{result.status === "awaiting_confirmation" ? "待审阅" : result.status === "adopted" ? "已采纳" : result.status === "failed" ? "生成未完成" : result.status === "cancelled" ? "已取消" : "生成中"}</p>
            {image && ["awaiting_confirmation", "adopted"].includes(result.status) && <><MediaPreview image={image} resultId={result.resultId} onReady={markCardReady} />
              {result.status === "awaiting_confirmation" && <Button size="sm" disabled={dirty || Boolean(busy) || Boolean(cardBusy) || !previewedCardIds.has(result.resultId)} onClick={() => void adoptCard(section.sectionId)}>采纳到这一段</Button>}</>}
            {result.status === "awaiting_confirmation" && !image && <p className="text-xs text-muted-foreground">真实图片尚未读到，请刷新候选；文章未改变。</p>}
          </div>}
        </div>;
      })}</div>
      {!sections.length && <p className="mt-3 text-xs text-muted-foreground">先在文章中添加并保存一个段落，再生成配图。</p>}
    </div>
  </section>;
}
