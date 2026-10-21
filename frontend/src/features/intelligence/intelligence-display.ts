import type { RadarItemDetail,RadarItemRow,RadarRun,RadarRunStatus,RadarSource } from "./intelligence-workbench-types";
export function compactNumber(value: number | null): string {
  if (value === null) return "未知";
  return new Intl.NumberFormat("zh-CN", {
    notation: value >= 10_000 ? "compact" : "standard",
    maximumFractionDigits: 1,
  }).format(value);
}

export function dateLabel(value: string | null): string {
  if (!value) return "时间未知";
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return "时间未知";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function sourceTypeLabel(type: RadarSource["type"]): string {
  return {
    creator_profile: "博主主页",
    favorites_folder: "我的收藏",
    web: "网页",
    rss: "RSS",
    darkhorse_query: "黑马关键词",
  }[type];
}

export function runStatusLabel(status: RadarRunStatus | null): string {
  if (!status) return "尚未同步";
  return {
    queued: "排队中",
    running: "同步中",
    succeeded_with_items: "同步完成",
    succeeded_no_change: "无新增",
    partial: "部分完成",
    blocked: "需要处理",
    failed: "同步失败",
  }[status];
}

export function runResultMessage(
  run: RadarRun,
  sourceType?: RadarSource["type"],
): string {
  if (run.status === "succeeded_with_items") {
    return `同步完成：扫描 ${run.scannedCount} 条，新增 ${run.newCount} 条，更新 ${run.updatedCount} 条。`;
  }
  if (run.status === "succeeded_no_change") {
    return `同步完成：扫描 ${run.scannedCount} 条，本次没有新增或变化。`;
  }
  if (run.status === "blocked") {
    if (run.errorCode === "LOGIN_REQUIRED") {
      if (sourceType === "darkhorse_query") {
        return "同步暂停：热点宝授权已失效。请点击「热点宝授权」，授权成功后系统会自动重试。";
      }
      return "同步暂停：采集账号登录已失效。请点击「重新登录」扫码，成功后系统会自动重试。";
    }
    if (run.errorCode === "CAPTCHA") {
      return "同步暂停：页面要求完成验证码，请在登录保管库处理后重试。";
    }
    return `同步暂停：${run.errorCode ?? "来源需要处理"}。`;
  }
  if (run.status === "failed") {
    if (run.errorCode === "FOLDER_MISSING") {
      return "同步失败：当前采集账号中找不到已绑定的收藏夹。请重新添加该收藏来源。";
    }
    if (run.errorCode === "NO_VALID_RESPONSE") {
      return "同步失败：本次没有取得有效作品列表，未把它误记成 0 条。请稍后重试。";
    }
    if (run.errorCode === "RESPONSE_SHAPE_CHANGED") {
      return "同步失败：来源页面结构发生变化，未把它误记成 0 条。";
    }
    return `同步失败：${run.errorCode ?? "未知错误"}。`;
  }
  if (run.status === "partial") {
    return `同步部分完成：新增 ${run.newCount} 条，失败 ${run.failedCount} 条。`;
  }
  return `${runStatusLabel(run.status)}。`;
}

export function isRunActive(status: RadarRunStatus | null | undefined): boolean {
  return status === "queued" || status === "running";
}

export function transcriptLabel(status: RadarItemDetail["transcript"]["status"]) {
  const labels: Record<RadarItemDetail["transcript"]["status"], string> = {
    not_requested: "尚未转写",
    queued: "排队中",
    running: "转写中",
    done: "已完成",
    skipped: "已跳过",
    failed: "转写失败",
    blocked: "需要处理",
    unknown: "状态未知",
  };
  return Object.hasOwn(labels, status) ? labels[status] : "状态未知";
}

export function progressLabel(
  state: RadarItemRow["progressState"],
): string | null {
  if (!state) return null;
  return {
    pending_transcript: "待转写",
    transcript_processing: "提取中",
    pending_topic: "待生成选题",
    topic_generating: "生成中",
    awaiting_confirmation: "待确认",
    converted: "已转为选题",
    attention: "需要处理",
  }[state];
}

