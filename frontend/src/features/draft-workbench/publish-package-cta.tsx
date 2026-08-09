"use client";

/**
 * `publish-package-cta.tsx` — 稿面发布包区的「生成发布物料」入口(T-350b)。
 *
 * 复用稿面对话驱动范式(同 blind-predict-row):点击 → 先 flush 保存编辑器最新整稿(据最新版
 * 生成物料,非 DB 旧版)→ 确保 content_output 挂点(纯站内项目先自愈铸一个,与登记/盲预测同款)
 * → `openChat` **自动发**发布物料话术进右栏常驻编导对话(functionKey=publish.package +
 * selection=content_output + autoSend)。编导 dispatch publish.platform_adapt(单平台抖音)→
 * 右栏 ChatPublishPackageCard 渲 标题/简介/标签/封面文案/审核结论 → 「采纳」物化 Publication →
 * 稿面发布包回填。
 *
 * 平台固定抖音、审核复用 platform.adapt 内嵌 SOP —— 本入口不做生成/审核逻辑,只把话术送进对话。
 */

import * as React from "react";
import { Eye, Megaphone } from "lucide-react";

import { client } from "@/lib/contract-client";
import { useDraftChatRequest } from "./draft-chat-request";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

// 预填话术 —— 编导据此优先调 publish.package(单平台抖音,生成后自动过审核)。
const PUBLISH_PACKAGE_PREFILL =
  "为这条内容生成抖音发布物料:标题 + 简介 + 标签,生成后过一遍发布合规审核,我要采纳进发布包。";

type Phase = "idle" | "opening" | "error";

export interface PublishPackageViewData {
  readonly publicationId: string;
  readonly platform: string;
  readonly status: string;
  readonly publishedAt: string | null;
  readonly title: string;
  readonly description: string;
  readonly tags: ReadonlyArray<string>;
  readonly hasCover: boolean;
  readonly coverAssetId: string | null;
}

function platformName(platform: string): string {
  if (platform === "douyin") return "抖音";
  if (platform === "xiaohongshu") return "小红书";
  if (platform === "bilibili") return "哔哩哔哩";
  return platform || "发布平台";
}

function PublishPackageViewer({
  publishPack,
}: {
  readonly publishPack: PublishPackageViewData;
}) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          type="button"
          size="sm"
          variant="outline"
          data-slot="publish-package-view"
          className="shrink-0 gap-1.5"
        >
          <Eye className="size-3.5" aria-hidden="true" />
          查看发布物料
        </Button>
      </DialogTrigger>
      <DialogContent
        data-slot="publish-package-dialog"
        className="max-h-[80vh] max-w-lg overflow-y-auto"
      >
        <DialogHeader>
          <DialogTitle>发布物料</DialogTitle>
          <DialogDescription>
            已保存到当前项目，刷新页面后仍可查看。
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3 text-[13px]">
          <div className="flex items-center gap-2">
            <span className="rounded-md bg-surface-subtle px-2 py-0.5 text-[11px] text-text-subtle">
              {platformName(publishPack.platform)}
            </span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-[11px] font-medium text-text-subtle">标题</span>
            <p className="whitespace-pre-wrap font-medium leading-relaxed text-foreground">
              {publishPack.title || "暂无标题"}
            </p>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-[11px] font-medium text-text-subtle">正文</span>
            <p className="whitespace-pre-wrap leading-relaxed text-muted-foreground">
              {publishPack.description || "暂无正文"}
            </p>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-[11px] font-medium text-text-subtle">标签</span>
            {publishPack.tags.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {publishPack.tags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-md bg-surface-subtle px-2 py-0.5 text-[11px] text-text-subtle"
                  >
                    # {tag}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-[12px] text-muted-foreground">暂无标签</p>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function PublishPackageCta({
  projectId,
  projectTitle,
  outputId,
  publishPack = null,
}: {
  readonly projectId: string;
  readonly projectTitle: string;
  /** 项目现有 ContentOutput;null = 还没有(发起时先铸一个,与登记表单同款)。 */
  readonly outputId: string | null;
  /** 已采纳并持久化的发布物料；存在时原位提供查看，不再重复显示生成入口。 */
  readonly publishPack?: PublishPackageViewData | null;
}) {
  const { openChat, flushSave } = useDraftChatRequest();
  const [phase, setPhase] = React.useState<Phase>("idle");
  const cancelledRef = React.useRef(false);
  React.useEffect(
    () => () => {
      cancelledRef.current = true;
    },
    [],
  );

  const openCopilot = React.useCallback(() => {
    if (phase === "opening") return;
    setPhase("opening");
    void (async () => {
      try {
        // 先 flush 保存编辑器在途未落库的最新整稿(dirty 才真存,saved 则 no-op)。
        await flushSave();
        if (cancelledRef.current) return;
        // 纯站内项目可能还没铸挂点 → 先自愈铸一个(与登记/盲预测同款),让 selection 有真 id。
        let subjectId = outputId;
        if (!subjectId) {
          const created = (await client.createOutput({
            params: { projectId },
            query: undefined,
            body: { title: projectTitle || "主内容" },
          })) as { id: string };
          subjectId = created.id;
        }
        if (cancelledRef.current) return;
        // 自动发进常驻 rail —— functionKey=publish.package(置顶发布物料工具),
        // selection=content_output(免编导索要 id/标题),autoSend 直接发话术。
        openChat({
          functionKey: "publish.package",
          prefill: PUBLISH_PACKAGE_PREFILL,
          autoSend: true,
          selection: {
            kind: "content_output",
            id: subjectId,
            title: projectTitle,
          },
        });
        if (!cancelledRef.current) setPhase("idle");
      } catch {
        if (!cancelledRef.current) setPhase("error");
      }
    })();
  }, [phase, outputId, projectId, projectTitle, openChat, flushSave]);

  if (publishPack) {
    return (
      <div
        data-slot="draft-publish-package-cta"
        className="mt-2 flex items-center justify-between gap-2"
      >
        <p className="text-[11.5px] leading-snug text-text-subtle">
          发布物料已生成并保存，可随时查看。
        </p>
        <PublishPackageViewer publishPack={publishPack} />
      </div>
    );
  }

  return (
    <div
      data-slot="draft-publish-package-cta"
      className="mt-2 flex items-center justify-between gap-2"
    >
      <p className="text-[11.5px] leading-snug text-text-subtle">
        标题 + 简介一键生成，自动过发布合规审核，采纳后写进发布包。
      </p>
      <Button
        type="button"
        size="sm"
        variant="outline"
        data-slot="publish-package-generate"
        disabled={phase === "opening"}
        onClick={openCopilot}
        className="shrink-0 gap-1.5"
      >
        <Megaphone className="size-3.5" aria-hidden="true" />
        {phase === "opening"
          ? "打开对话中…"
          : phase === "error"
            ? "重试生成物料"
            : "生成发布物料"}
      </Button>
    </div>
  );
}
