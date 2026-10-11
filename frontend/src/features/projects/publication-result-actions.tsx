"use client";

import {codexCapabilityExplanation} from '@/lib/codex-capability-explanation';

import * as React from "react";
import Image from "next/image";
import type { CreativeCapability, CreativeResult } from "@creatoros/contract";

import { Button } from "@/components/ui/button";
import {useCreationClient,useCreationScope} from "@/lib/creation-workspace-scope";
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


type Platform = "xiaohongshu" | "douyin" | "kuaishou";
type Kind = "publish_title" | "description" | "publish_tags";
type Publication = { id: string; contentOutputId: string; platform: string; currentRevisionId: string };
type Revision = { id: string; title: string; description: string; platformTags: string[]; revisionNumber: number; coverAssetId?: string | null };
type CoverUse = { assetId: string; assetFileId: string; order: 0; role: "cover" };
const KINDS: readonly Kind[] = ["publish_title", "description", "publish_tags"];
const LABEL: Record<Kind, string> = { publish_title: "发布标题", description: "发布简介", publish_tags: "发布标签" };
const PENDING = ["queued", "running", "awaiting_confirmation"];

function coverValue(value: unknown): CoverUse[] | null {
  if (!Array.isArray(value) || value.length !== 1) return null;
  const item = value[0];
  if (!item || typeof item !== "object" || typeof item.assetId !== "string" || typeof item.assetFileId !== "string" ||
    item.order !== 0 || item.role !== "cover") return null;
  return [{ assetId: item.assetId, assetFileId: item.assetFileId, order: 0, role: "cover" }];
}

