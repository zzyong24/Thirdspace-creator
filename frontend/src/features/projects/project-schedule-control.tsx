"use client";

import * as React from "react";
import { CalendarDays, LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CreatorDatePicker } from "@/components/ui/creator-date-picker";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { client } from "@/lib/contract-client";
import type { ContentCalendarEntryResource } from "@creatoros/backend/modules/content-calendar";

export type ProjectScheduleSummary = Pick<
  ContentCalendarEntryResource,
  "id" | "plannedDate"
> & {
  readonly projectId: string;
  readonly status: "planned" | "missed";
};

export interface ProjectScheduleControlProps {
  readonly accountId: string | null;
  readonly groupId?: string | null;
  readonly projectId: string;
  readonly projectTitle: string;
  readonly referenceDateKey: string;
  readonly schedule: ProjectScheduleSummary | null;
  readonly eligible: boolean;
}

function formatPlannedDate(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return value;
  return `${Number(match[2])}月${Number(match[3])}日`;
}

function mutationErrorMessage(action: "save" | "delete"): string {
  return action === "delete"
    ? "取消排期失败，请稍后重试。"
    : "排期失败，请稍后重试。";
}

export function ProjectScheduleControl({
  accountId,
  groupId,
  projectId,
  projectTitle,
  referenceDateKey,
  schedule,
  eligible,
}: ProjectScheduleControlProps) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const [draftDate, setDraftDate] = React.useState(
    schedule?.plannedDate ?? "",
  );
  const [pendingAction, setPendingAction] = React.useState<
    "save" | "delete" | null
  >(null);
  const [error, setError] = React.useState<string | null>(null);
  const [deleteError, setDeleteError] = React.useState<string | null>(null);

  if (!eligible) return null;

  const pending = pendingAction !== null;
  const hasSchedule = schedule !== null;
  const triggerLabel = hasSchedule
    ? `修改${projectTitle}排期，当前 ${formatPlannedDate(schedule.plannedDate)}`
    : `为${projectTitle}排期`;

  function handleOpenChange(nextOpen: boolean) {
    if (pending) return;
    setOpen(nextOpen);
    if (nextOpen) {
      setDraftDate(schedule?.plannedDate ?? "");
      setError(null);
    }
  }

  async function save() {
    if (pending || draftDate.length === 0) return;
    if (draftDate < referenceDateKey) {
      setError("请选择今天或之后的日期。");
      return;
    }

    setError(null);
    setPendingAction("save");
    try {
      if (schedule) {
        await client.updateEntry({
          params: { entryId: schedule.id },
          query: undefined,
          body: { plannedDate: draftDate },
        });
      } else if(groupId) {
        await client.createGroupEntry({params:{groupId},query:undefined,body:{projectId,plannedDate:draftDate,targetAccountId:null}});
      } else {
        if(!accountId)throw new Error("请选择账号组");
        await client.createEntry({
          params: { accountId },
          query: undefined,
          body: { projectId, plannedDate: draftDate },
        });
      }
      setOpen(false);
      router.refresh();
    } catch {
      // 不做乐观回显：保留浮层与 draft，让用户可直接重试。
      setError(mutationErrorMessage("save"));
    } finally {
      setPendingAction(null);
    }
  }

  async function remove() {
    if (!schedule || pending) return;
    setDeleteError(null);
    setPendingAction("delete");
    try {
      await client.deleteEntry({
        params: { entryId: schedule.id },
        query: undefined,
        body: undefined,
      });
      setDeleteOpen(false);
      setOpen(false);
      router.refresh();
    } catch {
      // 原排期仍由 server props 显示；Dialog 保持，允许重试。
      setDeleteError(mutationErrorMessage("delete"));
    } finally {
      setPendingAction(null);
    }
  }

  return (
    <>
      <Popover open={open} onOpenChange={handleOpenChange}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={triggerLabel}
            aria-expanded={open}
            data-slot="project-schedule-trigger"
            data-scheduled={hasSchedule ? "true" : "false"}
            className={
              hasSchedule
                ? "inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-control border border-brand/45 bg-brand-soft px-2.5 text-xs font-semibold text-brand transition-colors hover:border-brand/65 hover:bg-brand/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                : "inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-control border border-brand/35 bg-surface px-2.5 text-xs font-semibold text-brand transition-colors hover:border-brand/55 hover:bg-brand-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
            }
          >
            <CalendarDays aria-hidden="true" className="size-3.5" />
            {hasSchedule
              ? `改期 · ${formatPlannedDate(schedule.plannedDate)}`
              : "排期"}
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="end"
          sideOffset={8}
          data-testid="project-schedule-popover"
          className="w-72 gap-3 p-3"
        >
          <PopoverHeader>
            <PopoverTitle>{hasSchedule ? "调整发布排期" : "安排发布日期"}</PopoverTitle>
            <PopoverDescription className="line-clamp-2">
              {projectTitle}
            </PopoverDescription>
          </PopoverHeader>

          <label className="flex flex-col gap-1.5 text-xs font-medium text-foreground">
            计划发布日期
            <CreatorDatePicker
              label="计划发布日期"
              minDate={referenceDateKey}
              value={draftDate}
              disabled={pending}
              onChange={(value) => {
                setDraftDate(value??"");
                setError(null);
              }}
              className="tabular-nums"
            />
          </label>

          <p className="text-[11px] leading-relaxed text-muted-foreground">
            可选择今天或未来日期。排期只用于规划和提醒，不会自动发布。
          </p>

          {error ? (
            <p role="alert" className="text-xs leading-relaxed text-destructive">
              {error}
            </p>
          ) : null}

          <div className="flex items-center justify-between gap-2 border-t border-border pt-2.5">
            {hasSchedule ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={pending}
                onClick={() => {
                  setDeleteError(null);
                  setDeleteOpen(true);
                }}
                className="text-destructive hover:bg-destructive/10 hover:text-destructive"
              >
                取消排期
              </Button>
            ) : (
              <span />
            )}
            <Button
              type="button"
              size="sm"
              disabled={pending || draftDate.length === 0}
              onClick={save}
            >
              {pendingAction === "save" ? (
                <>
                  <LoaderCircle aria-hidden="true" className="animate-spin" />
                  保存中…
                </>
              ) : hasSchedule ? (
                "保存改期"
              ) : (
                "确认排期"
              )}
            </Button>
          </div>
        </PopoverContent>
      </Popover>

      <Dialog
        open={deleteOpen}
        onOpenChange={(nextOpen) => {
          if (pending) return;
          setDeleteOpen(nextOpen);
          if (!nextOpen) setDeleteError(null);
        }}
      >
        <DialogContent data-testid="project-schedule-delete-dialog">
          <DialogHeader>
            <DialogTitle>取消这项排期？</DialogTitle>
            <DialogDescription>
              {projectTitle} 将从发布日历和首页提醒中移除，项目内容不会被删除。
            </DialogDescription>
          </DialogHeader>
          {deleteError ? (
            <p role="alert" className="text-xs text-destructive">
              {deleteError}
            </p>
          ) : null}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => setDeleteOpen(false)}
            >
              保留排期
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={pending}
              onClick={remove}
            >
              {pendingAction === "delete" ? (
                <>
                  <LoaderCircle aria-hidden="true" className="animate-spin" />
                  取消中…
                </>
              ) : (
                "确认取消排期"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
