export interface RecoveryWakeControl {
  signal: AbortSignal;
  shouldStop(): boolean;
}

/** 只唤醒既有持久队列；领取、到期、重试预算与业务结果仍归原任务服务。 */
export function createRecoveryWakeCoordinator(deps: {
  lanes: Record<string, (control: RecoveryWakeControl) => Promise<unknown>>;
  intervalMs?: number;
  onError?(kind: string, error: unknown): void;
}) {
  const stopFailures: unknown[] = [];
  const abort = new AbortController();
  const active = new Map<string, Promise<unknown>>();
  let timer: ReturnType<typeof setInterval> | undefined;
  const control: RecoveryWakeControl = {
    signal: abort.signal,
    shouldStop: () => abort.signal.aborted,
  };

  const run = (kind: string): Promise<unknown> => {
    if (abort.signal.aborted) return Promise.resolve();
    const previous = active.get(kind);
    if (previous) return previous;
    const lane = deps.lanes[kind];
    if (!lane) return Promise.resolve();

    const pending = Promise.resolve()
      .then(() => {
        if (!abort.signal.aborted) return lane(control);
      })
      .catch(error => {
        if ((error as {resourceStopUnconfirmed?: boolean})?.resourceStopUnconfirmed === true) {
          stopFailures.push(error);
        }
        if (!abort.signal.aborted) deps.onError?.(kind, error);
      })
      .finally(() => active.delete(kind));
    active.set(kind, pending);
    return pending;
  };
  const wake = (kind?: string) => {
    for (const key of kind ? [kind] : Object.keys(deps.lanes)) void run(key);
  };

  return {
    wake,
    run,
    start() {
      if (timer || abort.signal.aborted) return;
      timer = setInterval(() => wake(), deps.intervalMs ?? 2000);
      wake();
    },
    async stop() {
      abort.abort();
      if (timer) clearInterval(timer);
      timer = undefined;
      await Promise.all([...active.values()]);
      if (stopFailures.length) throw new AggregateError(stopFailures, "恢复消费者的资源尚未确认停止");
    },
  };
}
