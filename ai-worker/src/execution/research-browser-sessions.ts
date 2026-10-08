import {executionTimeoutMs} from "@creatoros/contract/timeout-policy";
import type { Page } from "@playwright/test";
import {
  browserActInputSchema,
  browserObserveInputSchema,
  type AgenticToolOutcome,
} from "@creatoros/contract/execution-worker";
import { createBrowserWorkerSession } from "./browser-worker-session";

type Session = {
  page: Page;
  executor: ReturnType<typeof createBrowserWorkerSession>;
};
const failure = (
  code: "stale_observation" | "invalid_input" | "permission" | "transient",
): AgenticToolOutcome => ({
  status: code === "permission" ? "blocked" : "error",
  summary:
    code === "stale_observation"
      ? "当前页面会话已不存在，请重新观察；未重放任何历史动作"
      : "页面观察未完成，未执行交互动作",
  evidence: [],
  error: {
    code,
    retryable: false,
    recovery:
      code === "stale_observation"
        ? "使用browser.observe和明确URL重新观察，再基于新观察决定动作"
        : "检查URL与授权后重新观察",
  },
  continuation: null,
  sideEffect: "none",
});

/** 当前Worker任务内保留页面；宿主负责openPage的context、权限、登录态与整棵浏览器资源。 */
export function createResearchBrowserSessions(deps: {
  openPage(sessionId: string, signal: AbortSignal): Promise<Page>;
  guardUrl(url: string): Promise<void>;
}) {
  const sessions = new Map<string, Session>();
  const shutdown = new AbortController();
  let tail: Promise<unknown> = Promise.resolve();
  let closing: Promise<void> | undefined;
  const serial = <T>(operation: () => Promise<T>) => {
    const result = tail.then(operation, operation);
    tail = result.catch(() => {});
    return result;
  };
  const dispose = async (id: string, session: Session) => {
    if (sessions.get(id) === session) sessions.delete(id);
    // 先关闭真实页面以打断renderer命令，再清理观察句柄。
    await session.page.close({ runBeforeUnload: false }).catch(() => {});
    await session.executor.close();
  };
  const guard = async (url: string, signal: AbortSignal) => {
    signal.throwIfAborted();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let abort = () => {};
    try {
      await Promise.race([
        deps.guardUrl(url),
        new Promise<never>((_, reject) => {
          abort = () => reject(new Error("BROWSER_OPERATION_CANCELLED"));
          signal.addEventListener("abort", abort, { once: true });
          if (signal.aborted) abort();
          timer = setTimeout(
            () => reject(new Error("BROWSER_GUARD_TIMEOUT")),
            executionTimeoutMs(),
          );
        }),
      ]);
      signal.throwIfAborted();
    } finally {
      if (timer) clearTimeout(timer);
      signal.removeEventListener("abort", abort);
    }
  };
  return {
    execute(
      name: string,
      input: unknown,
      scope: { signal: AbortSignal; initialUrl?: string },
    ): Promise<AgenticToolOutcome> {
      const signal = AbortSignal.any([scope.signal, shutdown.signal]);
      return serial(async () => {
        signal.throwIfAborted();
        if (name !== "browser.observe" && name !== "browser.act")
          throw new Error("BROWSER_TOOL_NOT_SUPPORTED");
        const parsed =
          name === "browser.observe"
            ? browserObserveInputSchema.safeParse(input)
            : browserActInputSchema.safeParse(input);
        if (!parsed.success) return failure("invalid_input");
        const id = parsed.data.sessionId;
        let session = sessions.get(id);
        if (session?.page.isClosed()) {
          await dispose(id, session);
          session = undefined;
        }
        if (name === "browser.act") {
          if (!session) return failure("stale_observation");
          const owned = session;
          const onAbort = () => {
            void owned.page.close({ runBeforeUnload: false }).catch(() => {});
          };
          signal.addEventListener("abort", onAbort, { once: true });
          try {
            signal.throwIfAborted();
            // 不转换unknown_commit；外层durable调用账本负责停止和对账。
            return await owned.executor.act(
              browserActInputSchema.parse(parsed.data),
              signal,
            );
          } finally {
            signal.removeEventListener("abort", onAbort);
            if (signal.aborted || owned.page.isClosed())
              await dispose(id, owned);
          }
        }
        const params = browserObserveInputSchema.parse({
          ...parsed.data,
          ...(!session &&
          !("url" in parsed.data && parsed.data.url) &&
          scope.initialUrl
            ? { url: scope.initialUrl }
            : {}),
        });
        if (!session && !params.url) return failure("invalid_input");
        if (params.url) {
          try {
            await guard(params.url, signal);
          } catch {
            if (signal.aborted && session) await dispose(id, session);
            signal.throwIfAborted();
            return failure("permission");
          }
        }
        if (!session) {
          // 等待迟到openPage返回后主动关页；close等待此串行任务，不能先释放资源所有权。
          const page = await deps.openPage(id, signal);
          if (signal.aborted) {
            await page.close({ runBeforeUnload: false }).catch(() => {});
            signal.throwIfAborted();
          }
          session = {
            page,
            executor: createBrowserWorkerSession({
              page,
              sessionId: id,
              guardUrl: deps.guardUrl,
            }),
          };
          sessions.set(id, session);
        }
        const owned = session;
        const onAbort = () => {
          void owned.page.close({ runBeforeUnload: false }).catch(() => {});
        };
        signal.addEventListener("abort", onAbort, { once: true });
        try {
          signal.throwIfAborted();
          if (params.url) {
            // URL已通过guard；每次显式observe URL可重新导航，但绝不恢复旧act。
            await owned.page.goto(params.url, {
              waitUntil: "domcontentloaded",
              timeout: executionTimeoutMs(),
            });
            await guard(owned.page.url(), signal);
          }
          signal.throwIfAborted();
          return await owned.executor.observe(signal);
        } catch {
          await dispose(id, owned);
          signal.throwIfAborted();
          return failure("transient");
        } finally {
          signal.removeEventListener("abort", onAbort);
          if (signal.aborted || owned.page.isClosed()) await dispose(id, owned);
        }
      });
    },
    close(): Promise<void> {
      if (closing) return closing;
      shutdown.abort();
      const known = [...sessions.entries()].map(([id, session]) =>
        dispose(id, session),
      );
      closing = (async () => {
        await Promise.all(known);
        await tail;
        await Promise.all(
          [...sessions.entries()].map(([id, session]) => dispose(id, session)),
        );
      })();
      return closing;
    },
  };
}
