import { createHash } from "node:crypto";
import { mkdir, rename, rm } from "node:fs/promises";
import { join } from "node:path";
import type { BrowserContext, Page, Response } from "@playwright/test";
import type { CollectionPageCommit } from "@creatoros/contract";
import { guardedLaunch, chromiumSandboxOpts } from "../browser/chromium-guard";
import { launchWithBrowser } from "../browser/browser-launch";
import {
  parseXhsCreatorIdentity, parseXhsCreatorCatalogPage,
  type XhsCatalogPage, type XhsIdentity,
} from "./xhs-creator-normalizer";

// Source review: Thirdspace-xhs-creator@34301ee7 worker/src/browser.ts and
// worker/src/collector.ts. Only normal creator-page responses are observed.
const ORIGIN = "https://creator.xiaohongshu.com";
const IDENTITY_PATH = "/api/galaxy/user/info";
const CATALOG_PATH = "/api/galaxy/v2/creator/note/user/posted";
const WAIT_MS = 25_000;
const LOGIN_MS = 8 * 60_000;
type TerminalEvidence = NonNullable<CollectionPageCommit["terminalEvidence"]>;
export interface XhsCatalogScan { pages: XhsCatalogPage[]; terminalEvidence: TerminalEvidence }

export class XhsBrowserSourceError extends Error {
  constructor(readonly code: string, message: string) { super(message); }
}

function fail(code: string, message: string): never { throw new XhsBrowserSourceError(code, message); }
const key = (value: string) => createHash("sha256").update(value).digest("hex");

/** No display name, arbitrary user input or raw account ID is used as a path segment. */
export function xhsProfilePaths(root: string, userId: string, bindAttemptId: string, identity?: string) {
  if (!userId || !bindAttemptId) fail("PROFILE_SCOPE", "缺少账号隔离标识");
  const base = join(root, "xiaohongshu", key(userId));
  return {
    temporary: join(base, "pending", key(bindAttemptId)),
    permanent: identity ? join(base, "accounts", key(identity)) : null,
  };
}

async function openProfile(directory: string, headless: boolean): Promise<BrowserContext> {
  await mkdir(directory, { recursive: true });
  return guardedLaunch(directory, async () => {
    const { chromium } = await import("@playwright/test");
    return launchWithBrowser((selection) => chromium.launchPersistentContext(directory, {
      ...selection, ...chromiumSandboxOpts(), headless,
      viewport: { width: 1440, height: 900 }, locale: "zh-CN",
      timezoneId: "Asia/Shanghai", acceptDownloads: false,
      args: ["--no-first-run", "--no-default-browser-check"],
    }));
  }, { label: "小红书账号浏览器" });
}

