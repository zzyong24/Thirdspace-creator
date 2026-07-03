"use client";

/**
 * `content-calendar-interactive-region.tsx` — Client islands for the 内容日历 / 发布节奏
 * surface (七步⑦ · §7.2), keyed by a PlatformAccount.
 *
 * needs-backend controls, each → its mapped contract op then `router.refresh()`:
 *  - `AddSlotForm` (新增计划) → `client.createEntry({ params:{accountId}, body:{ plannedAt } })`.
 *  - `EntryRow` 改期/备注 → `client.updateEntry`; 标记已发布 → `client.transitionEntry`;
 *    删除 → `client.deleteEntry`.
 *  - `CadenceEditor` → `client.upsertCadence({ params:{accountId}, body:{ frequency, preferredSlots } })`.
 *
 * read surfaces (server-fed via props, no client fetch): the entry grid renders each
 * slot by its real `status` enum (planned/published/missed); the 节奏达成率 badge + 断更
 * banner render from the `accounts.cadence.attainment` envelope (attainmentRatio % +
 * isLagging/gapDays "已断更 N 天").
 *
 * Determinism (C-5): every visible value comes from props or controlled local state
 * seeded from props; NO Date.now / Math.random / fetch in render or selectors. The
 * mutation seam mirrors the platform-account/monetization islands. `/calendar` is
 * annotated "暂不纳入视觉门禁" until the stage-12 re-baseline.
 */

import * as React from "react";
import { useRouter } from "next/navigation";

import { client } from "@/lib/contract-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { parseDouyinAwemeId, douyinVideoUrl } from "@/lib/douyin-link";
import type {
  ContentCalendarEntryResource,
  PublishingCadenceResource,
  CadenceAttainmentResource,
} from "@creatoros/backend/modules/content-calendar";

const FREQUENCIES = [
  "daily",
  "weekly",
  "biweekly",
  "monthly",
  "custom",
] as const;
type Frequency = (typeof FREQUENCIES)[number];

const FREQUENCY_LABELS: Record<string, string> = {
  daily: "每日",
  weekly: "每周",
  biweekly: "双周",
  monthly: "每月",
  custom: "自定义",
};

const STATUS_LABELS: Record<string, string> = {
  planned: "计划中",
  published: "已发布",
  missed: "已断更",
};

// Shared island mutation seam: a `pending` guard blocks concurrent writes; on success
// it calls router.refresh() so the server re-reads the persisted rows.
function useMutation() {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  const run = React.useCallback(
    (mutate: () => Promise<unknown>) => {
      if (pending) return;
      setPending(true);
      void (async () => {
        try {
          await mutate();
          router.refresh();
        } finally {
          setPending(false);
        }
      })();
    },
    [pending, router],
  );
  return { pending, run };
}

export function AddSlotForm({ accountId }: { readonly accountId: string }) {
  const { pending, run } = useMutation();
  const [plannedAt, setPlannedAt] = React.useState("");
  const [note, setNote] = React.useState("");

  const valid = plannedAt.trim().length > 0;

  function submit() {
    if (!valid) return;
    run(() =>
      client.createEntry({
        params: { accountId },
        query: undefined,
        body: {
          plannedAt: plannedAt.trim(),
          note: note.trim().length > 0 ? note.trim() : undefined,
        },
      }),
    );
  }

  return (
    <form
      data-testid="add-slot-form"
      className="flex w-full flex-wrap items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <Input
        aria-label="计划时间"
        placeholder="计划时间（ISO，如 2026-07-21T09:00:00.000Z）"
        value={plannedAt}
        onChange={(e) => setPlannedAt(e.target.value)}
        className="max-w-[20rem]"
      />
      <Input
        aria-label="备注"
        placeholder="备注（可空）"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        className="max-w-[14rem]"
      />
      <Button type="submit" disabled={pending || !valid} className="self-start">
        新增计划
      </Button>
    </form>
  );
}

