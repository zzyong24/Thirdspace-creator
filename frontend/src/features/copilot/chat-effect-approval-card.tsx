"use client";

import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

export const COPILOT_EFFECT_TOOL_NAMES = new Set([
  "topic.generate",
  "topic.enrich",
  "script.hooks",
  "script.draft",
  "publish.package",
  "project.transcribe",
  "material.screenshot",
  "web.read",
  "material.generate",
  "cover.generate",
  "calibration.diagnose",
  "review.analyze",
  "review.script",
  "brief.fill",
  "positioning.generate",
  "knowledge.distill",
  "intelligence.douyin.share",
]);

export function effectApprovalCopy(toolName: string, input: unknown): {
  title: string;
  expectedCost: string;
  summary: string;
} {
  const record =
    input && typeof input === "object"
      ? (input as Record<string, unknown>)
      : {};
  if (toolName === "material.generate") {
    const kind = record.kind === "video" ? "视频" : "图片";
    return {
      title: `确认生成 1 次${kind}素材？`,
      expectedCost: `预计消耗：1 次${kind}生成额度（实际以渠道结算为准）`,
      summary:
        typeof record.prompt === "string"
          ? record.prompt.trim().slice(0, 180)
          : "未提供生成说明",
    };
  }
  if (toolName === "intelligence.douyin.share") {
    const transcribe = record.action === "archive_and_transcribe";
    return {
      title: transcribe ? "确认归档并转写这条抖音内容？" : "确认归档这条抖音内容？",
      expectedCost: transcribe
        ? "预计消耗：1 次 ASR 转写额度；归档本身不扣 AI 额度"
        : "预计消耗：0 AI 额度（仅持久归档）",
      summary:
        typeof record.shareInput === "string"
          ? record.shareInput.trim().slice(0, 180)
          : "未提供分享链接",
    };
  }
  if (toolName === "web.read") {
    return {
      title: "确认读取网页正文并保存待确认素材？",
      expectedCost: "预计消耗：0 AI 额度（会创建一条待确认正文素材）",
      summary:
        typeof record.url === "string"
          ? record.url.trim().slice(0, 180)
          : "未提供网页地址",
    };
  }
  const titleByTool: Record<string, string> = {
    "material.screenshot": "确认抓取网页截图并保存待确认素材？",
    "project.transcribe": "确认发起作品转写？",
    "cover.generate": "确认生成 1 次封面候选？",
    "review.script": "确认发起 1 次文案审核？",
    "script.draft": "确认生成 1 次整稿候选？",
    "publish.package": "确认生成 1 次发布物料候选？",
  };
  return {
    title: titleByTool[toolName] ?? `确认执行 ${toolName}？`,
    expectedCost: "预计消耗：1 次模型或持久化操作（实际以渠道结算为准）",
    summary: JSON.stringify(input ?? {}).slice(0, 180),
  };
}

export function ChatEffectApprovalCard({
  toolName,
  input,
  approvalId,
  denied = false,
  onApprove,
  onDeny,
}: {
  toolName: string;
  input: unknown;
  approvalId: string;
  denied?: boolean;
  onApprove?: (approvalId: string) => void;
  onDeny?: (approvalId: string) => void;
}) {
  const copy = effectApprovalCopy(toolName, input);
  if (denied) {
    return (
      <div
        data-slot="copilot-effect-approval-denied"
        className="mt-1 rounded-md border border-border bg-surface-subtle px-3 py-2 text-sm text-muted-foreground"
      >
        已拒绝，未执行、未扣费、未落库。
      </div>
    );
  }
  return (
    <div
      data-slot="copilot-effect-approval"
      data-tool-name={toolName}
      className="mt-1 rounded-lg border border-warning/40 bg-warning/5 p-3"
    >
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground">{copy.title}</p>
          <p className="mt-1 text-xs text-muted-foreground">{copy.expectedCost}</p>
          <p className="mt-1 break-words text-xs text-text-subtle">{copy.summary}</p>
        </div>
      </div>
      <div className="mt-3 flex justify-end gap-2">
        <Button size="sm" variant="outline" onClick={() => onDeny?.(approvalId)}>
          拒绝
        </Button>
        <Button size="sm" onClick={() => onApprove?.(approvalId)}>
          确认执行
        </Button>
      </div>
    </div>
  );
}