function waitForResponse<T>(context: BrowserContext, pathname: string,
  parse: (body: unknown, url: URL) => T, match: (url: URL) => boolean,
  timeoutMs: number, signal?: AbortSignal, ignoreUnavailable = false) {
  let stopped = false;
  let stop = () => {};
  const promise = new Promise<T>((resolve, reject) => {
    const cleanup = () => {
      if (stopped) return false;
      stopped = true;
      clearTimeout(timer);
      context.off("response", receive);
      context.off("close", closed);
      signal?.removeEventListener("abort", aborted);
      return true;
    };
    const finish = (error: unknown, value?: T) => {
      if (!cleanup()) return;
      error ? reject(error) : resolve(value!);
    };
    const closed = () => finish(new XhsBrowserSourceError("BROWSER_CLOSED", "浏览器窗口已关闭"));
    const aborted = () => finish(new XhsBrowserSourceError("CANCELLED", "采集已取消"));
    const timer = setTimeout(() => finish(new XhsBrowserSourceError("SOURCE_TIMEOUT", "等待平台页面响应超时")), timeoutMs);
    const receive = async (response: Response) => {
      let url: URL;
      try { url = new URL(response.url()); } catch { return; }
      if (url.origin !== ORIGIN || url.pathname !== pathname || response.request().method() !== "GET" || !match(url)) return;
      if (response.status() === 401) {
        if (!ignoreUnavailable) finish(new XhsBrowserSourceError("LOGIN_REQUIRED", "小红书登录已失效，请重新扫码"));
        return;
      }
      if (response.status() === 429) return finish(new XhsBrowserSourceError("PLATFORM_LIMIT", "小红书暂时限制访问，请稍后重试"));
      if ([403, 406].includes(response.status())) return finish(new XhsBrowserSourceError("DATA_UNAVAILABLE", "当前账号无法读取此页面"));
      if (response.status() !== 200) return;
      try { finish(null, parse(await response.json(), url)); }
      catch (error) {
        // Chromium can evict an individual response body while the login page
        // navigates. That response is unusable, but a later page response can
        // still prove the identity; keep the observer alive.
        if (error instanceof Error && error.message.includes("No resource with given identifier")) return;
        if (ignoreUnavailable && error && typeof error === "object" && "code" in error &&
            ["DATA_UNAVAILABLE", "DATA_SCHEMA"].includes(String(error.code))) return;
        finish(error);
      }
    };
    stop = () => finish(new XhsBrowserSourceError("CANCELLED", "页面读取已取消"));
    context.on("response", receive);
    context.on("close", closed);
    signal?.addEventListener("abort", aborted, { once: true });
    if (signal?.aborted) aborted();
  });
  void promise.catch(() => {});
  return { promise, stop };
}

/** Opens a fresh CreatorOS-only profile; the human completes the normal QR login. */
export async function loginXhsCreator(directory: string, signal?: AbortSignal): Promise<XhsIdentity> {
  const context = await openProfile(directory, false);
  const waiter = waitForResponse(context, IDENTITY_PATH,
    (body) => parseXhsCreatorIdentity(body), () => true, LOGIN_MS, signal, true);
  try {
    const page = context.pages()[0] ?? await context.newPage();
    await page.goto(ORIGIN + "/", { waitUntil: "domcontentloaded", timeout: 30_000 });
    return await waiter.promise;
  } finally {
    waiter.stop();
    await context.close().catch(() => {});
  }
}

