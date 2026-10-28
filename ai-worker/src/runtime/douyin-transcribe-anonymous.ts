import { executionTimeoutMs } from "@creatoros/contract/timeout-policy";
import { DouyinAudioFetchError, parseAwemeDetail, type DouyinVideoSource } from "./douyin-transcribe-source";
import { mapDetailErr, type DetailFailure } from "./douyin-transcribe-detail";
import { bindAbortContext } from "./browser/abort-context";
import { gotoWithRetry, type GotoCapablePage } from "./browser/navigation-retry";

// [T-1409] 未登录转写:iesdouyin 分享页对游客已不再下发 videoInfoRes,但 douyin.com 作品页
// 自身会以游客身份请求带签名的 aweme/detail 接口并拿到播放地址。这里不自造签名,只在干净
// 无头浏览器里打开作品页并截取页面自己发出的 detail 响应。

export interface AnonymousDetailResponse {
  url(): string;
  json(): Promise<unknown>;
}
export interface AnonymousDetailPage extends GotoCapablePage {
  waitForResponse(
    predicate: (response: AnonymousDetailResponse) => boolean,
    opts?: { timeout?: number },
  ): Promise<AnonymousDetailResponse>;
  evaluate<R>(fn: () => R): Promise<R>;
}
export interface AnonymousDetailContext {
  newPage(): Promise<AnonymousDetailPage>;
  close(): Promise<void>;
}
export interface FetchAnonymousDetailDeps {
  openContext(signal?: AbortSignal): Promise<AnonymousDetailContext>;
  channel(
    run: () => Promise<DouyinVideoSource>,
    mapError: (error: unknown) => DetailFailure,
    signal?: AbortSignal,
  ): Promise<DouyinVideoSource>;
}

const DETAIL_PATH = "/aweme/v1/web/aweme/detail/";
const DETAIL_WAIT_MS = 30_000;

export function isAwemeDetailResponseFor(url: string, awemeId: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.pathname === DETAIL_PATH && parsed.searchParams.get("aweme_id") === awemeId;
  } catch {
    return false;
  }
}

export async function fetchDouyinVideoUrlAnonymously(
  opts: { awemeId: string; signal?: AbortSignal },
  deps: FetchAnonymousDetailDeps,
): Promise<DouyinVideoSource> {
  opts.signal?.throwIfAborted();
  const ctx = await deps.openContext(opts.signal);
  const lifetime = bindAbortContext(opts.signal, () => ctx.close());
  try {
    opts.signal?.throwIfAborted();
    const page = await ctx.newPage();
    return await deps.channel(
      async () => {
        opts.signal?.throwIfAborted();
        const detail = page
          .waitForResponse((r) => isAwemeDetailResponseFor(r.url(), opts.awemeId), {
            timeout: executionTimeoutMs(DETAIL_WAIT_MS),
          })
          .then((r) => r.json())
          .catch(() => null);
        await gotoWithRetry(page, `https://www.douyin.com/video/${encodeURIComponent(opts.awemeId)}`, {
          timeoutMs: executionTimeoutMs(),
          label: `匿名作品详情(${opts.awemeId})`,
          signal: opts.signal,
        });
        const json = await detail;
        opts.signal?.throwIfAborted();
        if (json === null) {
          const bodyHead = await page
            .evaluate(() => ((globalThis as unknown as { document: { body?: { innerText?: string } } }).document.body?.innerText ?? "").slice(0, 300))
            .catch(() => "");
          if (bodyHead.includes("验证")) {
            throw new DouyinAudioFetchError(`fetchDouyinVideoUrlAnonymously: 作品页命中验证码 (aweme ${opts.awemeId})`);
          }
          throw new DouyinAudioFetchError(`fetchDouyinVideoUrlAnonymously: 作品页未拿到详情(aweme_detail 为空) (aweme ${opts.awemeId})`);
        }
        return parseAwemeDetail(json);
      },
      mapDetailErr,
      opts.signal,
    );
  } catch (error) {
    opts.signal?.throwIfAborted();
    throw error;
  } finally {
    await lifetime.close().catch(() => {});
  }
}

/**
 * 干净无头浏览器(不带任何账号 profile),关闭时连同浏览器进程一起退出。
 * 不覆盖 userAgent:UA 与真实内核/平台不一致时 detail 接口返回 200 空正文。
 */
export async function openAnonymousDouyinContext(): Promise<AnonymousDetailContext> {
  const { chromium } = await import("@playwright/test");
  const { launchWithBrowser } = await import("./browser/browser-launch");
  const { guardedLaunch, chromiumSandboxOpts } = await import("./browser/chromium-guard");
  const browser = await guardedLaunch(
    null,
    () =>
      launchWithBrowser((sel) =>
        chromium.launch({
          timeout: executionTimeoutMs(180_000),
          headless: true,
          ...sel,
          ...chromiumSandboxOpts(),
          args: ["--disable-blink-features=AutomationControlled", "--no-proxy-server"],
        }),
      ),
    { label: "转写浏览器" },
  );
  try {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      locale: "zh-CN",
    });
    context.setDefaultTimeout(executionTimeoutMs());
    context.setDefaultNavigationTimeout(executionTimeoutMs());
    return {
      newPage: () => context.newPage() as unknown as Promise<AnonymousDetailPage>,
      close: async () => {
        await context.close().catch(() => {});
        await browser.close().catch(() => {});
      },
    };
  } catch (error) {
    await browser.close().catch(() => {});
    throw error;
  }
}
