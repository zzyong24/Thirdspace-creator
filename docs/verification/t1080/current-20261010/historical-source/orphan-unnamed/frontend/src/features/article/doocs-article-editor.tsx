"use client";

import * as React from "react";
import { articleDocument } from "@creatoros/contract";
import { Button } from "@/components/ui/button";
import { client } from "@/lib/contract-client";
import { parseArticleMarkdown, serializeArticleMarkdown, type MarkdownSection } from "./doocs-markdown";

type ArticleDocument = import("@creatoros/contract").ArticleDocument;
type Props = {
  accountId: string;
  outputId: string;
  sourceVersionId: string;
  value: ArticleDocument;
  onChange: (document: ArticleDocument) => void;
  onSave: (document: ArticleDocument) => Promise<boolean>;
};
type FrameMessage = { channel: "creatoros-doocs"; type: string; sessionId?: string; markdown?: string; layout?: unknown; nonce?: string };
type StoredCheckpoint = { accountId: string; outputId: string; sourceVersionId: string; updatedAt: number; document: ArticleDocument };

const frameClient = client as unknown as {
  getAssetFileDownloadUrl(input: { params: { assetId: string; assetFileId: string }; query: undefined; body: undefined }): Promise<{ url: string; fileName: string }>;
};

function sessionId(): string { return crypto.randomUUID(); }
function checkpointKey(accountId: string, outputId: string): string { return `creatoros:article:draft:${accountId}:${outputId}`; }
function sectionsForEditor(document: ArticleDocument): MarkdownSection[] {
  return document.sections.map((section) => ({
    ...section,
    headingLevel: section.headingLevel ?? 2,
    body: [section.body, ...document.imageUses.filter((image) => image.sectionId === section.sectionId)
      .filter((image) => !section.body.includes(`creatoros-asset:${image.assetId}:${image.assetFileId}`))
      .map((image) => `<img src="creatoros-asset:${image.assetId}:${image.assetFileId}" alt="文章配图" />`)].filter(Boolean).join("\n\n"),
  }));
}

