import {executionTimeoutMs} from "@creatoros/contract/timeout-policy";
import { DouyinAudioFetchError, parseAwemeDetail, type DouyinVideoSource } from "./douyin-transcribe-source";
import { DouyinNotLoggedInError } from "./douyin-errors";
import { bindAbortContext } from "./browser/abort-context";
import { gotoWithRetry, type GotoCapablePage } from "./browser/navigation-retry";

export interface DetailPage extends GotoCapablePage {
  evaluate<R>(fn: () => R): Promise<R>;
  evaluate<R, A>(fn: (arg: A) => R | Promise<R>, arg: A): Promise<R>;
}
export interface DetailContext {
  pages(): DetailPage[];
  newPage(): Promise<DetailPage>;
  cookies(url: string): Promise<Array<{ name: string }>>;
  close(): Promise<void>;
}
export interface FetchVideoUrlViaDetailOptions {
  awemeId: string;
  signal?: AbortSignal;
}
export type DetailFailure = { kind: "captcha" | "empty-item-list" } | { kind: "net-timeout"; consecutiveTimeouts: number };
export interface FetchVideoUrlViaDetailDeps {
  /** 调用者持有已授权的资源；执行层不接收任意 profile 路径。 */
  openContext(signal?: AbortSignal): Promise<DetailContext>;
  /** 生产装配必须接共享限流服务；此处不创建第二套网关。 */
  channel(run: () => Promise<DouyinVideoSource>, mapError: (error: unknown) => DetailFailure, signal?: AbortSignal): Promise<DouyinVideoSource>;
}

export const AWEME_DETAIL_API =
  "https://www.douyin.com/aweme/v1/web/aweme/detail/?device_platform=webapp&aid=6383" +
  "&channel=channel_pc_web&pc_client_type=1&version_code=170400&version_name=17.4.0" +
  "&cookie_enabled=true&screen_width=1920&screen_height=1080&browser_language=zh-CN" +
  "&browser_platform=Win32&browser_name=Chrome&browser_version=126.0.0.0" +
  "&browser_online=true&platform=PC&aweme_id={id}";

export function mapDetailErr(err: unknown): DetailFailure {
  const raw = err instanceof Error ? err.message : String(err ?? "");
  if (raw.includes("验证码")) return { kind: "captcha" };
  if (raw.includes("aweme_detail 为空")) return { kind: "empty-item-list" };
  return { kind: "net-timeout", consecutiveTimeouts: 1 };
}

export async function fetchDouyinVideoUrlViaDetail(
  opts: FetchVideoUrlViaDetailOptions,
  deps: FetchVideoUrlViaDetailDeps,
): Promise<DouyinVideoSource> {
  opts.signal?.throwIfAborted();
  const ctx = await deps.openContext(opts.signal);
  const lifetime = bindAbortContext(opts.signal, () => ctx.close());
  try {
    opts.signal?.throwIfAborted();
    // 登录态校验(页内 fetch credentials:include 要借它;未登录 → 提示扫码,同 search/user-posts)。
    const cookies = await ctx.cookies("https://www.douyin.com");
    opts.signal?.throwIfAborted();
    const loggedIn = cookies.some(
      (c) => c.name === "sessionid" || c.name === "sessionid_ss",
    );
    if (!loggedIn) throw new DouyinNotLoggedInError();
    const page = ctx.pages()[0] ?? (await ctx.newPage());

    const id = encodeURIComponent(opts.awemeId);
    // 每 aweme acquire 一次限流网关(导航 + 页内 fetch 算一次请求节奏,同现有纪律)。
    return await deps.channel(
      async () => {
        opts.signal?.throwIfAborted();
        // 先落到作品页(建立 referer/风控上下文),再页内 fetch detail(T-235b 搜索同款)。
        await gotoWithRetry(
          page,
          `https://www.douyin.com/video/${id}`,
          { timeoutMs: executionTimeoutMs(), label: `作品详情(${opts.awemeId})`, signal: opts.signal },
        );
        opts.signal?.throwIfAborted();
        await page.waitForTimeout(3000); // 等页面就绪(建立会话上下文)

        opts.signal?.throwIfAborted();

        // 验证码检测:body 前 300 字含「验证」→ 不硬闯,该作品跳过(抛出让调用方分类计数)。
        const bodyHead = await page
          .evaluate(() => ((globalThis as unknown as { document: { body?: { innerText?: string } } }).document.body?.innerText ?? "").slice(0, 300))
          .catch(() => "");
        opts.signal?.throwIfAborted();
        if (bodyHead.includes("验证")) {
          throw new DouyinAudioFetchError(
            `fetchDouyinVideoUrlViaDetail: 作品页命中验证码,跳过 (aweme ${opts.awemeId})`,
          );
        }

        // 页内 fetch detail 接口(credentials:include 借登录态;fn 自包含,只引用页面全局)。
        const json = await page.evaluate<unknown, string>(async (u: string) => {
          try {
            const r = await fetch(u, { credentials: "include" });
            return (await r.json()) as unknown;
          } catch (e) {
            return { error: e instanceof Error ? e.message : String(e) };
          }
        }, AWEME_DETAIL_API.replace("{id}", id));

        opts.signal?.throwIfAborted();
        return parseAwemeDetail(json);
      },
      mapDetailErr,
      opts.signal,
    );
  } catch (error) {
    opts.signal?.throwIfAborted();
    throw error;
  } finally {
    await lifetime.close().catch(() => {}); // 仅清理本次持有的 context；真实占用由启动守卫保留。
  }
}
