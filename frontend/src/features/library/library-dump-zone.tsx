"use client";

/**
 * 库页统一倾倒场([T-063d] 库融合深度版 · 北极星 SPEC §3)—— /library 所有 tab 常驻的
 * 单一入口:拖入/粘贴/点选任意东西,按内容自动分流,落对库:
 *
 *   - 二进制文件(图/视频/音频/PDF…)→ **素材流**:照抄 ammo-dump-zone 的
 *     createUpload → PUT 字节 → completeUpload(不挂项目 = 通用素材),确定性归类标签
 *     (classifyFile → assignTagsBestEffort)+ fire-and-forget asset.classify 排队;
 *   - 纯文本/URL/.md/.txt → **知识流**:复用 knowledge-intake 内核
 *     (classifyKnowledgeText → 确认门卡片 → createKnowledgeEntry);
 *   - 输入以「记一条经验」开头,或点「记经验」按钮 → **Copilot 深链预填**
 *     (copilotDeepLink;经验走对话 + 裁决台 T-062a,不在页内做经验表单)。
 *
 * 分流判定自动(文件:文本类 MIME/后缀 → 知识流,二进制 → 素材流;粘贴文本 → 知识流),
 * 结果在暂存卡/确认卡上显示且**可改道**(「这是素材/这是知识」切换,
 * data-slot="library-dump-route-toggle";二进制无法客户端取文本 → 知识道禁用,诚实不装)。
 *
 * 铁律 [gate-F2]:失败内联错误、原始输入/暂存保留供重试;AI 只产候选,确认门后才落库;
 * 落库成功 router.refresh 并提示落进了哪个 tab。
 */

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Inbox } from "lucide-react";

import { client } from "@/lib/contract-client";
import { copilotDeepLink } from "@/features/copilot/copilot-deeplink";
import { assignTagsBestEffort } from "@/features/draft-workbench/ammo-dump-zone";
import {
  type Classification,
  type KnowledgeType,
  KnowledgeClassifyCard,
  KnowledgeManualForm,
  TEXT_FILE_RE,
  classifyKnowledgeText,
  createKnowledgeEntry,
  knowledgeButtonCls,
  knowledgeInputCls,
  readTextFile,
} from "@/features/knowledge/knowledge-intake";
import { classifyFile } from "@/features/production/classify-asset";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// 分流判定
// ---------------------------------------------------------------------------

export type DumpRoute = "asset" | "knowledge";

/** 文件的自动分流:文本类(MIME text/* 或 .md/.txt)→ 知识流;二进制 → 素材流。 */
export function autoRouteForFile(file: File): DumpRoute {
  return isTextReadable(file) ? "knowledge" : "asset";
}

/** 客户端能否诚实读出文本(改道到知识流的前提;二进制不装能读)。 */
export function isTextReadable(file: File): boolean {
  return TEXT_FILE_RE.test(file.name) || file.type.toLowerCase().startsWith("text/");
}

interface StagedFile {
  readonly key: string;
  readonly file: File;
  readonly route: DumpRoute;
  readonly textReadable: boolean;
  /** 素材流的确定性归类标签(展示用,与 ammo-dump 同一 classifyFile 规则表)。 */
  readonly tags: readonly string[];
  readonly phase: "staged" | "uploading" | "error";
}

// ---------------------------------------------------------------------------
// 素材流内核(照抄 ammo-dump-zone 的上传链,唯一差异:不挂项目 = 通用素材)
// ---------------------------------------------------------------------------

