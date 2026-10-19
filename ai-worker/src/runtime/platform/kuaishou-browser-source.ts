import { createHash } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { BrowserContext, Page, Response } from "@playwright/test";
import { guardedLaunch, chromiumSandboxOpts } from "../browser/chromium-guard";
import { launchWithBrowser } from "../browser/browser-launch";
import { promoteXhsProfile } from "./xhs-browser-source";
import {
  KS_IDENTITY_SOURCE, KS_WORK_SOURCE,
  parseKuaishouCreatorIdentity, parseKuaishouWorkPage, compareKuaishouWorkPasses,
  type KuaishouCreatorIdentity, type KuaishouWorkPage,
} from "./kuaishou-creator-normalizer";

const ORIGIN = "https://cp.kuaishou.com";
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
export const promoteKuaishouProfile = promoteXhsProfile;

export function kuaishouProfilePaths(root: string, userId: string, bindAttemptId: string, identity?: string) {
  if (!userId || !bindAttemptId) throw new Error("PROFILE_SCOPE");
  const base = join(root, "kuaishou", hash(userId));
  return { temporary: join(base, "pending", hash(bindAttemptId)),
    permanent: identity ? join(base, "accounts", hash(identity)) : null };
}

type LoginControls={signal?:AbortSignal;onStopped?:()=>Promise<void>;onStopUnconfirmed?:(retry:()=>Promise<void>)=>void};
async function closeProfile(context:BrowserContext,controls?:LoginControls){try{await context.close();}catch(error){controls?.onStopUnconfirmed?.(()=>context.close());throw error;}}
async function open(directory: string, headless: boolean,controls?:LoginControls): Promise<BrowserContext> {
  return guardedLaunch(directory, async () => {
    await mkdir(directory, { recursive: true });
    const { chromium } = await import("@playwright/test");
    return launchWithBrowser((selection) => chromium.launchPersistentContext(directory, {
      ...selection, ...chromiumSandboxOpts(), headless,
      viewport: { width: 1440, height: 900 }, locale: "zh-CN",
      timezoneId: "Asia/Shanghai", acceptDownloads: false,
      args: ["--no-first-run", "--no-default-browser-check"],
    }));
  }, { label: "快手创作者浏览器",signal:controls?.signal,onStopped:controls?.onStopped });
}

function observe<T>(context: BrowserContext, pathname: string,
  parse: (body: unknown, response: Response) => T, match: (response: Response) => boolean,
  timeoutMs: number, ignoreUnavailable = false,signal?:AbortSignal) {
  let stop = () => {};
  const promise = new Promise<T>((resolve, reject) => {
    let settled = false;
    const finish = (error: unknown, value?: T) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      context.off("response", receive);
      context.off("close", closed);
      signal?.removeEventListener("abort",aborted);
      error ? reject(error) : resolve(value!);
    };
    const closed = () => finish(new Error("BROWSER_CLOSED"));
    const aborted=()=>finish(new Error("CANCELLED"));
    const timer = setTimeout(() => finish(new Error("SOURCE_TIMEOUT")), timeoutMs);
    const receive = async (response: Response) => {
      let url: URL;
      try { url = new URL(response.url()); } catch { return; }
      if (url.origin !== ORIGIN || url.pathname !== pathname || response.request().method() !== "POST" || !match(response)) return;
      if (response.status() === 401 || response.status() === 403) {
        if (!ignoreUnavailable) finish(new Error("LOGIN_REQUIRED"));
        return;
      }
      if (response.status() === 429) return finish(new Error("PLATFORM_LIMIT"));
      if (response.status() !== 200) return;
      try { finish(null, parse(await response.json(), response)); }
      catch (error) {
        if (error instanceof Error && error.message.includes("No resource with given identifier")) return;
        if (ignoreUnavailable && error instanceof Error &&
            ["DATA_UNAVAILABLE", "DATA_SCHEMA"].includes(error.message)) return;
        finish(error);
      }
    };
    stop = () => finish(new Error("CANCELLED"));
    context.on("response", receive);
    context.on("close", closed);
    signal?.addEventListener("abort",aborted,{once:true});if(signal?.aborted)aborted();
  });
  void promise.catch(() => {});
  return { promise, stop };
}

