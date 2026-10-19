"use client";
import * as React from "react";
import Link from "next/link";
import {
  workCreationReadResult,
  workCreationProposalResult,
  type WorkCreationProposalResult,
} from "@creatoros/contract";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogDescription, DialogTrigger } from "@/components/ui/dialog";
import {
  useCreationClient,
  useCreationScope,
  creationScopeKey,
} from "@/lib/creation-workspace-scope";
import { NoteRelayEditor } from "@/features/reference-editors/noterelay/noterelay-editor";
import {
  editorDigest,
  useDraftChatRequest,
  withEditorCandidateSave,
  type EditorSaveCandidate,
} from "@/features/draft-workbench/draft-chat-request";
import { saveWorkEditorCandidate,useAssistedWorkReview,AssistedWorkSelection,type WorkCandidateLocation } from "./chat-work-editor-card";
export function ChatWorkCreationCard({
  result,
  toolCallId,
  location=null,
}: {
  result: unknown;
  toolCallId: string;
  location?:WorkCandidateLocation|null;
}) {
  const parsed = workCreationProposalResult.safeParse(result),
    read = workCreationReadResult.safeParse(result);
  if (read.success)
    return (
      <details className="rounded-xl border border-border bg-surface p-4 text-sm">
        <summary className="cursor-pointer font-medium">
          已读取联合创作来源
        </summary>
        <p className="mt-3 whitespace-pre-wrap">{read.data.scriptText}</p>
        <p className="mt-2 text-muted-foreground">
          文章和图文共用当前确认的脚本保存版本。
          {read.data.imageState === "empty"
            ? "当前没有选用图片，图文仍可排成真实页面。"
            : read.data.imageMessage}
        </p>
      </details>
    );
  if (!parsed.success)
    return (
      <p role="alert" className="text-sm text-destructive">
        联合创作候选尚无法读取，原任务保留。
      </p>
    );
  return (
    <section
      className="space-y-3 rounded-xl border border-primary/30 bg-primary/5 p-4"
      aria-label="文章和图文联合候选"
    >
      <h3 className="font-semibold">文章和图文已生成，分别预览并采纳</h3>
      <p className="text-sm text-muted-foreground">
        共用已确认脚本；两份作品分别保存，采纳后可继续微调。
      </p>
      {(["article", "image"] as const).map((kind) => (
        <CreationMember
          key={`${toolCallId}:${kind}`}
          value={parsed.data}
          kind={kind}
          toolCallId={toolCallId}
          location={location}
        />
      ))}
    </section>
  );
}
function CreationMember({
  value,
  kind,
  toolCallId,
  location,
}: {
  location:WorkCandidateLocation|null;
  value: WorkCreationProposalResult;
  kind: "article" | "image";
  toolCallId: string;
}) {
  const scope = useCreationScope(),
    client = useCreationClient(),
    editor = useDraftChatRequest(),
    member =
      kind === "article"
        ? value.target.articleMember
        : value.target.graphicMember,
    document = kind === "article" ? value.article : value.graphic,
    contentDigest =
      kind === "article" ? value.articleDigest : value.graphicDigest;
  const candidate:EditorSaveCandidate={kind:'work.creation.member',proposal:value,member:kind};
  const review=useAssistedWorkReview(client,candidate,location,creationScopeKey(scope));
  const [expanded, setExpanded] = React.useState(false),
    [previewReady, setPreviewReady] = React.useState(false),
    [busy, setBusy] = React.useState(false),
    [status, setStatus] = React.useState<string | null>(null),
    [error, setError] = React.useState<string | null>(null),
    [saved, setSaved] = React.useState(false);
  const alive = React.useRef(true);
  React.useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const sourceVersionId = `creation:${toolCallId}:${kind}:${contentDigest}`;
  const path =
    kind === "article"
      ? `/projects/${value.target.projectId}/article?outputId=${member.outputId}`
      : `/projects/${value.target.projectId}/outputs/${member.outputId}/image`;
  async function adopt() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const requestId = await editorDigest({
        toolCallId,
        kind,
        outputId: member.outputId,
        contentDigest,
      });
      const candidate: EditorSaveCandidate = {
        kind: "work.creation.member",
        proposal: value,
        member: kind,
      };
      const run=async()=>{
      let adoption = await editor.adoptEditorCandidate(candidate, requestId);
      if (!adoption) {
        const output = await saveWorkEditorCandidate(
          client,
          candidate,
          requestId,
        );
        adoption = {
          status: output.currentMatches ? "adopted" : "saved-not-synced",
        };
      }
      return adoption;
      };
      const adoption=await withEditorCandidateSave(candidate,requestId,()=>review.save(requestId),run);
      if (alive.current) {
        setSaved(true);
        setStatus(
          adoption.status === "adopted"
            ? "已保存，打开作品继续微调。"
            : "已保存，当前稿有新修改，未同步覆盖；请打开核对。",
        );
      }
    } catch (cause) {
      if (alive.current)
        setError(
          cause instanceof Error
            ? cause.message
            : "采纳尚未确认，恢复将使用原请求。",
        );
    } finally {
      if (alive.current) setBusy(false);
    }
  }
  return (
    <article className="space-y-3 rounded-xl border border-border bg-surface p-4">
      <div className="min-w-0 space-y-1">
        <h4 className="font-medium">
          {kind === "article" ? "文章候选" : "图文候选"}
        </h4>
        <p className="break-words text-sm text-muted-foreground">
          {document.title || "未命名作品"}
        </p>
      </div>
      {review.pending&&!saved&&!busy&&<p className="text-sm text-muted-foreground">原采用请求待核对，请继续恢复原请求。</p>}
      <div className="flex flex-wrap gap-2">
        <Dialog open={expanded} onOpenChange={setExpanded}>
          <DialogTrigger asChild><Button size="sm" variant="outline">预览候选</Button></DialogTrigger>
          <DialogContent className="flex max-h-[calc(100dvh-2rem)] flex-col overflow-y-auto sm:max-w-5xl">
            <DialogTitle>{kind === "article" ? "文章候选预览" : "图文候选预览"}</DialogTitle>
            <DialogDescription>查看完整内容，关闭预览后采纳。</DialogDescription>
            {expanded && <AssistedWorkSelection review={review}/>}
            {expanded && <NoteRelayEditor
              key={`${creationScopeKey(scope)}:${sourceVersionId}`}
              projectId={value.target.projectId}
              accountId={scope.accountId}
              outputId={member.outputId}
              sourceVersionId={sourceVersionId}
              platform={kind === "article" ? "wechat" : "rednote"}
              value={review.ready?review.document:document}
              readOnlyCandidate
              onLayoutChange={() => {}}
              onPreviewReady={() => setPreviewReady(true)}
            />}
          </DialogContent>
        </Dialog>
        <Button
          size="sm"
          disabled={!previewReady || !review.ready || busy || saved}
          onClick={() => void adopt()}
        >
          {busy
            ? "正在确认保存…"
            : error || review.pending
              ? "恢复原采纳请求"
              : `采纳${kind === "article" ? "文章" : "图文"}`}
        </Button>
        <Link
          className="self-center text-sm text-primary underline"
          href={path}
        >
          打开{kind === "article" ? "文章" : "图文"}
        </Link>
      </div>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {status ? (
        <p role="status" className="text-sm text-success">
          {status}
        </p>
      ) : null}
    </article>
  );
}