async function uploadGeneralAsset(file: File): Promise<void> {
  const mimeType = file.type || "application/octet-stream";
  const { assetType, tags } = classifyFile(file.name, mimeType);
  const upload = (await client.createUpload({
    params: undefined,
    query: undefined,
    body: {
      assetType,
      mimeType,
      fileSize: Math.max(1, file.size),
      // 原名保真;不带 projectId → 通用素材(落 inbox/,同全局上传按钮)。
      fileName: file.name,
    },
  })) as unknown as { uploadId: string; uploadUrl: string };
  if (!upload.uploadUrl.startsWith("mock://")) {
    const put = await fetch(upload.uploadUrl, {
      method: "PUT",
      headers: { "content-type": mimeType },
      body: file,
    });
    if (!put.ok) throw new Error(`PUT ${put.status}`);
  }
  const asset = (await client.completeUpload({
    params: { uploadId: upload.uploadId },
    query: undefined,
    body: { name: file.name },
  })) as unknown as { id: string };
  if (asset?.id) {
    await assignTagsBestEffort(asset.id, tags);
    // AI 归类排队慢跑(未配视觉模型 → runner 诚实跳过)。
    void client
      .createAITask({
        params: undefined,
        query: undefined,
        body: { taskType: "asset.classify", inputData: { assetId: asset.id } },
      })
      .catch(() => undefined);
  }
}

// ---------------------------------------------------------------------------
// 组件
// ---------------------------------------------------------------------------

const EXPERIENCE_PREFIX = "记一条经验";