/** Human logs in inside a new CreatorOS-owned profile. No browser cookie import. */
export async function loginKuaishouCreator(directory: string,controls?:LoginControls): Promise<KuaishouCreatorIdentity> {
  const context = await open(directory, false,controls);
  const identity = observe(context, KS_IDENTITY_SOURCE,
    (body) => parseKuaishouCreatorIdentity(body), () => true, 8 * 60_000, true,controls?.signal);
  try {
    const page = context.pages()[0] ?? await context.newPage();
    await page.goto(ORIGIN + "/", { waitUntil: "domcontentloaded", timeout: 120_000 });
    return await identity.promise;
  } finally { identity.stop(); await closeProfile(context,controls); }
}

export async function readKuaishouCreatorIdentity(directory: string,
  expectedIdentity: string,controls?:LoginControls): Promise<KuaishouCreatorIdentity> {
  const context = await open(directory, true,controls);
  const identity = observe(context, KS_IDENTITY_SOURCE,
    (body) => parseKuaishouCreatorIdentity(body, expectedIdentity), () => true, 120_000,false,controls?.signal);
  try {
    const page = context.pages()[0] ?? await context.newPage();
    await page.goto(ORIGIN + "/", { waitUntil: "domcontentloaded", timeout: 120_000 });
    return await identity.promise;
  } finally { identity.stop(); await closeProfile(context,controls); }
}

async function readPass(context: BrowserContext, page: Page, expectedIdentity: string,signal?:AbortSignal): Promise<KuaishouWorkPage[]> {
  const pages: KuaishouWorkPage[] = [];
  let cursor: string | null = null;
  const seen = new Set<string>();
  for (let index = 0; index < 1000; index++) {
    const requested: string | null = cursor;
    const pending: { promise: Promise<KuaishouWorkPage>; stop: () => void } = observe(context, KS_WORK_SOURCE,
      (body) => parseKuaishouWorkPage(body, requested, new Date().toISOString()),
      (response) => {
        try {
          const body = response.request().postDataJSON() as { queryType?: string; cursor?: string };
          return body.queryType === "0" && (index === 0 || body.cursor === requested);
        } catch { return false; }
      }, 120_000,false,signal);
    try {
      if (index === 0) {
        await page.goto(ORIGIN + "/article/manage/video?status=0", { waitUntil: "domcontentloaded", timeout: 120_000 });
      } else {
        await page.locator("#main-container").evaluate((element) => { element.scrollTop = element.scrollHeight; });
      }
      const parsed = await pending.promise;
      if (pages.length && parsed.reportedTotal !== pages[0]!.reportedTotal) throw new Error("INCOMPLETE_CATALOG");
      const works = parsed.works.filter((work) => {
        if (seen.has(work.externalId)) return false;
        seen.add(work.externalId);
        return true;
      });
      if (index && works.length === 0 && parsed.nextCursor !== null) throw new Error("INCOMPLETE_CATALOG");
      pages.push({ ...parsed, works });
      if (parsed.nextCursor === null) {
        compareKuaishouWorkPasses(pages, pages);
        return pages;
      }
      cursor = parsed.nextCursor;
      await new Promise((resolve) => setTimeout(resolve, 3000));
    } finally { pending.stop(); }
  }
  throw new Error("INCOMPLETE_CATALOG");
}

export async function collectKuaishouCreatorCatalog(directory: string, expectedIdentity: string,controls?:LoginControls): Promise<{
  first: KuaishouWorkPage[]; second: KuaishouWorkPage[];
  identity: KuaishouCreatorIdentity;
}> {
  const context = await open(directory, true,controls);
  try {
    const page = context.pages()[0] ?? await context.newPage();
    const current = observe(context, KS_IDENTITY_SOURCE,
      (body) => parseKuaishouCreatorIdentity(body, expectedIdentity), () => true, 120_000,false,controls?.signal);
    let identity: KuaishouCreatorIdentity;
    try {
      await page.goto(ORIGIN + "/", { waitUntil: "domcontentloaded", timeout: 120_000 });
      identity = await current.promise;
    } finally { current.stop(); }
    const first = await readPass(context, page, expectedIdentity,controls?.signal);
    await page.goto("about:blank");
    const secondIdentity = observe(context, KS_IDENTITY_SOURCE,
      (body) => parseKuaishouCreatorIdentity(body, expectedIdentity), () => true, 120_000,false,controls?.signal);
    try {
      await page.goto(ORIGIN + "/", { waitUntil: "domcontentloaded", timeout: 120_000 });
      await secondIdentity.promise;
    } finally { secondIdentity.stop(); }
    const second = await readPass(context, page, expectedIdentity,controls?.signal);
    compareKuaishouWorkPasses(first, second);
    return { first, second, identity };
  } finally { await closeProfile(context,controls); }
}
