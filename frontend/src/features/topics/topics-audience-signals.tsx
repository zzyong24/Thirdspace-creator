"use client";

/**
 * `topics-audience-signals.tsx` — [T-248B②] 受众信号入口(audienceSignals.* 前端接线)。
 *
 * 契约读侧 audienceSignals.list 与写侧 audienceSignals.linkToCandidate(contract/src/
 * operations/candidate.ts)后端均已实现,但此前前端连 list 都没有任何消费方 ——
 * 评论采集/分析写进 audience_signals 的受众信号在 UI 完全不可见,「需求 → 候选」这条
 * 供给链断在最后一米。本文件补上:
 *
 *   「受众信号」按钮(供给区,与「信号源」并排)→ 弹窗列出 audienceSignals.list
 *   (打开时才懒拉取;空态诚实)→ 每条未关联信号带「转为候选」→ Dialog 双按钮确认门
 *   (全站禁原生 window.confirm)→ audienceSignals.linkToCandidate **省略 candidateId**
 *   = 从信号直接孵化一条 demand 候选 → 行内标记「已转候选」+ router.refresh()
 *   让候选池吃到新行。已关联的信号(linkedCandidateId 非空)只渲「已关联」徽标,不给假动作。
 *
 * 是新增独立按钮+弹窗;不动现有「信号源」三 tab 结构。
 */

import * as React from "react";
import { MessageSquareQuote, ThumbsUp } from "lucide-react";

import { client } from "@/lib/contract-client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { AudienceSignalResource } from "@creatoros/backend/modules/candidate";

// 信号来源 → 中文徽标(契约 audienceSignalSource 枚举的诚实映射;未知值回退原串)。
const SIGNAL_SOURCE_LABELS: Record<string, string> = {
  comment: "评论",
  dm: "私信",
  consultation: "咨询",
  review: "复盘",
};

export function signalSourceLabel(source: string): string {
  return SIGNAL_SOURCE_LABELS[source] ?? source;
}

// 弹窗一次拉的页大小 —— 受众信号按 createdAt 倒序,前 50 条足够人工浏览;
// 不做无限滚动(v1 入口先把「可见」做真)。
const SIGNALS_PAGE_SIZE = 50;

