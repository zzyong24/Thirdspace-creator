"use client";

/**
 * 稿面弹药区·拖放倾倒场(T-057②,用户原话:「把素材都拖进去…比如截图啊、录屏啊,
 * 它就能自动给我归类,放到合适的位置」)。
 *
 * 上传链(T-055d/e;[T-076] 制作页 UploadDropzone 已随 production 前端退役,本区是唯一倾倒场):
 *   拖入/点选/⌘V → presign(项目目录+原名保真)→ PUT 字节 → complete →
 *   materialLinks 挂本项目 → 确定性归类标签(classifyFile → taxonomy)→
 *   fire-and-forget asset.classify(配了视觉模型则 AI 增强)→ refresh 出现在弹药卡。
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { UploadCloud } from "lucide-react";

import { client } from "@/lib/contract-client";
// [T-076] classify-asset 随 production 前端退役迁入稿面(弹药区是它的消费点)。
import { classifyFile } from "./classify-asset";
// [T-146] 上传链抽成共用函数(AmmoDumpZone 与稿面「＋上传素材」CTA 共用,不重造)。
import { uploadFileToProject } from "./upload-to-project";
import { cn } from "@/lib/utils";

interface PendingFile {
  readonly key: string;
  readonly name: string;
  readonly phase: "uploading" | "error";
  readonly tags: readonly string[];
}

// [T-063d] 导出给库页统一倾倒场(features/library/library-dump-zone)复用 ——
// 通用素材上传同样要打确定性归类标签;标签是增强,失败不阻断入库。
export async function assignTagsBestEffort(
  assetId: string,
  tagNames: readonly string[],
): Promise<void> {
  if (tagNames.length === 0) return;
  try {
    const listed = (await client.listTags({
      params: undefined,
      query: { page: 1, pageSize: 200 },
      body: undefined,
    })) as unknown as ReadonlyArray<{ id: string; name: string }>;
    const byName = new Map(
      (Array.isArray(listed) ? listed : []).map((t) => [t.name, t.id]),
    );
    const tagIds: string[] = [];
    for (const name of tagNames) {
      const hit = byName.get(name);
      if (hit) {
        tagIds.push(hit);
        continue;
      }
      const created = (await client.createTag({
        params: undefined,
        query: undefined,
        body: { name, kind: "asset-usage" },
      })) as unknown as { id: string };
      tagIds.push(created.id);
    }
    await client.assignTags({
      params: undefined,
      query: undefined,
      body: { entityType: "asset", entityId: assetId, tagIds },
    });
  } catch {
    /* 标签是增强,失败不阻断入库 */
  }
}

export function AmmoDumpZone({ projectId }: { projectId: string }) {
  const router = useRouter();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = React.useState(false);
  const [pending, setPending] = React.useState<ReadonlyArray<PendingFile>>([]);
  const seqRef = React.useRef(0);
  const busyRef = React.useRef(false);

  const uploadOne = React.useCallback(
    async (key: string, file: File) => {
      try {
        // [T-146] 上传链走共用 uploadFileToProject(createUpload → PUT → complete →
        //   materialLink → 标签 → asset.classify/material.extract),两处同源不重造。
        await uploadFileToProject(projectId, file);
        setPending((prev) => prev.filter((p) => p.key !== key));
      } catch {
        setPending((prev) =>
          prev.map((p) => (p.key === key ? { ...p, phase: "error" } : p)),
        );
      }
    },
    [projectId],
  );

  const enqueue = React.useCallback(
    (files: ReadonlyArray<File>) => {
      if (files.length === 0 || busyRef.current) return;
      const queued = files.map((file) => ({
        file,
        item: {
          key: `ammo-${seqRef.current++}-${file.name}`,
          name: file.name,
          phase: "uploading" as const,
          tags: classifyFile(file.name, file.type || "").tags,
        },
      }));
      setPending((prev) => [...prev, ...queued.map((q) => q.item)]);
      busyRef.current = true;
      void (async () => {
        for (const q of queued) {
          await uploadOne(q.item.key, q.file);
        }
        busyRef.current = false;
        router.refresh();
      })();
    },
    [uploadOne, router],
  );

  return (
    <div data-slot="ammo-dump-zone" className="flex flex-col gap-1.5">
      <input
        ref={inputRef}
        type="file"
        multiple
        data-slot="ammo-dump-input"
        aria-hidden="true"
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = "";
          enqueue(files);
        }}
      />
      <div
        role="button"
        tabIndex={0}
        aria-label="拖拽、点击或粘贴上传素材到弹药区"
        data-slot="ammo-dump-area"
        data-drag-active={dragActive ? "true" : "false"}
        onDragOver={(e) => {
          e.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragActive(false);
          enqueue(Array.from(e.dataTransfer.files ?? []));
        }}
        onPaste={(e) => {
          const files = Array.from(e.clipboardData?.files ?? []);
          if (files.length > 0) {
            e.preventDefault();
            enqueue(files);
          }
        }}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        className={cn(
          "flex items-center justify-center gap-2 rounded-card border border-dashed px-3.5 py-3 text-xs transition-colors cursor-pointer",
          dragActive
            ? "border-brand bg-brand-soft/40 text-brand"
            : "border-border bg-surface-subtle/50 text-text-subtle hover:border-brand/50 hover:text-muted-foreground",
        )}
      >
        <UploadCloud className="size-4 shrink-0" aria-hidden="true" />
        把截图、录屏、封面直接丢进来 —— 原名存进项目文件夹,自动归类,变成这条内容的弹药
      </div>
      {pending.length > 0 ? (
        <ul data-slot="ammo-dump-pending" className="flex flex-col gap-1">
          {pending.map((p) => (
            <li
              key={p.key}
              data-phase={p.phase}
              className="flex items-center gap-2 rounded-control border border-border bg-surface px-2.5 py-1 text-[11px]"
            >
              <span className="min-w-0 flex-1 truncate text-foreground">
                {p.name}
              </span>
              {p.tags.map((t) => (
                <span
                  key={t}
                  className="shrink-0 rounded-full bg-brand-soft px-1.5 py-0.5 text-[10px] text-brand"
                >
                  {t}
                </span>
              ))}
              {p.phase === "uploading" ? (
                <span className="size-3 shrink-0 animate-spin rounded-full border-2 border-brand border-t-transparent" />
              ) : (
                <span className="shrink-0 text-destructive">上传失败</span>
              )}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