export function EntryRow({
  entry,
}: {
  readonly entry: ContentCalendarEntryResource;
}) {
  const { pending, run } = useMutation();
  const [note, setNote] = React.useState(entry.note);
  const [plannedAt, setPlannedAt] = React.useState(entry.plannedAt);
  // [T-055h③/T-063c] 标记已发布可带链接:条目挂着 ContentOutput 时,粘抖音链接
  // 一并登记 publication(published + external_id 落库,幂等)。链接留空 = 只改
  // 日历状态(原行为);解析不出编号则不动状态、就地提示(不做假登记)。
  const [publishLink, setPublishLink] = React.useState("");
  const [linkError, setLinkError] = React.useState(false);

  function saveEdits() {
    const body: { plannedAt?: string; note?: string } = {};
    if (plannedAt.trim() !== entry.plannedAt && plannedAt.trim().length > 0) {
      body.plannedAt = plannedAt.trim();
    }
    if (note !== entry.note) body.note = note;
    if (Object.keys(body).length === 0) return;
    run(() =>
      client.updateEntry({
        params: { entryId: entry.id },
        query: undefined,
        body,
      }),
    );
  }

  function markPublished() {
    const link = publishLink.trim();
    const outputId = entry.contentOutputId;
    // 带链接 + 挂着 output → 先登记 publication 再改日历状态;链接解析失败就地
    // 提示并中止(状态不改,守「数据要真」)。
    if (link && outputId) {
      const awemeId = parseDouyinAwemeId(link);
      if (!awemeId) {
        setLinkError(true);
        return;
      }
      setLinkError(false);
      run(async () => {
        await client.registerPublishedPublication({
          params: { outputId },
          query: undefined,
          body: {
            platform: "douyin",
            externalId: awemeId,
            externalUrl: douyinVideoUrl(awemeId, link),
          },
        });
        return client.transitionEntry({
          params: { entryId: entry.id },
          query: undefined,
          body: { status: "published" },
        });
      });
      return;
    }
    run(() =>
      client.transitionEntry({
        params: { entryId: entry.id },
        query: undefined,
        body: { status: "published" },
      }),
    );
  }

  function remove() {
    run(() =>
      client.deleteEntry({
        params: { entryId: entry.id },
        query: undefined,
        body: undefined,
      }),
    );
  }

  return (
    <li
      data-testid="calendar-entry-row"
      data-entry-id={entry.id}
      data-status={entry.status}
      className="flex flex-col gap-2 rounded-md border border-border px-3 py-2 text-sm"
    >
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-2">
          <Badge
            variant={entry.status === "missed" ? "destructive" : "secondary"}
            className="text-[10px]"
          >
            {STATUS_LABELS[entry.status] ?? entry.status}
          </Badge>
          <span className="font-medium text-foreground">{entry.plannedAt}</span>
        </span>
        <span className="flex items-center gap-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={pending || entry.status === "published"}
            onClick={markPublished}
          >
            标记已发布
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={pending}
            onClick={remove}
          >
            删除
          </Button>
        </span>
      </div>
      {/* [T-055h③] 挂着 ContentOutput 的排期条目:标记已发布可带抖音链接,一并登记 publication。 */}
      {entry.contentOutputId && entry.status !== "published" ? (
        <div className="flex flex-col gap-1">
          <Input
            aria-label={`发布链接 ${entry.id}`}
            placeholder="抖音链接(可选)—— 填了会一并登记为已发布作品"
            value={publishLink}
            onChange={(e) => {
              setPublishLink(e.target.value);
              setLinkError(false);
            }}
            className="max-w-[36rem] text-xs"
          />
          {linkError ? (
            <p
              data-testid="calendar-publish-link-error"
              className="text-[11px] text-destructive"
            >
              没解析出视频编号 —— 短链请先打开复制完整地址(含 /video/编号),或直接粘视频编号。
            </p>
          ) : null}
        </div>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <Input
          aria-label={`改期 ${entry.id}`}
          value={plannedAt}
          onChange={(e) => setPlannedAt(e.target.value)}
          className="max-w-[20rem]"
        />
        <Input
          aria-label={`备注 ${entry.id}`}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className="max-w-[14rem]"
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={pending}
          onClick={saveEdits}
        >
          保存
        </Button>
      </div>
    </li>
  );
}

export function CadenceEditor({
  accountId,
  cadence,
}: {
  readonly accountId: string;
  readonly cadence: PublishingCadenceResource | null;
}) {
  const { pending, run } = useMutation();
  const [frequency, setFrequency] = React.useState<Frequency>(
    (cadence?.frequency as Frequency) ?? "weekly",
  );

  function save() {
    run(() =>
      client.upsertCadence({
        params: { accountId },
        query: undefined,
        body: {
          frequency,
          preferredSlots: cadence?.preferredSlots ?? [],
        },
      }),
    );
  }

  return (
    <form
      data-testid="cadence-editor"
      className="flex flex-wrap items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <span className="text-xs text-muted-foreground">发布节奏</span>
      <select
        aria-label="发布频率"
        value={frequency}
        onChange={(e) => setFrequency(e.target.value as Frequency)}
        className="h-9 rounded-md border border-border bg-background px-2 text-sm"
      >
        {FREQUENCIES.map((f) => (
          <option key={f} value={f}>
            {FREQUENCY_LABELS[f] ?? f}
          </option>
        ))}
      </select>
      <Button type="submit" disabled={pending}>
        保存节奏
      </Button>
    </form>
  );
}

export function AttainmentBadge({
  attainment,
}: {
  readonly attainment: CadenceAttainmentResource;
}) {
  const pct = Math.round(attainment.attainmentRatio * 100);
  return (
    <div
      data-testid="attainment-badge"
      data-lagging={attainment.isLagging ? "true" : "false"}
      className="flex flex-col gap-1"
    >
      <span className="flex items-center gap-2 text-sm">
        <Badge variant="secondary" className="text-[11px]">
          节奏达成率 {pct}%
        </Badge>
        <span className="text-xs text-muted-foreground">
          已发布 {attainment.publishedCount} / 预期 {attainment.expectedCount}
        </span>
      </span>
      {attainment.isLagging ? (
        <span
          data-testid="cadence-gap-banner"
          className="rounded-md border border-destructive/40 bg-destructive/10 px-2 py-1 text-xs text-destructive"
        >
          已断更 {attainment.gapDays} 天
        </span>
      ) : null}
    </div>
  );
}

export { FREQUENCIES, FREQUENCY_LABELS, STATUS_LABELS };
export type { Frequency };
