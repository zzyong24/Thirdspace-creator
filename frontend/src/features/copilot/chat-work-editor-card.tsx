"use client";
import * as React from "react";
import Link from "next/link";
import {
  workEditorCandidate,
  workEditorContext,
  type WorkEditorCandidate,
} from "@creatoros/contract";
import { Button } from "@/components/ui/button";
import {
  useCreationClient,
  useCreationScope,
  creationScopeKey,
} from "@/lib/creation-workspace-scope";
import { NoteRelayEditor } from "@/features/reference-editors/noterelay/noterelay-editor";
import {
  useDraftChatRequest,
  editorCanonical,
  editorDigest,
  type EditorAdoption,
  type EditorSaveCandidate,
} from "@/features/draft-workbench/draft-chat-request";
/** UI owner operation; same body/key retry follows the existing owner receipt. */
export async function saveWorkEditorCandidate(
  client: any,
  result: EditorSaveCandidate,
  requestId: string,
) {
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
}: {
  result: unknown;
  toolCallId: string;
}) {
  const client = useCreationClient(),
    scope = useCreationScope();
  const editor = useDraftChatRequest();
  const parsed = workEditorCandidate.safeParse(result),
    context = workEditorContext.safeParse(result);
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
      let saved = await editor.adoptEditorCandidate(
        value,
        await editorDigest(key),
      );
      if (!saved) {
        if (candidate?.kind === "native_scene")
          throw Error("请打开对应视频工作台后采纳。");
        const output = await saveWorkEditorCandidate(
          client,
          value,
          await editorDigest(key),
        );
        saved = {
          status: output.currentMatches ? "adopted" : "saved-not-synced",
          versionId: output.receipt.versionId,
        };
      }
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
      {value.error ? (
        <p role="alert" className="text-destructive">
          {value.error}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="outline"
          disabled={busy || !candidate}
          onClick={() => void preview()}
        >
          {busy ? "处理中…" : expanded ? "重新预览" : "预览改动"}
        </Button>
        <Button
          size="sm"
          disabled={
            busy ||
            !candidate ||
            !value.apply ||
            !expanded ||
            !previewReady ||
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
          ) : (
            <NoteRelayEditor
              key={`${creationScopeKey(scope)}:${key}`}
              projectId={value.target.projectId}
              accountId={scope.accountId}
              outputId={value.target.outputId}
              sourceVersionId={key}
              platform={candidate.kind === "article" ? "wechat" : "rednote"}
              value={candidate.document}
              readOnlyCandidate
              onPreviewReady={() => setPreviewReady(true)}
              onLayoutChange={() => {}}
            />
          )}
        </div>
      )}
      {error ? (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      ) : null}
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
  );
}
