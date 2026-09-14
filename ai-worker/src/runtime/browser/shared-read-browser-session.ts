import type { BrowserContext, Page } from '@playwright/test';
import { hostBrowserShutdownScope, type BrowserShutdownScope } from './browser-shutdown-scope';
export interface AuthorizedBrowserProfile {
  userId: string;
  authDir: string;
  profileKey: string;
}
export type ReadBrowserSession = Pick<BrowserContext, 'pages' | 'newPage' | 'cookies' | 'close'>;
export type ExclusiveBrowserSession = ReadBrowserSession & Pick<BrowserContext, 'clearCookies'>;
export interface SharedBrowserSessionPorts {
  authorize(authDir: string, signal: AbortSignal): Promise<AuthorizedBrowserProfile>;
  open(profile: AuthorizedBrowserProfile, headless: boolean, signal: AbortSignal): Promise<BrowserContext>;
  scope?: BrowserShutdownScope;
}
/** 授权后的同档案只读请求共用ctx，但每个借用者仅管理自己的页面。独占请求按FIFO等待读者退场。 */
export function createSharedReadBrowserSessionPool(ports: SharedBrowserSessionPorts) {
  const scope = ports.scope ?? hostBrowserShutdownScope;
  type Entry = {
    identity: AuthorizedBrowserProfile;
    queue: Request[];
    batch?: Batch;
  };
  type Batch = {
    entry: Entry;
    headless: boolean;
    phase: 'opening' | 'open' | 'closing';
    members: Set<Request>;
    retired: Set<Request>;
    opening: Promise<BrowserContext>;
    context?: BrowserContext;
    closing?: Promise<void>;
    gone: boolean;
  };
  type Request = {
    entry: Entry;
    headless: boolean;
    signal: AbortSignal;
    resolve: (view: ExclusiveBrowserSession) => void;
    reject: (error: unknown) => void;
    batch?: Batch;
    closed: boolean;
    delivered: boolean;
    reason?: unknown;
    pages: Set<Page>;
    pageWork: Set<Promise<unknown>>;
    listeners: Map<Page, (page: Page) => void>;
    closing?: Promise<void>;
    cancel: () => void;
  };
  const entries = new Map<string, Entry>();
  const stopped = (request: Request) => request.reason ?? new DOMException('当前浏览器读取已结束', 'AbortError');
  const assertOpen = (request: Request) => {
    if (request.closed || request.batch?.gone)
      throw stopped(request);
    request.signal.throwIfAborted();
  };
  function discard(entry: Entry) {
    if (!entry.batch && !entry.queue.length)
      entries.delete(entry.identity.profileKey);
  }
  function finish(batch: Batch): Promise<void> {
    if (batch.closing)
      return batch.closing;
    batch.phase = 'closing';
    const work = (async () => {
      let ctx: BrowserContext | undefined;
      try {
        ctx = await batch.opening;
      }
      catch { /* 启动失败由guard确认未启动或保留清理能力。 */
      }
      if (ctx)
        await ctx.close();
      for (const request of new Set([...batch.members, ...batch.retired])) {
        for (const [page, listener] of request.listeners) page.off('popup', listener);
        request.listeners.clear();
      }
      batch.retired.clear();
      batch.gone = true;
      if (batch.entry.batch === batch)
        batch.entry.batch = undefined;
      pump(batch.entry);
      discard(batch.entry);
    })();
    batch.closing = work;
    void work.catch(() => {
      // 保留实际ctx供下次重试关闭，但不能让已排队的业务请求无限等待。
      for (const request of [...batch.entry.queue]) {
        request.reason = Object.assign(new Error('浏览器登录档案尚未完成关闭，请稍后重试'), {code:'BROWSER_PROFILE_BUSY'});
        void closeRequest(request).catch(() => {});
      }
      batch.closing = undefined;
    });
    return work;
  }
  function own(request: Request, page: Page) {
    if (request.pages.has(page))
      return;
    request.pages.add(page);
    const popup = (next: Page) => own(request, next);
    request.listeners.set(page, popup);
    page.on('popup', popup);
    if (request.closed) {
      const work = page.close();
      request.pageWork.add(work);
      void work.then(() => request.pageWork.delete(work), () => request.pageWork.delete(work));
    }
  }
  function closeRequest(request: Request): Promise<void> {
    if (request.closing)
      return request.closing;
    request.closed = true;
    if (!request.delivered)
      request.reject(stopped(request));
    request.signal.removeEventListener('abort', request.cancel);
    const batch = request.batch;
    if (!batch) {
      request.entry.queue = request.entry.queue.filter(row => row !== request);
      pump(request.entry);
      discard(request.entry);
      return Promise.resolve();
    }
    if ([...batch.members].every(row => row.closed))
      batch.phase = 'closing';
    // opener关闭后popup事件仍可能迟到；保留归属监听到真实ctx关闭，迟到页只由原借用方收尾。
    batch.retired.add(request);
    const work = (async () => {
      try {
        await batch.opening;
      }
      catch { /* 没有返回ctx，不对别人的资源做清理。 */
      }
      while (request.pageWork.size)
        await Promise.allSettled([...request.pageWork]);
      if ([...batch.members].every(row => row.closed))
        await finish(batch);
      else
        await Promise.all([...request.pages].filter(page => !page.isClosed()).map(page => page.close()));
      batch.members.delete(request);
      if (!batch.members.size)
        await finish(batch);
    })();
    request.closing = work;
    void work.catch(() => {
      request.closing = undefined;
    });
    return work;
  }
  function join(batch: Batch, request: Request) {
    request.batch = batch;
    batch.members.add(request);
    void batch.opening.then(ctx => {
      if (request.closed)
        return;
      const view: ReadBrowserSession = {
        pages: () => [...request.pages].filter(page => !page.isClosed()),
        newPage: () => {
          try {
            assertOpen(request);
          }
          catch (error) {
            return Promise.reject(error);
          }
          const opening = ctx.newPage().then(async (page) => {
            own(request, page);
            if (request.closed) {
              await page.close();
              throw stopped(request);
            }
            return page;
          });
          request.pageWork.add(opening);
          void opening.then(() => request.pageWork.delete(opening), () => request.pageWork.delete(opening));
          return opening;
        },
        cookies: (urls) => {
          assertOpen(request);
          return ctx.cookies(urls);
        },
        close: () => closeRequest(request),
      };
      if (!request.headless)
        Object.assign(view, {
          clearCookies: (options: Parameters<BrowserContext['clearCookies']>[0]) => {
            assertOpen(request);
            return ctx.clearCookies(options);
          }
        });
      request.delivered = true;
      request.resolve(view as ExclusiveBrowserSession);
    }, error => {
      request.reason = error;
      request.reject(error);
      void closeRequest(request).catch(() => {
      });
    });
  }
  function pump(entry: Entry) {
    entry.queue = entry.queue.filter(request => !request.closed);
    if (!entry.batch && entry.queue.length) {
      const first = entry.queue.shift()!;
      const batch: Batch = {
        entry, headless: first.headless, phase: 'opening', members: new Set(), retired: new Set(), opening: undefined as unknown as Promise<BrowserContext>, gone: false
      };
      entry.batch = batch;
      // 真实DB租约和launch是共享资源生命周期，不能被任一借用方取消。
      batch.opening = scope.trackPending(Promise.resolve().then(() => {
        scope.signal.throwIfAborted();
        return ports.open(entry.identity, batch.headless, scope.signal);
      }).then(ctx => {
        batch.context = ctx;
        if (batch.phase !== 'closing')
          batch.phase = 'open';
        ctx.on('close', () => {
          batch.gone = true;
          for (const member of batch.members) {
            member.reason = new Error('浏览器已关闭，请重新读取');
            void closeRequest(member).catch(() => {
            });
          }
          void finish(batch).catch(() => {
          });
        });
        return ctx;
      }));
      join(batch, first);
    }
    const batch = entry.batch;
    // 一旦独占登录排到队首，后来的只读请求必须等这一批结束，不能无限插队。
    if (batch?.headless && batch.phase !== 'closing')
      while (entry.queue[0]?.headless)
        join(batch, entry.queue.shift()!);
    if (batch?.phase === 'closing' && !batch.closing)
      void finish(batch).catch(() => {
      });
    discard(entry);
  }
  function checkout(authDir: string, headless: boolean, signal?: AbortSignal): Promise<ExclusiveBrowserSession> {
    const combined = signal ? AbortSignal.any([signal, scope.signal]) : scope.signal;
    return scope.trackPending((async () => {
      combined.throwIfAborted();
      const identity = await ports.authorize(authDir, combined);
      combined.throwIfAborted();
      let entry = entries.get(identity.profileKey);
      if (entry && (entry.identity.userId !== identity.userId || entry.identity.authDir !== identity.authDir))
        throw new Error('登录档案归属发生变化，不能复用浏览器');
      if (!entry) {
        entry = {
          identity, queue: []
        };
        entries.set(identity.profileKey, entry);
      }
      const current = entry;
      return new Promise<ExclusiveBrowserSession>((resolve, reject) => {
        const request: Request = {
          entry: current, headless, signal: combined, resolve, reject, closed: false, delivered: false, pages: new Set(), pageWork: new Set(), listeners: new Map(), cancel: () => {
          }
        };
        request.cancel = () => {
          request.reason = combined.reason;
          void closeRequest(request).catch(() => {
          });
        };
        combined.addEventListener('abort', request.cancel, {
          once: true
        });
        current.queue.push(request);
        if (combined.aborted)
          request.cancel();
        else
          pump(current);
      });
    })());
  }
  return {
    checkoutRead: (dir: string, signal?: AbortSignal): Promise<ReadBrowserSession> => checkout(dir, true, signal), checkoutExclusive: (dir: string, signal?: AbortSignal): Promise<ExclusiveBrowserSession> => checkout(dir, false, signal)
  };
}
