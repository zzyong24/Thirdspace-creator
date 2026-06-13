/**
 * `StatusBadge` is the canonical project/output status pill. It is used by
 * Projects, Publishing Center, Project Overview, and Tasks.
 *
 * Server component: no interactivity required.
 */

import * as React from "react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

import type {
  OutputStatus,
  ProjectStatus,
  PublicationStatus,
  TaskStatus,
} from "@/types/domain";

export type StatusBadgeStatus =
  | ProjectStatus
  | OutputStatus
  | PublicationStatus
  | TaskStatus
  | "candidate"
  | "validated"
  | "discarded"
  | "approved"
  | "drafting"
  | "in_review"
  | "archived";

export interface StatusBadgeProps {
  readonly status: StatusBadgeStatus;
  readonly className?: string;
  readonly children?: React.ReactNode;
}

const STATUS_LABEL: Readonly<Record<StatusBadgeStatus, string>> = {
  active: "进行中",
  paused: "已暂停",
  archived: "已归档",
  completed: "已完成",
  drafting: "草稿中",
  recording: "录制中",
  editing: "剪辑中",
  ready: "已就绪",
  published: "已发布",
  draft: "草稿",
  scheduled: "已排期",
  removed: "已下架",
  failed: "失败",
  todo: "待办",
  in_progress: "进行中",
  done: "已完成",
  blocked: "阻塞",
  candidate: "候选",
  validated: "已验证",
  discarded: "已弃用",
  approved: "已通过",
  in_review: "审核中",
};

const TONE_CLASS: Readonly<Record<StatusBadgeStatus, string>> = {
  active: "bg-brand-soft text-brand",
  paused: "bg-warning-soft text-warning",
  archived: "bg-surface-subtle text-muted-foreground",
  completed: "bg-success-soft text-success",
  drafting: "bg-surface-subtle text-muted-foreground",
  recording: "bg-info-soft text-info",
  editing: "bg-info-soft text-info",
  ready: "bg-success-soft text-success",
  published: "bg-success-soft text-success",
  draft: "bg-surface-subtle text-muted-foreground",
  scheduled: "bg-info-soft text-info",
  removed: "bg-surface-subtle text-muted-foreground",
  failed: "bg-danger-soft text-danger",
  todo: "bg-surface-subtle text-muted-foreground",
  in_progress: "bg-info-soft text-info",
  done: "bg-success-soft text-success",
  blocked: "bg-danger-soft text-danger",
  candidate: "bg-info-soft text-info",
  validated: "bg-success-soft text-success",
  discarded: "bg-surface-subtle text-muted-foreground",
  approved: "bg-success-soft text-success",
  in_review: "bg-warning-soft text-warning",
};

export function StatusBadge({ status, className, children }: StatusBadgeProps) {
  const label = STATUS_LABEL[status];
  return (
    <Badge
      role="status"
      aria-label={label}
      data-slot="status-badge"
      data-status={status}
      variant="outline"
      className={cn("border-transparent", TONE_CLASS[status], className)}
    >
      {children ?? label}
    </Badge>
  );
}
