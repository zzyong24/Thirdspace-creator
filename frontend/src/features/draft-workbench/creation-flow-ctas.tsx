"use client";

import * as React from "react";
import { GitBranch, Search, Upload, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { useDraftChatRequest } from "./draft-chat-request";
import { uploadFileToProject } from "./upload-to-project";

// T-730：恢复可选“先梳理观点”入口；它不是写稿前置，用户仍可直接进入稿面。
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
      // 出现在当前项目的「创作素材」(materialLinks 已挂本项目)。
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
      <span className="text-xs font-medium text-foreground">先准备创作素材</span>

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
              : "上传 / 管理素材"}
      </Button>

      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-7 gap-1.5 text-xs"
        onClick={() =>
          openChat({
            // [T-265] 死链修:原 functionKey="research.gather_material" 不在 ALL_CHAT_TOOL_NAMES →
            // forcedTool 恒 undefined(空点)。对话搜素材的真工具是 material.gather,对齐它,第0步强制调。
            functionKey: "material.gather",
            prefill:
              "围绕这条内容的主题,联网搜集一批可用素材(案例、数据、金句),给出来源。",
            autoSend: true,
          })
        }
      >
        <Search className="size-3.5" />
        联网找资料
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
              "这次内容需要先梳理复杂观点。请基于当前项目生成可选论点骨架，先给候选，等我明确采纳后再用于写稿。",
            autoSend: true,
          })
        }
      >
        <GitBranch className="size-3.5" />
        先梳理观点（可选）
      </Button>
      <span className="text-[11px] text-text-subtle">
        复杂观点可先梳理；已有完整逐字稿或简单短口播可直接写稿
      </span>
    </section>
  );
}