export function LibraryDumpZone() {
  const router = useRouter();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const seqRef = React.useRef(0);

  const [content, setContent] = React.useState("");
  // 文本流的分流道(默认知识;可改道「这是素材」→ 文本存成 .txt 素材文件)。
  const [textRoute, setTextRoute] = React.useState<DumpRoute>("knowledge");
  const [staged, setStaged] = React.useState<ReadonlyArray<StagedFile>>([]);
  const [dragActive, setDragActive] = React.useState(false);
  const [busy, setBusy] = React.useState<
    "idle" | "classifying" | "saving" | "uploading"
  >("idle");
  // 内联错误(非 toast):任一流失败都落这,输入/暂存保留 [gate-F2]。
  const [error, setError] = React.useState<string | null>(null);
  // 知识流确认门卡片(AI 判的候选;人确认才落库)。
  const [card, setCard] = React.useState<Classification | null>(null);
  const [manualOpen, setManualOpen] = React.useState(false);
  // 落点提示(role=status):成功后告诉用户东西落进了哪个 tab。
  const [notice, setNotice] = React.useState<string | null>(null);

  const trimmed = content.trim();
  const isExperience = trimmed.startsWith(EXPERIENCE_PREFIX);
  // 记经验 = Copilot 深链预填(只预填不发送,T-060① 范式;经验在裁决台 T-062a 裁决)。
  const experienceHref = copilotDeepLink(
    "experience",
    undefined,
    undefined,
    isExperience ? trimmed : "记一条经验:",
  );

  const resetText = React.useCallback(() => {
    setContent("");
    setCard(null);
    setManualOpen(false);
    setTextRoute("knowledge");
  }, []);

  // -- 文件进场:自动分流后进暂存卡(确认门,不直接落库) -----------------------
  const stageFiles = React.useCallback((files: ReadonlyArray<File>) => {
    if (files.length === 0) return;
    setNotice(null);
    setError(null);
    setStaged((prev) => [
      ...prev,
      ...files.map((file) => {
        const textReadable = isTextReadable(file);
        return {
          key: `dump-${seqRef.current++}-${file.name}`,
          file,
          route: autoRouteForFile(file),
          textReadable,
          tags: classifyFile(file.name, file.type || "").tags,
          phase: "staged" as const,
        };
      }),
    ]);
  }, []);

  // -- 改道:暂存卡上切「素材/知识」(二进制的知识道禁用) ----------------------
  const rerouteStaged = React.useCallback((key: string, route: DumpRoute) => {
    setStaged((prev) =>
      prev.map((s) =>
        s.key === key && (route === "asset" || s.textReadable)
          ? { ...s, route, phase: "staged" }
          : s,
      ),
    );
  }, []);

  // -- 暂存确认:素材道走上传链;知识道读文本并入输入区(再走归类确认门) --------
  const confirmStaged = React.useCallback(() => {
    if (busy !== "idle" || staged.length === 0) return;
    setBusy("uploading");
    setError(null);
    void (async () => {
      let uploaded = 0;
      let failed = 0;
      // 知识道:读文本进输入区(与 knowledge-dump 拖入 .md/.txt 同语义)。
      const toRead = staged.filter((s) => s.route === "knowledge");
      if (toRead.length > 0) {
        try {
          const texts = await Promise.all(toRead.map((s) => readTextFile(s.file)));
          setContent((prev) =>
            [prev.trim(), ...texts.map((t) => t.trim())].filter(Boolean).join("\n\n"),
          );
          setStaged((prev) => prev.filter((s) => s.route !== "knowledge"));
        } catch {
          setError("读取文本文件失败,请重试或改道成素材上传。");
        }
      }
      // 素材道:逐个上传(失败标红保留,可重试/改道)。
      const toUpload = staged.filter((s) => s.route === "asset");
      for (const item of toUpload) {
        setStaged((prev) =>
          prev.map((s) => (s.key === item.key ? { ...s, phase: "uploading" } : s)),
        );
        try {
          await uploadGeneralAsset(item.file);
          uploaded += 1;
          setStaged((prev) => prev.filter((s) => s.key !== item.key));
        } catch {
          failed += 1;
          setStaged((prev) =>
            prev.map((s) => (s.key === item.key ? { ...s, phase: "error" } : s)),
          );
        }
      }
      if (failed > 0) {
        setError(`有 ${failed} 个文件上传失败,已保留在暂存区,可重试或移除。`);
      }
      if (uploaded > 0) {
        setNotice(
          `已入库 ${uploaded} 个素材,在「素材」tab 可见${
            toRead.length > 0 ? ";文本文件已读入下方输入区,归类后进知识库" : ""
          }。`,
        );
        router.refresh();
      } else if (toRead.length > 0 && failed === 0) {
        setNotice("文本文件已读入下方输入区,点「归类」确认后进「知识」tab。");
      }
      setBusy("idle");
    })();
  }, [busy, staged, router]);

  // -- 知识流:归类 → 确认门卡片 ------------------------------------------------
  const handleClassify = React.useCallback(async () => {
    if (!trimmed || busy !== "idle") return;
    setBusy("classifying");
    setError(null);
    setNotice(null);
    try {
      setCard(await classifyKnowledgeText(trimmed));
    } catch (err) {
      setError(err instanceof Error ? err.message : "归类失败,请重试或手动补录。");
    } finally {
      setBusy("idle");
    }
  }, [trimmed, busy]);

  // -- 知识流:确认门「存入知识库」→ knowledge.create → refresh -----------------
  const handleSaveKnowledge = React.useCallback(async () => {
    if (!card || busy !== "idle") return;
    const title = card.title.trim();
    if (!title) return;
    setBusy("saving");
    setError(null);
    try {
      await createKnowledgeEntry(title, card.knowledgeType, trimmed);
      resetText();
      setNotice(`已存入知识库「${title}」,在「知识」tab 可见。`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "存入知识库失败,请重试。");
    } finally {
      setBusy("idle");
    }
  }, [card, busy, trimmed, resetText, router]);

  // -- 手动补录(归类失败/不走 AI 的兜底,能力自 knowledge-dump-zone 并入) ------
  const handleManualSave = React.useCallback(
    async (title: string, knowledgeType: KnowledgeType) => {
      if (busy !== "idle") return;
      setBusy("saving");
      setError(null);
      try {
        await createKnowledgeEntry(title, knowledgeType, trimmed);
        resetText();
        setNotice(`已存入知识库「${title}」,在「知识」tab 可见。`);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "存入知识库失败,请重试。");
      } finally {
        setBusy("idle");
      }
    },
    [busy, trimmed, resetText, router],
  );

  // -- 文本改道「这是素材」:文本包成 .txt 走素材上传链 --------------------------
  const handleSaveTextAsAsset = React.useCallback(async () => {
    if (!trimmed || busy !== "idle") return;
    setBusy("uploading");
    setError(null);
    try {
      const firstLine = trimmed.split("\n", 1)[0]!.slice(0, 40).trim() || "粘贴文本";
      const file = new File([trimmed], `${firstLine}.txt`, { type: "text/plain" });
      await uploadGeneralAsset(file);
      resetText();
      setNotice(`已把文本存成素材文件「${firstLine}.txt」,在「素材」tab 可见。`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "存为素材失败,请重试。");
    } finally {
      setBusy("idle");
    }
  }, [trimmed, busy, resetText, router]);

  return (
    <section
      data-slot="library-dump-zone"
      aria-label="库统一倾倒场"
      className="flex flex-col gap-2 rounded-card border border-dashed border-border bg-surface-subtle/50 p-3"
    >
      <div className="flex items-center gap-2 text-xs text-text-subtle">
        <Inbox className="size-4 shrink-0" aria-hidden="true" />
        任何东西都往这倒:文件进素材库、文字/链接进知识库、「记一条经验」去对话 —— 自动分流,确认后落库
      </div>

      {/* 隐藏文件选择(点「选文件」触发;拖拽/粘贴文件同入口)。 */}
      <input
        ref={inputRef}
        type="file"
        multiple
        data-slot="library-dump-file-input"
        aria-hidden="true"
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = "";
          stageFiles(files);
        }}
      />

      <textarea
        data-slot="library-dump-input"
        aria-label="倒入文本、URL,或拖入任意文件"
        placeholder="粘贴文本 / URL,或把图片、视频、PDF、.md/.txt 直接拖进来;以「记一条经验」开头则转去对话记录…"
        value={content}
        onChange={(e) => {
          setContent(e.target.value);
          setNotice(null);
        }}
        onDragOver={(e) => {
          if ((e.dataTransfer?.types ?? []).includes("Files")) {
            e.preventDefault();
            setDragActive(true);
          }
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={(e) => {
          const files = Array.from(e.dataTransfer?.files ?? []);
          if (files.length === 0) return; // 纯文本拖拽走原生行为
          e.preventDefault();
          setDragActive(false);
          stageFiles(files);
        }}
        onPaste={(e) => {
          // 粘贴板里的文件(截图等)→ 暂存分流;纯文本走原生粘贴(知识流)。
          const files = Array.from(e.clipboardData?.files ?? []);
          if (files.length > 0) {
            e.preventDefault();
            stageFiles(files);
          }
        }}
        rows={3}
        data-drag-active={dragActive ? "true" : "false"}
        className={cn(
          knowledgeInputCls,
          "min-h-20 resize-y",
          dragActive && "border-brand bg-brand-soft/30",
        )}
      />

      {/* 内联错误(非 toast):任一流失败都落这,输入/暂存保留 [gate-F2]。 */}
      {error ? (
        <p
          data-slot="library-dump-error"
          role="alert"
          className="rounded-md border border-destructive/40 bg-destructive/5 px-2.5 py-1.5 text-[12px] text-destructive"
        >
          {error}
        </p>
      ) : null}

      {/* 落点提示:成功后告诉用户落进了哪个 tab。 */}
      {notice ? (
        <p
          data-slot="library-dump-notice"
          role="status"
          className="rounded-md border border-border bg-surface px-2.5 py-1.5 text-[12px] text-muted-foreground"
        >
          {notice}
        </p>
      ) : null}

      {/* 文件暂存卡:自动分流结果 + 可改道(素材/知识切换)+ 确认入库。 */}
      {staged.length > 0 ? (
        <div
          data-slot="library-dump-stage"
          className="flex flex-col gap-1.5 rounded-md border border-border bg-surface p-2.5"
        >
          <p className="text-[11px] text-muted-foreground">
            自动分流结果(可改道;二进制文件读不出文本,只能进素材库)
          </p>
          <ul className="flex flex-col gap-1">
            {staged.map((s) => (
              <li
                key={s.key}
                data-slot="library-dump-staged-file"
                data-route={s.route}
                data-phase={s.phase}
                className="flex flex-wrap items-center gap-2 rounded-control border border-border bg-surface-subtle/60 px-2.5 py-1 text-[11px]"
              >
                <span className="min-w-0 flex-1 truncate text-foreground">
                  {s.file.name}
                </span>
                {s.route === "asset"
                  ? s.tags.map((t) => (
                      <span
                        key={t}
                        className="shrink-0 rounded-full bg-brand-soft px-1.5 py-0.5 text-[10px] text-brand"
                      >
                        {t}
                      </span>
                    ))
                  : null}
                {/* 分流切换:这是素材 / 这是知识。 */}
                <div
                  data-slot="library-dump-route-toggle"
                  role="group"
                  aria-label={`「${s.file.name}」的分流`}
                  className="flex shrink-0 overflow-hidden rounded-control border border-border"
                >
                  <button
                    type="button"
                    data-route-option="asset"
                    aria-pressed={s.route === "asset"}
                    disabled={busy !== "idle"}
                    onClick={() => rerouteStaged(s.key, "asset")}
                    className={cn(
                      "px-2 py-0.5 text-[10px]",
                      s.route === "asset"
                        ? "bg-brand text-brand-foreground"
                        : "bg-surface text-muted-foreground hover:text-foreground",
                    )}
                  >
                    这是素材
                  </button>
                  <button
                    type="button"
                    data-route-option="knowledge"
                    aria-pressed={s.route === "knowledge"}
                    disabled={busy !== "idle" || !s.textReadable}
                    title={s.textReadable ? undefined : "二进制文件读不出文本,只能进素材库"}
                    onClick={() => rerouteStaged(s.key, "knowledge")}
                    className={cn(
                      "border-l border-border px-2 py-0.5 text-[10px] disabled:opacity-40",
                      s.route === "knowledge"
                        ? "bg-brand text-brand-foreground"
                        : "bg-surface text-muted-foreground hover:text-foreground",
                    )}
                  >
                    这是知识
                  </button>
                </div>
                {s.phase === "uploading" ? (
                  <span className="size-3 shrink-0 animate-spin rounded-full border-2 border-brand border-t-transparent" />
                ) : s.phase === "error" ? (
                  <span className="shrink-0 text-destructive">上传失败</span>
                ) : null}
                <button
                  type="button"
                  data-slot="library-dump-staged-remove"
                  aria-label={`移除「${s.file.name}」`}
                  disabled={busy !== "idle"}
                  onClick={() =>
                    setStaged((prev) => prev.filter((x) => x.key !== s.key))
                  }
                  className="shrink-0 text-muted-foreground hover:text-foreground"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
          <div>
            <button
              type="button"
              data-slot="library-dump-stage-confirm"
              disabled={busy !== "idle"}
              onClick={confirmStaged}
              className={cn(
                knowledgeButtonCls,
                "bg-brand text-brand-foreground hover:bg-brand/90",
              )}
            >
              {busy === "uploading" ? "入库中…" : "确认入库"}
            </button>
          </div>
        </div>
      ) : null}

      {/* 动作行:文本分流切换 + 主动作(随分流道变)+ 选文件 + 记经验深链。 */}
      <div className="flex flex-wrap items-center gap-2">
        {trimmed.length > 0 && !isExperience ? (
          <div
            data-slot="library-dump-route-toggle"
            role="group"
            aria-label="文本的分流"
            className="flex overflow-hidden rounded-control border border-border"
          >
            <button
              type="button"
              data-route-option="knowledge"
              aria-pressed={textRoute === "knowledge"}
              disabled={busy !== "idle"}
              onClick={() => setTextRoute("knowledge")}
              className={cn(
                "px-2 py-1 text-[11px]",
                textRoute === "knowledge"
                  ? "bg-brand text-brand-foreground"
                  : "bg-surface text-muted-foreground hover:text-foreground",
              )}
            >
              这是知识
            </button>
            <button
              type="button"
              data-route-option="asset"
              aria-pressed={textRoute === "asset"}
              disabled={busy !== "idle"}
              onClick={() => setTextRoute("asset")}
              className={cn(
                "border-l border-border px-2 py-1 text-[11px]",
                textRoute === "asset"
                  ? "bg-brand text-brand-foreground"
                  : "bg-surface text-muted-foreground hover:text-foreground",
              )}
            >
              这是素材
            </button>
          </div>
        ) : null}

        {isExperience ? (
          // 以「记一条经验」开头 → 主动作变成 Copilot 深链(带上整段输入预填)。
          <Link
            data-slot="library-dump-experience-go"
            href={experienceHref}
            className={cn(
              knowledgeButtonCls,
              "bg-brand text-brand-foreground hover:bg-brand/90",
            )}
          >
            去对话记这条经验
          </Link>
        ) : textRoute === "asset" ? (
          <button
            type="button"
            data-slot="library-dump-save-as-asset"
            disabled={busy !== "idle" || trimmed.length === 0}
            onClick={() => void handleSaveTextAsAsset()}
            className={cn(
              knowledgeButtonCls,
              "bg-brand text-brand-foreground hover:bg-brand/90",
            )}
          >
            {busy === "uploading" ? "存入中…" : "存为素材文件"}
          </button>
        ) : (
          <button
            type="button"
            data-slot="library-dump-classify"
            disabled={busy !== "idle" || trimmed.length === 0}
            onClick={() => void handleClassify()}
            className={cn(
              knowledgeButtonCls,
              "bg-brand text-brand-foreground hover:bg-brand/90",
            )}
          >
            {busy === "classifying" ? "归类中…" : "归类"}
          </button>
        )}

        <button
          type="button"
          data-slot="library-dump-pick-files"
          disabled={busy !== "idle"}
          onClick={() => inputRef.current?.click()}
          className={cn(
            knowledgeButtonCls,
            "border border-border bg-surface text-foreground hover:bg-surface-subtle",
          )}
        >
          选文件
        </button>
        {!isExperience && textRoute === "knowledge" ? (
          <button
            type="button"
            data-slot="library-dump-manual-entry"
            aria-expanded={manualOpen}
            disabled={busy !== "idle"}
            onClick={() => setManualOpen((prev) => !prev)}
            className={cn(
              knowledgeButtonCls,
              "border border-border bg-surface text-foreground hover:bg-surface-subtle",
            )}
          >
            手动补录
          </button>
        ) : null}
        {/* 记经验常驻次入口(经验不走页内表单 —— 对话 + 裁决台)。 */}
        {!isExperience ? (
          <Link
            data-slot="library-dump-experience-link"
            href={experienceHref}
            className={cn(
              knowledgeButtonCls,
              "border border-border bg-surface text-foreground hover:bg-surface-subtle",
            )}
          >
            记经验
          </Link>
        ) : null}
      </div>

      {/* 知识流确认门卡片(沿用 knowledge-classify-* slot):type/title 可改,确认才落库。 */}
      {card ? (
        <KnowledgeClassifyCard
          card={card}
          busy={busy === "saving"}
          onChange={setCard}
          onSave={() => void handleSaveKnowledge()}
          onCancel={() => setCard(null)}
        />
      ) : null}

      {/* 手动补录次入口(沿用 knowledge-manual-* slot)。 */}
      {manualOpen && !isExperience && textRoute === "knowledge" ? (
        <KnowledgeManualForm
          busy={busy !== "idle"}
          onSave={(title, knowledgeType) => void handleManualSave(title, knowledgeType)}
        />
      ) : null}
    </section>
  );
}