function CoverPreview({ image, resultId, onReady }: { image: CoverUse; resultId: string; onReady: (id: string) => void }) {
  const client=useCreationClient();
  const [url, setUrl] = React.useState<string | null>(null);
  const [failed, setFailed] = React.useState(false);
  React.useEffect(() => {
    let active = true;
    void client.getAssetFileDownloadUrl({ params: { assetId: image.assetId, assetFileId: image.assetFileId }, query: undefined, body: undefined })
      .then((result) => { if (active) { setUrl(result.url); onReady(resultId); } })
      .catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, [image.assetId, image.assetFileId, onReady, resultId]);
  return url ? <Image src={url} alt="待审阅的发布封面" width={480} height={320} unoptimized className="max-h-72 w-full rounded-md bg-surface-subtle object-contain" />
    : <p className="text-xs text-muted-foreground">{failed ? "封面暂无法预览，请刷新候选后再采纳。" : "正在读取封面预览…"}</p>;
}

export function publicationExpectedRevision(outputId: string, platform: Platform, rows: readonly Publication[], revision: Revision | null) {
  if (rows.length > 1 || (rows.length === 1 && !revision)) return null;
  return rows[0]
    ? { owner: "publication" as const, mode: "existing" as const, publicationId: rows[0].id, revisionId: revision!.id }
    : { owner: "publication" as const, mode: "create" as const, outputId, platform, expectedAbsent: true as const };
}

function candidateText(result: CreativeResult): string {
  if (typeof result.value === "string") return result.value;
  if (Array.isArray(result.value)) return result.value.filter((item): item is string => typeof item === "string").join("、");
  return "";
}
function abilityText(cap: CreativeCapability | undefined) {
  if (!cap || cap.state === "unknown") return "尚未核验生成能力";
  if (cap.state === "supported") return "当前可生成";
  const codexReason=codexCapabilityExplanation(cap.reasonCode);if(codexReason)return codexReason;
  if (cap.reasonCode === "MODEL_NOT_CONFIGURED") return "当前模型凭据不可用，请检查模型设置";
  if (cap.reasonCode === "ADAPTER_NOT_READY") return "尚未接通";
  return "当前暂不可用";
}

export function PublicationResultActions({ accountId, outputId, outputType, platform, dirty = false }: {
  accountId:string|null;
  outputId: string;
  outputType: "image" | "video";
  platform: Platform | null;
  dirty?: boolean;
}) {
  const client=useCreationClient(),workspaceSelection=useCreationScope();
  const [capabilities, setCapabilities] = React.useState<CreativeCapability[]>([]);
  const [results, setResults] = React.useState<Partial<Record<Kind, CreativeResult>>>({});
  const [coverResult, setCoverResult] = React.useState<CreativeResult | null>(null);
  const [edits, setEdits] = React.useState<Partial<Record<Kind, { id: string; value: string }>>>({});
  const [publications, setPublications] = React.useState<Publication[]>([]);
  const [revision, setRevision] = React.useState<Revision | null>(null);
  const [busy, setBusy] = React.useState<Kind | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [message, setMessage] = React.useState<string | null>(null);
  const generationIds = React.useRef<Partial<Record<Kind, string>>>({});
  const adoptionIds = React.useRef<Partial<Record<Kind, { digest: string; id: string }>>>({});
  const pollInFlight = React.useRef(false);
  const loadSerial = React.useRef(0);
  const coverRequestId = React.useRef<string | null>(null);
  const coverAdoptionId = React.useRef<{ digest: string; id: string } | null>(null);
  const [coverBusy, setCoverBusy] = React.useState<"generate" | "adopt" | null>(null);
  const [previewedCoverId, setPreviewedCoverId] = React.useState<string | null>(null);

  const remember = React.useCallback((result: CreativeResult) => {
    if (result.kind === "publish_cover" && result.outputId === outputId && result.targetPlatform === platform) {
      setCoverResult((current) => current && current.resultId !== result.resultId && current.createdAt > result.createdAt ? current : result);
      return;
    }
    if (!KINDS.includes(result.kind as Kind) || result.outputId !== outputId || result.targetPlatform !== platform) return;
    const kind = result.kind as Kind;
    setResults((current) => current[kind] && current[kind]!.resultId !== result.resultId && current[kind]!.createdAt > result.createdAt
      ? current : { ...current, [kind]: result });
    // Local edits contain user changes only; queued results have no editable value yet.
  }, [outputId, platform]);

  const loadPublication = React.useCallback(async () => {
    if (!platform) return;
    const rows = await client.listPublications({ params: { outputId }, query: { page: 1, pageSize: 100 }, body: undefined }) as unknown as Publication[];
    const matching = rows.filter((item) => item.contentOutputId === outputId && item.platform === platform);
    setPublications(matching);
    if (matching.length !== 1) { setRevision(null); return; }
    const versions = await client.listPublicationRevisions({ params: { publicationId: matching[0]!.id }, query: { page: 1, pageSize: 100 }, body: undefined }) as unknown as Revision[];
    const current = versions.find((item) => item.id === matching[0]!.currentRevisionId);
    if (!current) throw new Error("当前发布修订暂未读到，请刷新重试。");
    setRevision(current);
  }, [outputId, platform]);

  const load = React.useCallback(async () => {
    if (!platform) return;
    const serial = ++loadSerial.current;
    const reads = await Promise.allSettled([
      client.listCreativeCapabilities({ params: undefined, query:{...(!workspaceSelection.groupId&&accountId?{accountId}:{}),outputId}, body: undefined }),
      client.listResults({ params: { outputId }, query: { pageSize: 50 }, body: undefined }),
      loadPublication(),
    ]);
    if (serial !== loadSerial.current) return;
    if (reads[0].status === "fulfilled") setCapabilities(reads[0].value.items);
    else { setCapabilities([]); setError("发布生成能力暂未读到，已有内容仍可查看。"); }
    if (reads[1].status === "fulfilled") for (const result of [...reads[1].value.items].sort((a, b) => a.createdAt.localeCompare(b.createdAt))) remember(result);
    else setError("发布候选暂未读到，请刷新重试。");
    if (reads[2].status === "rejected") setError(resultErrorText(reads[2].reason, "发布修订暂未读到，请刷新重试。"));
  }, [accountId, loadPublication, outputId, platform, remember]);

  React.useEffect(() => {
    let active = true;
    void Promise.resolve().then(() => { if (active) void load(); });
    return () => { active = false; loadSerial.current += 1; };
  }, [load]);
  React.useEffect(() => {
    if (!Object.values(results).some((result) => result && PENDING.includes(result.status)) &&
      !(coverResult && ["queued", "running"].includes(coverResult.status))) return;
    let active = true;
    const timer = window.setInterval(() => {
      if (!active || pollInFlight.current) return;
      pollInFlight.current = true;
      const ids = Object.values(results).filter((item): item is CreativeResult => Boolean(item && PENDING.includes(item.status))).map((item) => item.resultId);
      if (coverResult && ["queued", "running"].includes(coverResult.status)) ids.push(coverResult.resultId);
      void Promise.allSettled(ids.map((resultId) => client.getResult({ params: { resultId }, query: undefined, body: undefined })))
        .then((reads) => { if (active) for (const read of reads) if (read.status === "fulfilled") remember(read.value); })
        .finally(() => { pollInFlight.current = false; });
    }, 1800);
    return () => { active = false; window.clearInterval(timer); };
  }, [coverResult, remember, results]);

  async function generate(kind: Kind) {
    if (!platform || busy || dirty || coverBusy || publications.length > 1 || (results[kind] && PENDING.includes(results[kind]!.status))) return;
    const id = generationIds.current[kind] ?? crypto.randomUUID();
    generationIds.current[kind] = id;
    setBusy(kind); setError(null); setMessage(null);
    try {
      const next = await client.generateResult({ params: { outputId }, query: undefined, body: { kind, targetPlatform: platform, clientRequestId: id } });
      delete generationIds.current[kind];
      remember(next);
      setMessage(`${LABEL[kind]}候选已提交。审阅并采纳后才更新发布修订。`);
    } catch (reason) { setError(resultErrorText(reason, "发布内容生成未完成，请重试。")); }
    finally { setBusy(null); }
  }
  async function adopt(kind: Kind) {
    if (!platform || busy || dirty || coverBusy || publications.length > 1) return;
    const result = results[kind];
    if (!result || result.status !== "succeeded") return;
    if (kind === "publish_tags" ? !Array.isArray(result.value) || result.value.some((item) => typeof item !== "string")
      : typeof result.value !== "string") return;
    const text = edits[kind]?.id === result.resultId ? edits[kind]!.value : candidateText(result);
    const value = kind === "publish_tags" ? text.split(/[、,，\n]+/).map((item) => item.trim()).filter(Boolean) : text;
    const expected = publicationExpectedRevision(outputId, platform, publications, revision);
    if (!expected) { setError("发布修订尚未确定，请刷新后重试。"); return; }
    const digest = JSON.stringify({ resultId: result.resultId, expected, value });
    const request = adoptionIds.current[kind]?.digest === digest ? adoptionIds.current[kind]! : { digest, id: crypto.randomUUID() };
    adoptionIds.current[kind] = request;
    setBusy(kind); setError(null); setMessage(null);
    try {
      await client.adoptResult({ params: { resultId: result.resultId }, query: undefined,
        body: { expected, editedValue: value, clientRequestId: request.id } });
      delete adoptionIds.current[kind];
      remember(await client.getResult({ params: { resultId: result.resultId }, query: undefined, body: undefined }));
      await loadPublication();
      setMessage(`${LABEL[kind]}已采纳到真实发布修订。`);
    } catch (reason) { setError(resultErrorText(reason, "采纳未完成。请刷新发布修订后重试，已有内容未改变。")); }
    finally { setBusy(null); }
  }

  async function generateCover() {
    if (!platform || busy || dirty || coverBusy || publications.length > 1 ||
      (coverResult && ["queued", "running"].includes(coverResult.status))) return;
    const id = coverRequestId.current ?? crypto.randomUUID();
    coverRequestId.current = id;
    setCoverBusy("generate"); setError(null); setMessage(null);
    try {
      const result = await client.generateResult({ params: { outputId }, query: undefined,
        body: { kind: "publish_cover", targetPlatform: platform, clientRequestId: id } });
      coverRequestId.current = null;
      remember(result);
      setMessage("发布封面已提交生成。预览后可决定是否采纳到发布草稿。");
    } catch (reason) { setError(resultErrorText(reason, "发布封面生成未完成，请重试。")); }
    finally { setCoverBusy(null); }
  }

  async function adoptCover() {
    if (!platform || busy || dirty || coverBusy || publications.length > 1) return;
    const result = coverResult;
    const selected = coverValue(result?.value);
    if (!result || result.status !== "awaiting_confirmation" || !selected || previewedCoverId !== result.resultId) return;
    const expected = publicationExpectedRevision(outputId, platform, publications, revision);
    if (!expected) { setError("发布修订尚未确定，请刷新后重试。"); return; }
    const digest = JSON.stringify({ resultId: result.resultId, expected, selected });
    const request = coverAdoptionId.current?.digest === digest ? coverAdoptionId.current : { digest, id: crypto.randomUUID() };
    coverAdoptionId.current = request;
    setCoverBusy("adopt"); setError(null); setMessage(null);
    try {
      await client.adoptResult({ params: { resultId: result.resultId }, query: undefined,
        body: { expected, editedValue: selected, clientRequestId: request.id } });
      coverAdoptionId.current = null;
      remember(await client.getResult({ params: { resultId: result.resultId }, query: undefined, body: undefined }));
      await loadPublication();
      setMessage("发布封面已采纳到真实发布修订。");
    } catch (reason) { setError(resultErrorText(reason, "封面采纳未完成。请刷新修订后重试，原发布草稿未改变。")); }
    finally { setCoverBusy(null); }
  }

  if (!platform) return <section className="rounded-xl border border-border bg-surface p-5 text-sm text-muted-foreground">当前作品未指定受支持的发布平台，发布内容生成暂不可用。</section>;
  const capFor = (kind: Kind | "publish_cover") => capabilities.find((item) => item.outputType === outputType && item.platform === platform && item.kind === kind);
  return <section className="space-y-4 rounded-xl border border-border bg-surface p-5" aria-label="发布内容">
    <div className="flex flex-wrap items-start justify-between gap-2"><div><h2 className="font-semibold">发布内容</h2><p className="mt-1 text-sm text-muted-foreground">按平台分别生成标题、简介和标签；采纳会新建发布修订。</p></div><Button size="sm" variant="ghost" onClick={() => void load()}>刷新发布内容</Button></div>
    {publications.length > 1 && <p role="alert" className="text-sm text-destructive">当前作品在该平台存在多份发布记录，无法安全选择修订；请先处理重复记录。</p>}
    {dirty && <p className="text-xs text-muted-foreground">作品稿件有未保存修改。请先保存，再生成或采纳发布内容。</p>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {message && <p role="status" className="text-sm text-success">{message}</p>}
    {revision && <div className="rounded-md bg-surface-subtle p-3 text-sm"><strong>当前发布修订 v{revision.revisionNumber}</strong><p className="mt-1">标题：{revision.title || "未填写"}</p><p>简介：{revision.description || "未填写"}</p><p>标签：{revision.platformTags.join("、") || "未填写"}</p><p>封面：{revision.coverAssetId ? "已设置" : "未设置"}</p></div>}
    {!revision && publications.length === 0 && <p className="text-xs text-muted-foreground">尚无发布修订。首次采纳会为当前作品和平台建立一份草稿。</p>}
    <div className="grid gap-3 md:grid-cols-3">{KINDS.map((kind) => {
      const cap = capFor(kind);
      const result = results[kind];
      const pending = Boolean(result && PENDING.includes(result.status));
      const candidateReady = Boolean(result && (kind === "publish_tags"
        ? Array.isArray(result.value) && result.value.every((item) => typeof item === "string")
        : typeof result.value === "string"));
      const value = result && edits[kind]?.id === result.resultId ? edits[kind]!.value : result ? candidateText(result) : "";
      return <div key={kind} className="rounded-lg border border-border p-3"><div className="flex flex-wrap items-start justify-between gap-2"><div><h3 className="font-medium">{LABEL[kind]}</h3><p className="mt-1 text-xs text-muted-foreground">{abilityText(cap)}</p></div>
        {cap?.state === "supported" && <Button size="sm" variant="outline" disabled={Boolean(busy) || dirty || Boolean(coverBusy) || pending || publications.length > 1} onClick={() => void generate(kind)}>{pending || busy === kind ? "生成中…" : `生成${LABEL[kind]}`}</Button>}</div>
        {result && <div className="mt-3 space-y-2"><p className="text-xs text-muted-foreground">{result.status === "succeeded" ? "待采纳" : result.status === "adopted" ? "已采纳" : result.status === "failed" ? "生成未完成" : pending ? "生成中" : "已取消"}</p>
          {result.status === "adopted" && !candidateReady && <p className="text-xs text-muted-foreground">已保存到发布修订，请在上方当前发布修订查看。</p>}
          {result.status === "succeeded" && !candidateReady && <p className="text-xs text-muted-foreground">候选内容尚未读到，请刷新；发布修订未改变。</p>}
          {(result.status === "succeeded" || result.status === "adopted") && candidateReady && <><textarea aria-label={`${LABEL[kind]}候选`} value={value} disabled={result.status === "adopted"} onChange={(event) => setEdits((current) => ({ ...current, [kind]: { id: result.resultId, value: event.target.value } }))} className="min-h-24 w-full rounded-md border border-border bg-background p-2 text-sm" />
            {result.status === "succeeded" && <Button size="sm" disabled={Boolean(busy) || dirty || Boolean(coverBusy) || publications.length > 1 || Boolean(publications.length === 1 && !revision)} onClick={() => void adopt(kind)}>采纳{LABEL[kind]}</Button>}</>}
          {(result.status === "failed" || result.status === "cancelled") && <p className="text-xs text-muted-foreground">可重新生成这一项。</p>}
        </div>}
      </div>;
    })}</div>
    <div className="rounded-lg border border-border p-4"><div className="flex flex-wrap items-start justify-between gap-2"><div><h3 className="font-medium">发布封面</h3><p className="mt-1 text-xs text-muted-foreground">{abilityText(capFor("publish_cover"))}</p></div>
      {capFor("publish_cover")?.state === "supported" && <Button size="sm" variant="outline" disabled={Boolean(busy) || dirty || Boolean(coverBusy) || publications.length > 1 || Boolean(coverResult && ["queued", "running"].includes(coverResult.status))} onClick={() => void generateCover()}>{coverBusy === "generate" || (coverResult && ["queued", "running"].includes(coverResult.status)) ? "生成中…" : coverResult ? "重新生成发布封面" : "生成发布封面"}</Button>}</div>
      {coverResult && <div className="mt-3 space-y-2"><p className="text-xs text-muted-foreground">{coverResult.status === "awaiting_confirmation" ? "待审阅" : coverResult.status === "adopted" ? "已采纳" : coverResult.status === "failed" ? "生成未完成" : coverResult.status === "cancelled" ? "已取消" : "生成中"}</p>
        {coverValue(coverResult.value) && ["awaiting_confirmation", "adopted"].includes(coverResult.status) && <><CoverPreview image={coverValue(coverResult.value)![0]!} resultId={coverResult.resultId} onReady={setPreviewedCoverId} />
          {coverResult.status === "awaiting_confirmation" && <Button size="sm" disabled={Boolean(busy) || dirty || Boolean(coverBusy) || publications.length > 1 || Boolean(publications.length === 1 && !revision) || previewedCoverId !== coverResult.resultId} onClick={() => void adoptCover()}>采纳这张发布封面</Button>}</>}
        {coverResult.status === "awaiting_confirmation" && !coverValue(coverResult.value) && <p className="text-xs text-muted-foreground">真实图片尚未读到，请刷新候选；发布草稿未改变。</p>}
      </div>}
    </div>
  </section>;
}
