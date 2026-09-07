/** 取消只关闭本次调用拥有的上下文，finally 与 abort 共用一次关闭。 */
export function bindAbortContext(signal: AbortSignal | undefined, closeContext: () => Promise<void>) {
  let closing: Promise<void> | undefined;
  const closeOnce = () => closing ??= Promise.resolve().then(closeContext);
  const onAbort = () => { void closeOnce().catch(() => {}); };
  signal?.addEventListener("abort", onAbort, { once: true });
  if (signal?.aborted) onAbort();
  return {
    async close() {
      signal?.removeEventListener("abort", onAbort);
      await closeOnce();
    },
  };
}