export function DoocsArticleEditor({ accountId, outputId, sourceVersionId, value, onChange, onSave }: Props) {
  const frameRef = React.useRef<HTMLIFrameElement>(null);
  const session = React.useRef(sessionId());
  const requestWaiters = React.useRef(new Map<string, (message: FrameMessage) => void>());
  const [frameReady, setFrameReady] = React.useState(false);
  const [draftMarkdown, setDraftMarkdown] = React.useState(() => serializeArticleMarkdown(sectionsForEditor(value)));
  const [draftLayout, setDraftLayout] = React.useState(value.nativeLayout);
  const [checkpoint, setCheckpoint] = React.useState<StoredCheckpoint | null>(null);
  const [checkpointConflict, setCheckpointConflict] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [status, setStatus] = React.useState("Doocs 公众号编辑器尚未连接。");

  React.useEffect(() => {
    const raw = sessionStorage.getItem(checkpointKey(accountId, outputId));
    if (!raw) return;
    try {
      const saved = JSON.parse(raw) as StoredCheckpoint;
      if (saved.accountId !== accountId || saved.outputId !== outputId || Date.now() - saved.updatedAt > 24 * 60 * 60 * 1000) {
        sessionStorage.removeItem(checkpointKey(accountId, outputId));
        return;
      }
      const parsed = articleDocument.safeParse(saved.document);
      if (!parsed.success) { sessionStorage.removeItem(checkpointKey(accountId, outputId)); return; }
      setCheckpoint({ ...saved, document: parsed.data });
      setCheckpointConflict(saved.sourceVersionId !== sourceVersionId);
    } catch { sessionStorage.removeItem(checkpointKey(accountId, outputId)); }
  }, [accountId, outputId, sourceVersionId]);

  const send = React.useCallback((type: string, body: Record<string, unknown> = {}) => {
    const target = frameRef.current?.contentWindow;
    if (!target) return;
    target.postMessage({ channel: "creatoros-doocs", type, sessionId: session.current, ...body }, "*");
  }, []);

  const initializeFrame = React.useCallback(async () => {
    const frame = frameRef.current;
    if (!frame?.contentWindow) return;
    const currentSession = session.current;
    const nonce = sessionId();
    const sections = sectionsForEditor(value);
    setDraftMarkdown(serializeArticleMarkdown(sections));
    setDraftLayout(value.nativeLayout);
    send("init", { nonce, document: { title: value.title, markdown: serializeArticleMarkdown(sections), layout: value.nativeLayout ?? null } });
    try {
      for (const image of value.imageUses) {
        const link = await frameClient.getAssetFileDownloadUrl({ params: { assetId: image.assetId, assetFileId: image.assetFileId }, query: undefined, body: undefined });
        const response = await fetch(link.url, { credentials: "omit" });
        const contentType = response.headers.get("content-type") ?? "";
        const contentLength = Number(response.headers.get("content-length") ?? 0);
        if (!response.ok || !contentType.startsWith("image/") || contentLength > 25 * 1024 * 1024) throw new Error("素材图片无法安全读取。");
        const blob = await response.blob();
        if (!blob.type.startsWith("image/") || blob.size > 25 * 1024 * 1024) throw new Error("素材图片超过 25 MiB 或不是图片文件。");
        if (currentSession !== session.current) return;
        send("asset", { assetId: image.assetId, assetFileId: image.assetFileId, blob });
      }
    } catch (reason) {
      if (currentSession === session.current) setError(reason instanceof Error ? reason.message : "素材图片预览不可用。");
    }
  }, [send, value]);

  React.useEffect(() => {
    function receive(event: MessageEvent<FrameMessage>) {
      if (event.source !== frameRef.current?.contentWindow || event.origin !== "null") return;
      const message = event.data;
      if (!message || message.channel !== "creatoros-doocs") return;
      if (message.type === "ready") { setFrameReady(true); void initializeFrame(); return; }
      if (message.sessionId !== session.current) return;
      if (message.type === "changed" && typeof message.markdown === "string") {
        setDraftMarkdown(message.markdown);
        setDraftLayout(message.layout as typeof draftLayout);
        try {
          const original = sectionsForEditor(value);
          const parsed = parseArticleMarkdown(message.markdown, original);
          const next = articleDocument.parse({ ...value, sections: parsed.sections,
            imageUses: parsed.imageRefs.map((image) => {
              const existing = value.imageUses.find((item) => item.sectionId === image.sectionId && item.assetId === image.assetId && item.assetFileId === image.assetFileId);
              if (!existing) throw new Error("正文引用的素材已变化；请从 CreatorOS 素材库重新插入图片。");
              return existing;
            }), nativeLayout: message.layout ?? undefined });
          onChange(next); setError(null); setStatus("修改已在本标签页暂存，尚未保存为正式版本。");
        } catch (reason) { setError(reason instanceof Error ? reason.message : "文章正文无法安全解析。"); }
      }
      if (message.type === "response" && message.nonce) requestWaiters.current.get(message.nonce)?.(message);
    }
    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  }, [initializeFrame, onChange, value]);

  React.useEffect(() => {
    if (!frameReady) return;
    let active = true;
    const timer = window.setTimeout(() => {
      if (!active) return;
      try {
        sessionStorage.setItem(checkpointKey(accountId, outputId), JSON.stringify({
          accountId, outputId, sourceVersionId, updatedAt: Date.now(), document: value,
        } satisfies StoredCheckpoint));
      } catch { setStatus("未保存草稿仍在编辑器内存中；浏览器刷新后无法恢复。"); }
    }, 500);
    return () => { active = false; clearTimeout(timer); };
  }, [accountId, outputId, sourceVersionId, value, frameReady]);

  React.useEffect(() => () => {
    session.current = sessionId();
    requestWaiters.current.clear();
    setFrameReady(false);
  }, [accountId, outputId]);

  function restoreCheckpoint() {
    if (!checkpoint || checkpointConflict) return;
    onChange(checkpoint.document);
    setDraftMarkdown(serializeArticleMarkdown(sectionsForEditor(checkpoint.document)));
    setDraftLayout(checkpoint.document.nativeLayout);
    send("set-document", { document: { title: checkpoint.document.title, markdown: serializeArticleMarkdown(sectionsForEditor(checkpoint.document)), layout: checkpoint.document.nativeLayout ?? null } });
    setCheckpoint(null);
  }

  async function saveEditorDraft() {
    if (busy || !frameReady) return;
    setBusy(true); setError(null);
    try {
      const parsed = parseArticleMarkdown(draftMarkdown, sectionsForEditor(value));
      const next = articleDocument.parse({ ...value, sections: parsed.sections,
        imageUses: parsed.imageRefs.map((image) => {
          const found = value.imageUses.find((item) => item.sectionId === image.sectionId && item.assetId === image.assetId && item.assetFileId === image.assetFileId);
          if (!found) throw new Error("无法将未知素材加入正式文章，请重新从 CreatorOS 素材库插入。");
          return found;
        }), nativeLayout: draftLayout ?? undefined });
      if (await onSave(next)) {
        sessionStorage.removeItem(checkpointKey(accountId, outputId));
        setCheckpoint(null);
        setStatus("正文与排版已保存并读回正式版本。");
      }
    } catch (reason) { setError(reason instanceof Error ? reason.message : "文章保存未完成。"); }
    finally { setBusy(false); }
  }

  return <section className="space-y-3 rounded-xl border p-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h3 className="font-medium">公众号排版编辑器</h3><p className="text-xs text-muted-foreground">{status}</p></div>
      <Button onClick={() => void saveEditorDraft()} disabled={busy || !frameReady}>{busy ? "保存中…" : "保存正文与排版"}</Button>
    </div>
    {error && <p role="alert" className="rounded-md bg-red-50 p-2 text-sm text-red-700">{error}</p>}
    {checkpoint && <div role="status" className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm">
      {checkpointConflict ? "标签页保存了旧版本草稿。当前正式稿已变化，请先比较并确认后再编辑或保存。" : "发现此标签页上次未保存的草稿。"}
      {!checkpointConflict && <Button className="ml-3" size="sm" variant="outline" onClick={restoreCheckpoint}>恢复未保存草稿</Button>}
      <Button className="ml-2" size="sm" variant="ghost" onClick={() => { sessionStorage.removeItem(checkpointKey(accountId, outputId)); setCheckpoint(null); }}>放弃草稿</Button>
    </div>}
    <iframe ref={frameRef} title="Doocs 公众号 Markdown 编辑器" src="/reference-editors/doocs-md/index.html"
      sandbox="allow-scripts allow-downloads" referrerPolicy="same-origin" onLoad={() => void initializeFrame()}
      className="h-[700px] w-full rounded-md border bg-white" />
  </section>;
}