/** The verified identity becomes the profile key only after the bind transaction succeeds. */
export async function promoteXhsProfile(temporary: string, permanent: string): Promise<void> {
  await mkdir(join(permanent, ".."), { recursive: true });
  const previous = `${permanent}.previous`;
  await rm(previous, { recursive: true, force: true });
  let replaced = false;
  try {
    await rename(permanent, previous);
    replaced = true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  try { await rename(temporary, permanent); }
  catch (error) {
    if (replaced) await rename(previous, permanent).catch(() => {});
    throw error;
  }
  if (replaced) await rm(previous, { recursive: true, force: true });
}

async function readCatalogPass(context: BrowserContext, page: Page, expectedIdentity: string,
  signal?: AbortSignal): Promise<XhsCatalogScan> {
  const pages: XhsCatalogPage[] = [];
  let cursor: string | null = "0";
  const seen = new Set<string>();
  for (let index = 0; index < 1000; index++) {
    const requested: string | null = cursor;
    const pending: { promise: Promise<XhsCatalogPage>; stop: () => void } = waitForResponse(context, CATALOG_PATH,
      (body) => parseXhsCreatorCatalogPage(body, index ? requested : null, new Date().toISOString()),
      (url) => url.searchParams.get("tab") === "0" && url.searchParams.get("page") === requested,
      WAIT_MS, signal);
    const identity = index === 0 ? waitForResponse(context, IDENTITY_PATH,
      (body) => parseXhsCreatorIdentity(body, expectedIdentity), () => true, WAIT_MS, signal) : null;
    try {
      if (index === 0) {
        await page.goto(ORIGIN + "/new/note-manager", { waitUntil: "domcontentloaded", timeout: 30_000 });
        await identity!.promise;
      } else {
        await page.locator("main div.content").evaluate((element) => { element.scrollTop = element.scrollHeight; });
      }
      const parsed: XhsCatalogPage = await pending.promise;
      if (pages.length && parsed.reportedTotal !== null && parsed.reportedTotal !== pages[0]!.reportedTotal) {
        fail("INCOMPLETE_CATALOG", "作品总数在扫描中变化");
      }
      const uniqueRecords = parsed.records.filter((record) => {
        if (seen.has(record.externalId)) return false;
        seen.add(record.externalId);
        return true;
      });
      if (index > 0 && uniqueRecords.length === 0 && parsed.nextCursor !== null) {
        fail("INCOMPLETE_CATALOG", "作品分页没有前进，已保留上次完整目录");
      }
      pages.push({ ...parsed, records: uniqueRecords });
      if (parsed.nextCursor === null) {
        if (pages[0]!.reportedTotal !== seen.size) fail("INCOMPLETE_CATALOG", "页面作品总数与实际读取数不符");
        return { pages, terminalEvidence: { kind: "platformHasMoreFalse",
          source: CATALOG_PATH, observedAt: parsed.observedAt } };
      }
      if (pages[0]!.reportedTotal !== null && seen.size === pages[0]!.reportedTotal) {
        const probeCursor = parsed.nextCursor;
        const probe = waitForResponse(context, CATALOG_PATH,
          (body) => parseXhsCreatorCatalogPage(body, null, new Date().toISOString()),
          (url) => url.searchParams.get("tab") === "0" && url.searchParams.get("page") === probeCursor,
          WAIT_MS, signal);
        try {
          await page.locator("main div.content").evaluate((element) => { element.scrollTop = element.scrollHeight; });
          const next = await probe.promise;
          if (next.records.some((record) => !seen.has(record.externalId)) ||
              (next.nextCursor !== null && next.nextCursor !== probeCursor)) {
            fail("INCOMPLETE_CATALOG", "终页探测仍发现新作品或后续分页");
          }
          const observed = { requestCursor: probeCursor, nextCursor: next.nextCursor,
            recordIds: next.records.map((record) => record.externalId), observedAt: next.observedAt };
          const responseDigest = `sha256:${createHash("sha256").update(JSON.stringify(observed)).digest("hex")}`;
          return { pages, terminalEvidence: { kind: "reportedTotalAndProbe",
            source: CATALOG_PATH, observedAt: next.observedAt,
            probe: { ...observed, responseDigest } } };
        } finally { probe.stop(); }
      }
      if (parsed.nextCursor === requested) fail("INCOMPLETE_CATALOG", "作品分页游标没有前进");
      cursor = parsed.nextCursor;
      await new Promise((resolve) => setTimeout(resolve, 3000));
    } finally { pending.stop(); identity?.stop(); }
  }
  fail("INCOMPLETE_CATALOG", "作品分页超过保护上限");
}

/** Two independent page reads are returned; the service port publishes only matching passes. */
export async function collectXhsCreatorCatalog(directory: string, expectedIdentity: string,
  signal?: AbortSignal): Promise<[XhsCatalogScan, XhsCatalogScan]> {
  const context = await openProfile(directory, true);
  try {
    const page = context.pages()[0] ?? await context.newPage();
    const first = await readCatalogPass(context, page, expectedIdentity, signal);
    await page.goto("about:blank");
    const second = await readCatalogPass(context, page, expectedIdentity, signal);
    const firstIds = first.pages.flatMap((item) => item.records.map((record) => record.externalId)).sort();
    const secondIds = second.pages.flatMap((item) => item.records.map((record) => record.externalId)).sort();
    if (firstIds.length !== secondIds.length || firstIds.some((value, index) => value !== secondIds[index])) {
      fail("INCOMPLETE_CATALOG", "两次作品扫描结果不一致，已保留上次完整目录");
    }
    return [first, second];
  } finally { await context.close().catch(() => {}); }
}
