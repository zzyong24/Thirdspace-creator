"use client";
import {useCreationClient,useCreationScope} from "@/lib/creation-workspace-scope";

import * as React from "react";
import { OutputConversionPanel } from "./output-conversion-panel";
import Link from "next/link";
import type { CreativeCapability, CreativeResult } from "@creatoros/contract";

import { Button } from "@/components/ui/button";
import { client } from "@/lib/contract-client";
import { describeUserError } from "@/lib/ai-error-humanize";
import { PublicationResultActions } from "./publication-result-actions";

type ArtifactRow = { id: string; projectId: string; contentOutputId: string | null; artifactType: string; currentVersionId: string };
type VersionRow = { id: string; artifactId: string; versionNumber: number; contentText: string; contentData?: Record<string, unknown>; createdAt: string };
type ScriptArtifact = { artifact: ArtifactRow; current: VersionRow; versions: VersionRow[] };
// SEMANTIC_BOUNDARY_ALLOW: 仅投影保存稿真实段落身份，不补造 ID 或选择创作内容。
export function savedScriptSections(version: VersionRow) {
  const raw=version.contentData?.sections;
  if(!Array.isArray(raw)||!raw.every(item=>item&&typeof item==="object"&&!Array.isArray(item)&&typeof item.id==="string"&&item.id.length>0&&typeof item.heading==="string"&&typeof item.body==="string")||new Set(raw.map(item=>item.id)).size!==raw.length)return [];
  return raw.map(item=>({sectionId:item.id as string,heading:item.heading as string,body:item.body as string}));
}
const PENDING = ["queued", "running", "awaiting_confirmation"];

function resultErrorText(error: unknown, fallback: string): string {
  // SEMANTIC_BOUNDARY_ALLOW: Translate structured protocol codes only, without guessing from error text.
  const details = error && typeof error === "object" ? error as {code?: unknown; status?: unknown} : null;
  if (details?.code === "SOURCE_UNAVAILABLE") {
    return "生成时的来源或规则已变化或暂不可用。输入和已生成候选仍保留，请重新生成这一项。";
  }
  if (details?.code === "VERSION_CONFLICT" || details?.code === "ConflictError" || details?.status === 409) {
    return "稿件已更新。已生成候选和编辑内容仍保留，请刷新后重新审阅；正文已改变时请重新生成相应候选。";
  }
  return describeUserError(error, fallback);
}

export async function readOutputScript(projectId: string, outputId: string): Promise<ScriptArtifact | null> {
  let artifact: ArtifactRow | undefined;
  const seenArtifacts = new Set<string>();
  for (let page = 1; page <= 20; page++) {
    const rows = await client.listArtifacts({ params: { projectId }, query: { page, pageSize: 100 }, body: undefined }) as unknown as ArtifactRow[];
    artifact = rows.find((row) => row.artifactType === "output_script" && row.contentOutputId === outputId);
    const newRows = rows.filter((row) => !seenArtifacts.has(row.id));
    rows.forEach((row) => seenArtifacts.add(row.id));
    if (artifact || rows.length < 100 || newRows.length === 0) break;
  }
  if (!artifact) return null;
  const versions: VersionRow[] = [];
  const seenVersions = new Set<string>();
  for (let page = 1; page <= 20; page++) {
    const rows = await client.listArtifactVersions({ params: { artifactId: artifact.id }, query: { page, pageSize: 100 }, body: undefined }) as unknown as VersionRow[];
    const newRows = rows.filter((row) => !seenVersions.has(row.id));
    versions.push(...newRows);
    rows.forEach((row) => seenVersions.add(row.id));
    if (rows.length < 100 || newRows.length === 0) break;
  }
  const current = versions.find((version) => version.id === artifact.currentVersionId);
  if (!current) throw new Error("当前脚本版本暂未读到，请刷新重试。");
  return { artifact, current, versions };
}

function capabilityText(item: CreativeCapability | undefined): string {
  if (!item || item.state === "unknown") return "当前模型能力尚未核验，仍可手写脚本";
  if (item.state === "supported") return "当前可生成脚本候选";
  if (item.reasonCode === "MODEL_NOT_CONFIGURED") return "当前模型凭据不可用，请检查模型设置；仍可手写脚本";
  if (item.reasonCode === "ADAPTER_NOT_READY") return "脚本生成尚未接通，仍可手写脚本";
  return "脚本生成暂不可用，仍可手写脚本";
}

