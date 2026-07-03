"use client";

/**
 * `UploadDropzone` — 制作工作台「素材倾倒场」(T-055e,SPEC §6;前身 L5 单文件上传区)。
 *
 * 用户拍板②:「把所有素材全部丢进去…帮我好好存储并保存这些原始素材,同时帮我归类」。
 *   - **拖放一切,多文件批量**:drop/点选/粘贴(⌘V 截图)全收,逐个顺序上传(每文件独立态);
 *   - **上传即三件事**:①保真落盘(T-055d 目录规则:projects/<safe>-<id6>/素材/原名)
 *     ②确定性归类(classify-asset 规则表 → assetType + 用途标签落 taxonomy)
 *     ③挂当前项目(material_links)+ 进全局素材库;
 *   - 每张已倒入卡:原文件名 + 归类标签 + 「在 Finder 显示」(T-055d reveal route)。
 *
 * 归类是 DB 标签、不移动文件(SPEC §6.2);标签写入 best-effort(taxonomy 失败不影响
 * 上传成败,卡片诚实显示「标签未写入」)。AI 增强层(asset.classify)是 T-055h。
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { FolderOpen, UploadCloud } from "lucide-react";

import { SectionCard } from "@/components/project/section-card";
import { client } from "@/lib/contract-client";
import { classifyFile } from "./classify-asset";

interface DumpedItem {
  readonly key: string;
  readonly name: string;
  readonly phase: "queued" | "uploading" | "done" | "error";
  readonly tags: readonly string[];
  readonly tagsWritten: boolean;
  readonly assetId?: string;
  readonly reason?: string;
}

export interface UploadDropzoneProps {
  /** 当前项目 id — 上传成功后把新 asset 绑定到它(用料链)。 */
  readonly projectId: string;
  /** 项目已解析才允许绑定;缺失 → 禁用并显式说明(诚实)。 */
  readonly canBind: boolean;
}

