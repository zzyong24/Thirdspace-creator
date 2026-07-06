"use client";

import * as React from "react";
import { Search, Sparkles, Upload, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { useDraftChatRequest } from "./draft-chat-request";
import { uploadFileToProject } from "./upload-to-project";

// [T-127] 稿面「创作流引导」CTA 行 —— 把原本只藏在 Copilot 里的「素材搜集 / 立论点」两步显性化到
// 稿面(选题卡与脚本区之间),对应用户拍板的创作链:选题 → 搜素材(联网)→ 立论点(基于素材)→
// 写脚本。点一下即把话术自动发进右栏常驻编导对话(复用 T-108 openChat/autoSend,不开全局弹层)。
//
// 半自动(决策①):按钮 = 用户一键授权,后台真跑(素材搜集走 T-126 真联网检索;论点走
// planning.thesis 论点树)。不全自动(省额度、人出判断),不去别页手动(内嵌当前稿面)。
// 论点树采纳后经 CreativeContext.thesisBrief 自动喂进写脚本 facet(SEAM 已通,T-127d),脚本有据可依。
//
// [T-146] 最前面加「＋上传素材」:PR/接商单场景先把自己的 PDF/Word/MD 资料上传进「当前项目」
// 弹药库(最高优先级素材)。上传链复用 AmmoDumpZone 的同款 uploadFileToProject(createUpload →
// PUT → complete → materialLink → 后端抽取/优先级/AI 注入,T-146 后端已做),不重造。

// 上传接受的文件类型:图/视频 + 常见文档(PR 资料多为 PDF/Word/MD/纯文本)。
const UPLOAD_ACCEPT = "image/*,video/*,.pdf,.doc,.docx,.md,.txt";

export function CreationFlowCtas({ projectId }: { projectId: string }) {
  const { openChat } = useDraftChatRequest();
  const router = useRouter();
  const inputRef = React.useRef<HTMLInputElement>(null);
  // 上传态:idle → uploading(转圈)→ done(短暂✓)/ error(短暂✗),给用户反馈。
  const [phase, setPhase] = React.useState<
    "idle" | "uploading" | "done" | "error"
  >("idle");

  const handleFiles = React.useCallback(
    async (files: ReadonlyArray<File>) => {
      if (files.length === 0) return;
      setPhase("uploading");
      let ok = true;
      for (const file of files) {
        try {
          await uploadFileToProject(projectId, file);
        } catch {
          ok = false;
        }
      }
      setPhase(ok ? "done" : "error");
      // 出现在弹药卡(materialLinks 已挂本项目)。
      router.refresh();
      // 2s 后回 idle(反馈短促,不长期占位)。
      window.setTimeout(() => setPhase("idle"), 2000);
    },
    [projectId, router],
  );

  const uploading = phase === "uploading";

  return (
    <section
      data-slot="creation-flow-ctas"
      aria-label="创作流引导"
      className="flex flex-wrap items-center gap-2 rounded-card border border-border bg-surface-subtle px-3 py-2"
    >
      <span className="text-xs text-text-subtle">写之前先备料:</span>

      {/* [T-146] ＋上传素材(最高优先级):把自己的 PDF/Word/MD 资料上传进当前项目弹药库。 */}
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={UPLOAD_ACCEPT}
        data-slot="creation-flow-upload-input"
        aria-hidden="true"
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = "";
          void handleFiles(files);
        }}
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={uploading}
        data-slot="creation-flow-upload-cta"
        className="h-7 gap-1.5 text-xs"
        onClick={() => inputRef.current?.click()}
      >
        {uploading ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : (
          <Upload className="size-3.5" />
        )}
        {phase === "uploading"
          ? "上传中…"
          : phase === "done"
            ? "已上传 ✓"
            : phase === "error"
              ? "上传失败,重试"
              : "＋上传素材"}
      </Button>

      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-7 gap-1.5 text-xs"
        onClick={() =>
          openChat({
            functionKey: "research.gather_material",
            prefill:
              "围绕这条内容的主题,联网搜集一批可用素材(案例、数据、金句),给出来源。",
            autoSend: true,
          })
        }
      >
        <Search className="size-3.5" />
        搜素材(联网)
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-7 gap-1.5 text-xs"
        onClick={() =>
          openChat({
            functionKey: "planning.thesis",
            prefill:
              "基于选题、我的定位和已搜到的素材,帮我立一棵论点树:核心论点 + 支撑/证据/反驳分支。",
            autoSend: true,
          })
        }
      >
        <Sparkles className="size-3.5" />
        立论点
      </Button>
      <span className="text-[11px] text-text-subtle">
        —— 先上传/搜素材、再基于素材立论点,写出来的脚本才有据可依
      </span>
    </section>
  );
}