function SignalRow({
  signal,
  onLinked,
}: {
  readonly signal: AudienceSignalResource;
  /** 转候选成功后的回调(candidateId = 新孵化的 demand 候选 id)。 */
  readonly onLinked: (signalId: string) => void;
}) {
  const [confirming, setConfirming] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const linked = signal.linkedCandidateId !== null;

  function confirmLink() {
    if (pending) return;
    setPending(true);
    setError(null);
    void (async () => {
      try {
        // body 省略 candidateId → 后端从该信号直接孵化一条 demand 候选并回写关联。
        await client.linkSignalToCandidate({
          params: { signalId: signal.id },
          query: undefined,
          body: {},
        });
        setConfirming(false);
        onLinked(signal.id);
      } catch {
        setError("转为候选失败，请稍后重试。");
      } finally {
        setPending(false);
      }
    })();
  }

  return (
    <li
      data-testid="audience-signal-row"
      data-signal-id={signal.id}
      data-linked={linked ? "true" : "false"}
      className="flex items-start justify-between gap-2 rounded-control border border-border bg-surface px-3 py-2"
    >
      <div className="flex min-w-0 flex-col gap-1">
        <span className="flex items-center gap-1.5">
          <Badge variant="outline" className="shrink-0 text-[10px]">
            {signalSourceLabel(signal.source)}
          </Badge>
          {signal.demandTag ? (
            <Badge variant="secondary" className="shrink-0 text-[10px]">
              {signal.demandTag}
            </Badge>
          ) : null}
          {signal.likeCount !== null && signal.likeCount > 0 ? (
            <span className="flex shrink-0 items-center gap-0.5 text-[10px] tabular-nums text-muted-foreground">
              <ThumbsUp className="size-3" />
              {signal.likeCount}
            </span>
          ) : null}
        </span>
        <span className="line-clamp-2 text-xs leading-relaxed text-foreground">
          {signal.rawText}
        </span>
        {error ? (
          <span
            data-testid="audience-signal-error"
            role="status"
            className="text-[11px] text-destructive"
          >
            {error}
          </span>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center">
        {linked ? (
          <Badge
            variant="secondary"
            data-testid="audience-signal-linked-badge"
            className="text-[10px]"
          >
            已转候选
          </Badge>
        ) : (
          <>
            <Button
              type="button"
              variant="outline"
              size="sm"
              data-testid="audience-signal-link-trigger"
              className="h-7 px-2 text-xs"
              onClick={() => setConfirming(true)}
            >
              转为候选
            </Button>
            <Dialog
              open={confirming}
              onOpenChange={(next) => {
                if (!next) {
                  setConfirming(false);
                  setError(null);
                }
              }}
            >
              <DialogContent
                data-testid="audience-signal-link-confirm"
                className="max-w-sm"
              >
                <DialogHeader>
                  <DialogTitle>把这条信号转为候选?</DialogTitle>
                  <DialogDescription>
                    会从这条受众信号孵化一条「需求」来源的选题候选,进入候选池等你评估。
                  </DialogDescription>
                </DialogHeader>
                <p className="line-clamp-3 rounded-control bg-surface-subtle/60 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
                  {signal.rawText}
                </p>
                <DialogFooter>
                  <Button
                    type="button"
                    variant="outline"
                    data-testid="audience-signal-link-cancel"
                    onClick={() => {
                      setConfirming(false);
                      setError(null);
                    }}
                  >
                    取消
                  </Button>
                  <Button
                    type="button"
                    data-testid="audience-signal-link-confirm-button"
                    disabled={pending}
                    onClick={confirmLink}
                  >
                    {pending ? "转换中…" : "确认转为候选"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </>
        )}
      </div>
    </li>
  );
}

export function AudienceSignalsButton({
  onRefresh,
}: {
  /** 转候选成功后的刷新回调(缺省由内部 useRouter().refresh() 兜底不了 ——
   *  本组件不直接依赖 next/navigation,由调用侧注入,便于单测)。 */
  readonly onRefresh?: () => void;
}) {
  const [open, setOpen] = React.useState(false);
  // null=未加载/加载中,[]=空库(诚实空态),有值=可浏览的信号列表。
  const [signals, setSignals] = React.useState<
    ReadonlyArray<AudienceSignalResource> | null
  >(null);
  const [loadError, setLoadError] = React.useState(false);
  const requestedRef = React.useRef(false);

  // 懒加载:第一次打开弹窗才拉(供给区首屏零额外请求;关闭再开不重复拉)。
  const ensureLoaded = React.useCallback(() => {
    if (requestedRef.current) return;
    requestedRef.current = true;
    void (async () => {
      try {
        const rows = (await client.listAudienceSignals({
          params: undefined,
          query: { page: 1, pageSize: SIGNALS_PAGE_SIZE },
          body: undefined,
        })) as unknown as ReadonlyArray<AudienceSignalResource> | null | undefined;
        setSignals(rows ?? []);
      } catch {
        // 拉取失败 → 诚实渲错误态,不摆假行;允许下次打开重试。
        requestedRef.current = false;
        setLoadError(true);
        setSignals([]);
      }
    })();
  }, []);

  // 单条转候选成功:行内标记已关联(linkedCandidateId 置占位真值,展示端只判非 null)
  // + 通知调用侧 router.refresh() 让候选池吃到新孵化的 demand 候选。
  const handleLinked = React.useCallback(
    (signalId: string) => {
      setSignals((prev) =>
        prev
          ? prev.map((s) =>
              s.id === signalId ? { ...s, linkedCandidateId: "linked" } : s,
            )
          : prev,
      );
      onRefresh?.();
    },
    [onRefresh],
  );

  const unlinkedCount =
    signals?.filter((s) => s.linkedCandidateId === null).length ?? 0;

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        data-testid="audience-signals-trigger"
        className="h-8 shrink-0 gap-1.5 px-3 text-xs"
        onClick={() => {
          setLoadError(false);
          ensureLoaded();
          setOpen(true);
        }}
      >
        <MessageSquareQuote className="size-3.5" />
        受众信号
        {unlinkedCount > 0 ? (
          <Badge variant="secondary" className="ml-0.5 text-[10px] tabular-nums">
            {unlinkedCount}
          </Badge>
        ) : null}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          data-testid="audience-signals-dialog"
          className="flex max-h-[85vh] flex-col gap-0 p-0 sm:max-w-lg"
        >
          <DialogHeader className="border-b px-5 py-4">
            <DialogTitle>受众信号</DialogTitle>
            <DialogDescription>
              评论 / 私信 / 咨询里被识别出的真实需求 —— 值得做的可以一键转为选题候选。
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            {signals === null ? (
              <p
                data-testid="audience-signals-loading"
                className="px-3 py-6 text-center text-xs text-muted-foreground"
              >
                加载中…
              </p>
            ) : signals.length === 0 ? (
              <p
                data-testid="audience-signals-empty"
                className="rounded-card border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground"
              >
                {loadError
                  ? "受众信号加载失败 —— 关闭后重开重试。"
                  : "还没有受众信号 —— 评论采集与分析跑过后会出现在这里。"}
              </p>
            ) : (
              <ul
                data-testid="audience-signals-list"
                className="flex flex-col gap-2"
              >
                {signals.map((s) => (
                  <SignalRow key={s.id} signal={s} onLinked={handleLinked} />
                ))}
              </ul>
            )}
          </div>
          <DialogFooter className="border-t">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              关闭
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