/** 确保标签存在并绑到 asset(list 查同名 → 缺则 create → assign)。best-effort。 */
async function assignTagsToAsset(
  assetId: string,
  tagNames: readonly string[],
): Promise<boolean> {
  if (tagNames.length === 0) return true;
  try {
    const listed = (await client.listTags({
      params: undefined,
      query: { page: 1, pageSize: 200 },
      body: undefined,
    })) as unknown as ReadonlyArray<{ id: string; name: string }>;
    const existing = new Map(
      (Array.isArray(listed) ? listed : []).map((t) => [t.name, t.id]),
    );
    const tagIds: string[] = [];
    for (const name of tagNames) {
      const hit = existing.get(name);
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
    return true;
  } catch {
    return false;
  }
}

export function UploadDropzone({ projectId, canBind }: UploadDropzoneProps) {
  const router = useRouter();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = React.useState(false);
  const [items, setItems] = React.useState<ReadonlyArray<DumpedItem>>([]);
  const busyRef = React.useRef(false);
  const [busy, setBusy] = React.useState(false);
  const seqRef = React.useRef(0);

  const patchItem = React.useCallback(
    (key: string, patch: Partial<DumpedItem>) => {
      setItems((prev) =>
        prev.map((it) => (it.key === key ? { ...it, ...patch } : it)),
      );
    },
    [],
  );

  /** 单文件全链:presign(带项目目录+原名)→ PUT 字节 → complete → 挂项目 → 打标签。 */
  const uploadOne = React.useCallback(
    async (key: string, file: File) => {
      const mimeType = file.type || "application/octet-stream";
      const { assetType, tags } = classifyFile(file.name, mimeType);
      patchItem(key, { phase: "uploading" });
      try {
        const upload = (await client.createUpload({
          params: undefined,
          query: undefined,
          body: {
            assetType,
            mimeType,
            fileSize: Math.max(1, file.size),
            // [T-055d SPEC §7.1] 落项目目录 projects/<safe>-<id6>/素材/,原名保真。
            projectId,
            fileName: file.name,
          },
        })) as unknown as { uploadId: string; uploadUrl: string };

        // [T-049 B5 同款修复] local-fs 的 uploadUrl 是**相对路径**(/api/v1/blob/…)——
        // 只要不是 mock:// 就必须真 PUT 字节,否则 complete 时 stat ENOENT。
        if (!upload.uploadUrl.startsWith("mock://")) {
          const put = await fetch(upload.uploadUrl, {
            method: "PUT",
            headers: { "content-type": mimeType },
            body: file,
          });
          if (!put.ok) {
            patchItem(key, { phase: "error", reason: `上传失败（${put.status}）` });
            return;
          }
        }

        const asset = (await client.completeUpload({
          params: { uploadId: upload.uploadId },
          query: undefined,
          body: { name: file.name },
        })) as unknown as { id: string };

        // 挂当前项目(用料链;与 Assets「附到项目」同一门)。
        if (canBind && asset?.id) {
          await client.createMaterialLink({
            params: undefined,
            query: undefined,
            body: {
              projectId,
              entityType: "asset",
              entityId: asset.id,
              role: "clip",
              stage: "production",
            },
          });
        }
        // 确定性归类标签(best-effort:失败不影响上传成败,卡片诚实标注)。
        const tagsWritten = asset?.id
          ? await assignTagsToAsset(asset.id, tags)
          : false;
        patchItem(key, {
          phase: "done",
          assetId: asset?.id,
          tagsWritten,
        });
      } catch {
        patchItem(key, { phase: "error", reason: "上传或绑定出错" });
      }
    },
    [projectId, canBind, patchItem],
  );

  /** 批量入队,逐个顺序跑(不并发压 blob route);全部完成后 refresh 一次。 */
  const enqueueFiles = React.useCallback(
    (files: ReadonlyArray<File>) => {
      if (files.length === 0 || busyRef.current) return;
      const queued = files.map((file) => {
        const key = `dump-${seqRef.current++}-${file.name}`;
        const { tags } = classifyFile(file.name, file.type || "");
        return { file, item: { key, name: file.name, phase: "queued" as const, tags, tagsWritten: false } };
      });
      setItems((prev) => [...prev, ...queued.map((q) => q.item)]);
      busyRef.current = true;
      setBusy(true);
      void (async () => {
        for (const q of queued) {
          await uploadOne(q.item.key, q.file);
        }
        busyRef.current = false;
        setBusy(false);
        router.refresh();
      })();
    },
    [uploadOne, router],
  );

  const revealAsset = React.useCallback(async (assetId: string) => {
    try {
      await fetch("/api/v1/local/reveal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assetId }),
      });
    } catch {
      /* Finder 定位失败不阻断(卡片仍在) */
    }
  }, []);

  return (
    <div
      data-slot="upload-dropzone-region"
      data-testid="production-region"
      data-region="upload"
    >
      <SectionCard
        title="素材倾倒场"
        description="图片、录屏、封面…全部丢进来:保真落盘到项目文件夹 + 自动归类 + 挂进本项目"
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          data-slot="upload-dropzone-input"
          aria-hidden="true"
          className="hidden"
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            e.target.value = ""; // reset so re-selecting the same file fires change again
            enqueueFiles(files);
          }}
        />
        <div
          data-slot="upload-dropzone-area"
          data-drag-active={dragActive ? "true" : "false"}
          data-disabled={!canBind ? "true" : "false"}
          role="button"
          tabIndex={canBind && !busy ? 0 : -1}
          aria-disabled={!canBind}
          aria-label="拖拽、点击或粘贴上传素材(支持多文件)"
          onDragOver={(e) => {
            e.preventDefault();
            if (canBind && !busy) setDragActive(true);
          }}
          onDragLeave={() => setDragActive(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragActive(false);
            if (!canBind || busy) return;
            enqueueFiles(Array.from(e.dataTransfer.files ?? []));
          }}
          onPaste={(e) => {
            // [T-055e SPEC §6.1] 粘贴倒入(⌘V 截图)。
            if (!canBind || busy) return;
            const files = Array.from(e.clipboardData?.files ?? []);
            if (files.length > 0) {
              e.preventDefault();
              enqueueFiles(files);
            }
          }}
          onClick={() => {
            if (canBind && !busy) inputRef.current?.click();
          }}
          onKeyDown={(e) => {
            if ((e.key === "Enter" || e.key === " ") && canBind && !busy) {
              e.preventDefault();
              inputRef.current?.click();
            }
          }}
          className={
            "flex flex-col items-center justify-center gap-2 rounded-card border border-dashed px-4 py-8 text-center transition-colors " +
            (!canBind
              ? "cursor-not-allowed border-border bg-surface-subtle opacity-60"
              : dragActive
                ? "cursor-copy border-brand bg-brand-soft/40"
                : "cursor-pointer border-border bg-surface-subtle hover:border-brand/60")
          }
        >
          <span
            aria-hidden="true"
            className="inline-flex size-9 items-center justify-center rounded-full border border-brand/40 bg-brand-soft text-brand"
          >
            <UploadCloud className="size-5" strokeWidth={1.75} />
          </span>
          {busy ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <span className="size-3.5 animate-spin rounded-full border-2 border-brand border-t-transparent" />
              正在倒入 {items.filter((i) => i.phase !== "done" && i.phase !== "error").length} 个文件…
            </p>
          ) : (
            <>
              <p className="text-sm font-medium text-foreground">
                把素材全部丢进来 —— 拖拽 / 点击选择 / ⌘V 粘贴,支持多文件
              </p>
              <p className="text-[11px] text-muted-foreground">
                原始文件原名保存到本项目文件夹;图片/视频/音频/字幕/设计源文件都收
              </p>
            </>
          )}
        </div>

        {!canBind ? (
          <p
            data-slot="upload-dropzone-disabled-note"
            className="mt-2 text-[11px] text-muted-foreground"
          >
            该项目尚未进入制作阶段(无可绑定的 output),暂不能上传绑定。
          </p>
        ) : null}

        {items.length > 0 ? (
          <ul
            data-slot="dumped-items"
            aria-label="已倒入素材"
            className="mt-3 flex flex-col gap-1.5"
          >
            {items.map((it) => (
              <li
                key={it.key}
                data-slot="dumped-item"
                data-phase={it.phase}
                className="flex items-center gap-2 rounded-control border border-border bg-surface px-2.5 py-1.5"
              >
                <span className="min-w-0 flex-1 truncate text-xs text-foreground">
                  {it.name}
                </span>
                {it.tags.map((tag) => (
                  <span
                    key={tag}
                    data-slot="dumped-item-tag"
                    className="shrink-0 rounded-full bg-brand-soft px-2 py-0.5 text-[10px] font-medium text-brand"
                  >
                    {tag}
                  </span>
                ))}
                {it.phase === "done" && !it.tagsWritten && it.tags.length > 0 ? (
                  <span className="shrink-0 text-[10px] text-warning">
                    标签未写入
                  </span>
                ) : null}
                {it.phase === "uploading" ? (
                  <span className="size-3 shrink-0 animate-spin rounded-full border-2 border-brand border-t-transparent" />
                ) : it.phase === "error" ? (
                  <span className="shrink-0 text-[10px] text-destructive">
                    {it.reason}
                  </span>
                ) : it.phase === "done" ? (
                  <>
                    <span className="shrink-0 text-[10px] font-medium text-success">
                      已入库
                    </span>
                    {it.assetId ? (
                      <button
                        type="button"
                        data-slot="dumped-item-reveal"
                        aria-label={`在 Finder 显示 ${it.name}`}
                        onClick={() => void revealAsset(it.assetId!)}
                        className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground"
                      >
                        <FolderOpen className="size-3.5" aria-hidden="true" />
                      </button>
                    ) : null}
                  </>
                ) : (
                  <span className="shrink-0 text-[10px] text-text-subtle">
                    排队中
                  </span>
                )}
              </li>
            ))}
          </ul>
        ) : null}
      </SectionCard>
    </div>
  );
}