export function VideoOutputWorkbench({ projectId, projectTitle, outputId, outputTitle, targetPlatform, accountId, sourceItemId, initialStartStatus }: {
  projectId: string;
  projectTitle: string;
  outputId: string;
  outputTitle: string;
  targetPlatform: string | null;
  accountId:string|null;
  sourceItemId?: string;
  initialStartStatus?: string;
}) {
 const client=useCreationClient(),workspaceSelection=useCreationScope();

  const [script, setScript] = React.useState<ScriptArtifact | null>(null);
  const [draft, setDraft] = React.useState("");
  const [capability, setCapability] = React.useState<CreativeCapability | null>(null);
  const [result, setResult] = React.useState<CreativeResult | null>(null);
  const [candidateEdit, setCandidateEdit] = React.useState<{resultId: string; value: string} | null>(null);
  const [busy, setBusy] = React.useState<"load" | "save" | "generate" | "adopt" | null>("load");
  const [error, setError] = React.useState<string | null>(null);
  const [message, setMessage] = React.useState<string | null>(null);
  const [startStatus, setStartStatus] = React.useState(initialStartStatus);
  const generationId = React.useRef<string | null>(null);
  const adoptionId = React.useRef<{ digest: string; id: string } | null>(null);
  const pollInFlight = React.useRef(false);
  const loadSerial = React.useRef(0);
  const resultReadSerial = React.useRef(0);
  const startResolved = React.useRef(false);
  const dirty = draft !== (script?.current.contentText ?? "");
  const candidate = result && candidateEdit?.resultId === result.resultId ? candidateEdit.value :
    typeof result?.value === "string" ? result.value : "";

  const refreshScript = React.useCallback(async (replaceDraft: boolean) => {
    const next = await readOutputScript(projectId, outputId);
    setScript(next);
    if (replaceDraft) setDraft(next?.current.contentText ?? "");
  }, [outputId, projectId]);

  const rememberResult = React.useCallback((next: CreativeResult) => {
    if (next.kind !== "script" || next.outputId !== outputId) return;
    setResult((current) => current && current.resultId !== next.resultId && current.createdAt > next.createdAt ? current : next);
    // Only onChange owns local edits; queued and repeated reads cannot replace user input.
  }, [outputId]);

  const refreshResults = React.useCallback(async () => {
    const serial = ++resultReadSerial.current;
    const [abilities, results] = await Promise.allSettled([
      client.listCreativeCapabilities({ params: undefined, query:{...(!workspaceSelection.groupId&&accountId?{accountId}:{}),outputId}, body: undefined }),
      client.listResults({ params: { outputId }, query: { pageSize: 50 }, body: undefined }),
    ]);
    if (serial !== resultReadSerial.current) return;
    if (abilities.status === "fulfilled") setCapability(abilities.value.items.find((item) => item.outputType === "video" && item.kind === "script" && item.platform === targetPlatform)
      ?? abilities.value.items.find((item) => item.outputType === "video" && item.kind === "script" && item.platform === null) ?? null);
    else { setCapability(null); setError("生成能力暂未读到，手写脚本仍可继续。"); }
    if (results.status === "fulfilled") {
      const latest = results.value.items.filter((item) => item.outputId === outputId && item.kind === "script")
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
      if (latest) rememberResult(latest);
      if (initialStartStatus === "unknown" && !startResolved.current) {
        startResolved.current = true;
        setStartStatus(undefined);
        if (!latest) setMessage("未读到自动首稿任务。你可以直接写脚本，或点击生成脚本。");
        const url = new URL(window.location.href);
        url.searchParams.delete("start");
        window.history.replaceState(window.history.state, "", url);
      }
    } else setError("脚本候选暂未读到，正式稿未改变。可刷新重试。");
  }, [accountId, initialStartStatus, outputId, rememberResult, targetPlatform]);

  React.useEffect(() => {
    let active = true;
    const serial = ++loadSerial.current;
    void (async () => {
      try {
        const next = await readOutputScript(projectId, outputId);
        if (!active || serial !== loadSerial.current) return;
        setScript(next); setDraft(next?.current.contentText ?? "");
        await refreshResults();
      } catch (reason) { if (active) setError(resultErrorText(reason, "视频作品暂未读到，请刷新重试。")); }
      finally { if (active) setBusy(null); }
    })();
    return () => { active = false; loadSerial.current += 1; resultReadSerial.current += 1; };
  }, [outputId, projectId, refreshResults]);

  React.useEffect(() => {
    if (!result || !PENDING.includes(result.status)) return;
    let active = true;
    const timer = window.setInterval(() => {
      if (!active || pollInFlight.current) return;
      pollInFlight.current = true;
      void client.getResult({ params: { resultId: result.resultId }, query: undefined, body: undefined })
        .then((latest) => { if (active) rememberResult(latest); })
        .catch((reason) => { if (active) setError(resultErrorText(reason, "脚本候选状态暂未读到，可点击刷新重试。")); })
        .finally(() => { pollInFlight.current = false; });
    }, 1800);
    return () => { active = false; window.clearInterval(timer); };
  }, [rememberResult, result]);

  async function save() {
    if (busy || !dirty) return;
    setBusy("save"); setError(null); setMessage(null);
    try {
      let target = script?.artifact;
      if (!target) target = await client.createArtifact({ params: { projectId }, query: undefined,
        body: { title: `${outputTitle} · 脚本`, artifactType: "output_script", stage: "script", contentOutputId: outputId } });
      await client.createArtifactVersion({ params: { artifactId: target.id }, query: undefined,
        body: { expectedCurrentVersionId: target.currentVersionId, contentText: draft, changeSummary: "编辑视频作品脚本" } });
      await refreshScript(true);
      setMessage("脚本已保存为这条视频作品的新版本。");
    } catch (reason) {
      setError(resultErrorText(reason, "脚本保存未完成，输入已保留。请刷新版本后重试。"));
      // A first artifact may have been created before version creation failed.
      try { await refreshScript(false); } catch { /* Keep the unsaved input. */ }
    } finally { setBusy(null); }
  }

  async function generate() {
    if (busy || dirty || capability?.state !== "supported" || (result && PENDING.includes(result.status))) return;
    setBusy("generate"); setError(null); setMessage(null);
    const id = generationId.current ?? crypto.randomUUID();
    generationId.current = id;
    try {
      const next = await client.generateResult({ params: { outputId }, query: undefined,
        body: { kind: "script", clientRequestId: id, ...(sourceItemId ? { sourceItemId } : {}) } });
      generationId.current = null;
      rememberResult(next);
      await refreshScript(false);
      setMessage("脚本候选已提交。审阅并采纳后才会写入正式稿。");
    } catch (reason) { setError(resultErrorText(reason, "脚本生成未完成，请重试。")); }
    finally { setBusy(null); }
  }

  async function adopt() {
    if (busy || dirty || !script || !result || result.status !== "succeeded" || typeof result.value !== "string") return;
    const digest = JSON.stringify({ resultId: result.resultId, versionId: script.artifact.currentVersionId, candidate });
    const request = adoptionId.current?.digest === digest ? adoptionId.current : { digest, id: crypto.randomUUID() };
    adoptionId.current = request;
    setBusy("adopt"); setError(null); setMessage(null);
    try {
      await client.adoptResult({ params: { resultId: result.resultId }, query: undefined,
        body: { expected: { owner: "output_script", versionId: script.artifact.currentVersionId }, editedValue: candidate, clientRequestId: request.id } });
      adoptionId.current = null;
      rememberResult(await client.getResult({ params: { resultId: result.resultId }, query: undefined, body: undefined }));
      await refreshScript(true);
      setMessage("候选已采纳到这条视频作品的脚本版本。");
    } catch (reason) { setError(resultErrorText(reason, "采纳未完成。请刷新版本并重试，正式稿未改变。")); }
    finally { setBusy(null); }
  }

  return <main data-page="video-output-workbench" className="mx-auto w-full max-w-5xl space-y-5 p-5 md:p-8">
    <header className="space-y-2"><Link href={`/projects/${encodeURIComponent(projectId)}`} className="text-sm text-muted-foreground hover:text-foreground">← {projectTitle}</Link>
      <h1 className="text-2xl font-semibold">{outputTitle}</h1><p className="text-sm text-muted-foreground">这条视频作品有独立的正式脚本和版本。生成内容需要审阅并明确采纳。</p></header>
    {error && <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
    {message && <p role="status" className="rounded-md bg-success-soft p-3 text-sm text-success">{message}</p>}
    {startStatus === "unavailable" && <p className="rounded-md bg-surface-subtle p-3 text-sm text-muted-foreground">作品已创建。当前无法自动生成首稿，可直接写脚本并保存。</p>}
    {startStatus === "source-unavailable" && <p className="rounded-md bg-surface-subtle p-3 text-sm text-muted-foreground">作品已创建，但所选来源逐字稿暂不可读取。可直接写脚本并保存。</p>}
    {startStatus === "unknown" && <p className="rounded-md bg-surface-subtle p-3 text-sm text-muted-foreground">作品已创建。首稿提交状态正在从服务端核对；手写也可继续。</p>}
    {busy === "load" && <p className="text-sm text-muted-foreground">正在读取作品脚本…</p>}
    <section className="rounded-xl border border-border bg-surface p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-semibold">正式脚本</h2><p className="mt-1 text-sm text-muted-foreground">{script ? `当前 v${script.current.versionNumber} · ${script.versions.length} 个已读取版本` : "尚无正式脚本。可直接写，保存时会为本作品创建稿件。"}</p></div>
        <Button disabled={Boolean(busy) || !dirty} onClick={() => void save()}>{busy === "save" ? "保存中…" : "保存脚本"}</Button></div>
      <textarea aria-label="视频正式脚本" value={draft} onChange={(event) => setDraft(event.target.value)} className="mt-4 min-h-72 w-full rounded-md border border-border bg-background p-3 leading-relaxed" placeholder="直接写这条视频的脚本；保存后可查看历史版本" />
    </section>
    {script && <OutputConversionPanel key={`${accountId}:${outputId}`} accountId={accountId} projectId={projectId} outputId={outputId}
      sourceType="video" versionId={script.current.id} dirty={dirty} fields={{script: script.current.contentText}} sections={savedScriptSections(script.current)} />}
    <section className="rounded-xl border border-border bg-surface p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-semibold">生成脚本候选</h2><p className="mt-1 text-sm text-muted-foreground">{capabilityText(capability ?? undefined)}</p></div>
        <div className="flex gap-2"><Button size="sm" variant="ghost" onClick={() => void refreshResults()}>刷新能力与候选</Button>{capability?.state === "supported" && <Button size="sm" variant="outline" disabled={Boolean(busy) || dirty || Boolean(result && PENDING.includes(result.status))} onClick={() => void generate()}>{busy === "generate" || (result && PENDING.includes(result.status)) ? "生成中…" : "生成脚本"}</Button>}</div></div>
      {dirty && <p className="mt-2 text-xs text-muted-foreground">先保存正在编辑的脚本，再生成或采纳候选。</p>}
      {sourceItemId && <p className="mt-2 text-xs text-muted-foreground">本次生成会引用所选雷达来源的真实逐字稿；来源不可读取时可继续手写。</p>}
      {result && <div className="mt-4 space-y-2"><p className="text-xs text-muted-foreground">{result.status === "succeeded" ? "待采纳" : result.status === "adopted" ? "已采纳" : result.status === "failed" ? "生成未完成" : PENDING.includes(result.status) ? "生成中" : "已取消"}</p>
        {(result.status === "succeeded" || result.status === "adopted") && typeof result.value === "string" && <><textarea aria-label="脚本候选" value={candidate} disabled={result.status === "adopted"} onChange={(event) => setCandidateEdit({resultId: result.resultId, value: event.target.value})} className="min-h-56 w-full rounded-md border border-border bg-background p-3 leading-relaxed" />
          {result.status === "succeeded" && <Button disabled={Boolean(busy) || dirty || !script} onClick={() => void adopt()}>采纳到正式脚本</Button>}</>}
        {(result.status === "failed" || result.status === "cancelled") && <p className="text-xs text-muted-foreground">可重新生成；已有正式稿不受影响。</p>}
      </div>}
    </section>
    {script && <section className="rounded-xl border border-border bg-surface p-5"><h2 className="font-semibold">版本历史</h2><ol className="mt-3 space-y-3 text-sm">{script.versions.map((version) => <li key={version.id} className="rounded-md border border-border p-3"><div className="flex flex-wrap items-center justify-between gap-2"><strong>v{version.versionNumber}{version.id === script.artifact.currentVersionId ? " · 当前" : ""}</strong><span className="text-xs text-muted-foreground">{version.createdAt.slice(0, 16).replace("T", " ")}</span></div><details className="mt-2"><summary className="cursor-pointer text-primary">查看这版脚本</summary><p className="mt-2 whitespace-pre-wrap text-muted-foreground">{version.contentText || "空白版本"}</p></details></li>)}</ol>
    </section>}
    <PublicationResultActions accountId={accountId} outputId={outputId} outputType="video"
      platform={targetPlatform === "xiaohongshu" || targetPlatform === "douyin" || targetPlatform === "kuaishou" ? targetPlatform : null} dirty={dirty} />
    <nav className="border-t border-border pt-4 text-sm"><Link href={`/projects/${encodeURIComponent(projectId)}/production?outputId=${encodeURIComponent(outputId)}`} className="text-primary hover:underline">制作这条视频 →</Link><p className="mt-1 text-xs text-muted-foreground">素材、剪辑方案和成片归属当前视频作品。</p></nav>
  </main>;
}
