import { chromium, type Browser, type BrowserServer } from "@playwright/test";
import { z } from "zod";
import { browserActionPreparationSchema,agenticToolOutcomeSchema, type AgenticToolOutcome, type WorkerPort } from "@creatoros/contract/execution-worker";
import {createResearchBrowserSessions} from "./research-browser-sessions";
import {mergeBrowserLoginStates} from "./browser-login-state";
import { createBrowserScrapeAdapter } from "../runtime/browser/search-browser";
import { searchBundledBrowserWithFallback, createBrowserSearchFallbackState } from "../runtime/browser/browser-search-fallback";
import { readUrl, WebReaderLoginRequiredError } from "../runtime/browser/web-reader";
import { assertUrlAllowed, collectRedirectChainUrls, UrlBlockedError } from "../runtime/browser/url-guard";
import { GenerationFailure } from "./generation-error";
import { launchWithBrowser, BrowserRuntimeUnavailableError } from "../runtime/browser/browser-launch";
import { webDomainFromUrl } from "../runtime/browser/web-session";

export interface ResearchToolExecutor {
  execute(name: string, input: unknown, scope: { callId: string; signal: AbortSignal }): Promise<AgenticToolOutcome>;
}
interface Dependencies {
  call(port: WorkerPort, input: unknown, signal?: AbortSignal): Promise<unknown>;
  signal: AbortSignal;
  launchServer?: () => Promise<BrowserServer>;
  connect?: (endpoint: string) => Promise<Browser>;
  guardUrl?: (url: string) => Promise<void>;
  read?: typeof readUrl;
  sessionAccess?: {
    read(callId:string,signal:AbortSignal):Promise<unknown>;
    save(input:{callId:string;revision:string|null;stateJson:string},signal:AbortSignal):Promise<unknown>;
  };
  onRead?: (callId:string,observation:{sourceUrl:string;title:string;fullText:string},signal:AbortSignal)=>Promise<AgenticToolOutcome>;
}
const sessionSchema = z.object({ domain: z.string().min(1), stateJson: z.string().nullable(), revision: z.string().nullable() });
const readParams = z.object({ url: z.string().url(), snapshotId: z.string().optional() }).passthrough();
const searchParams = z.object({ query: z.string().min(1), count: z.number().int().min(1).max(100).optional() });
const transient = (): AgenticToolOutcome => ({ status: "error", summary: "网页操作失败，可调整查询或换来源后重试", evidence: [], error: { code: "transient", retryable: true, recovery: "修改查询或使用其他公开来源" }, continuation: null, sideEffect: "none" });

/** 仅处理固定研究工具；浏览器属于当前Worker，登录态只经私有命名端口传递。 */
export function createResearchWorkerTools(deps: Dependencies) {
  const guard = deps.guardUrl ?? assertUrlAllowed;
  const abort = new AbortController();
  const signal = AbortSignal.any([deps.signal, abort.signal]);
  let closing: Promise<void> | undefined;
  let server: BrowserServer | undefined;
  let browser: Browser | undefined;
  let starting: Promise<Browser> | undefined;
  const pids = new Set<number>();
  const contexts = new Set<{ close(): Promise<void> }>();
  const pendingContexts = new Set<Promise<unknown>>();
  const blockedDomains = new Set<string>();
  const searchState = { state: createBrowserSearchFallbackState() };
  type Prepared=Extract<z.infer<typeof browserActionPreparationSchema>,{status:"ready"}>;
  const preparedPages=new Map<string,Prepared>();
  let browserAuthorization:Prepared["authorization"]|undefined;
  const guardBrowserUrl=async(url:string)=>{
    await guard(url);
    const parsed=new URL(url);
    if(!browserAuthorization?.allowedDomains.includes(parsed.hostname) || parsed.username || parsed.password || !["http:","https:"].includes(parsed.protocol))throw new UrlBlockedError("浏览器地址超出用户授权范围");
  };
  const host = async (port: WorkerPort, input: unknown, requestSignal: AbortSignal) => {
    try { return await deps.call(port, input, requestSignal); }
    catch { requestSignal.throwIfAborted(); throw new GenerationFailure("unknown_result", "RESEARCH_HOST_RECEIPT_UNKNOWN"); }
  };
  const getBrowser = async () => {
    signal.throwIfAborted();
    // 只在下一次已授权调用恢复连接，不重放当前未知状态的网页操作。
    if (browser && !browser.isConnected()) {
      const previous = server;
      browser = undefined; server = undefined; starting = undefined;
      await previous?.close().catch(() => {});
      signal.throwIfAborted();
    }
    return starting ??= (async () => {
      try {
        server = await (deps.launchServer ?? (() => launchWithBrowser(selection => { signal.throwIfAborted(); return chromium.launchServer({ ...selection, headless: true, timeout: 15000 }); })))();
        const pid = server.process().pid; if (pid) pids.add(pid);
        signal.throwIfAborted();
        browser = await (deps.connect ?? (endpoint => chromium.connect(endpoint, { timeout: 15000 })))(server.wsEndpoint());
        signal.throwIfAborted(); return browser;
      } catch (error) {
        await browser?.close().catch(() => {}); await server?.close().catch(() => {});
        if(!signal.aborted){browser=undefined;server=undefined;starting=undefined;}
        throw error;
      }
    })();
  };
  async function createContext(callId: string, toolSignal: AbortSignal, session?: z.infer<typeof sessionSchema>) {
    const combined = AbortSignal.any([signal, toolSignal]); combined.throwIfAborted();
    const connected = await getBrowser(); combined.throwIfAborted();
    let storageState: Exclude<NonNullable<Parameters<Browser["newContext"]>[0]>["storageState"], string>;
    if (session?.stateJson) {
      if (Buffer.byteLength(session.stateJson) > 2 * 1024 * 1024) throw new WebReaderLoginRequiredError(session.domain);
      storageState = z.object({ cookies: z.array(z.unknown()), origins: z.array(z.unknown()) }).parse(JSON.parse(session.stateJson)) as typeof storageState;
    }
    const ctx = await connected.newContext({ serviceWorkers: "block", ...(storageState ? { storageState } : {}) });
    let closed: Promise<void> | undefined;
    const onAbort = () => { void ctx.close().catch(() => {}); };
    const handle = { close: () => closed ??= (async () => {
      try {
        if (session && !combined.aborted) {
          const stateJson = JSON.stringify(await ctx.storageState());
          if (Buffer.byteLength(stateJson) <= 2 * 1024 * 1024) {
            // CAS冲突/取消拒绝保存不影响已取得正文，也绝不换revision覆盖。
            await (deps.sessionAccess ? deps.sessionAccess.save({callId,revision:session.revision,stateJson},combined) : deps.call("saveBrowserSession", { callId, revision: session.revision, stateJson }, combined)).catch(() => {});
          }
        }
      } catch { /* 会话保存失败仍须释放浏览器 */ }
      finally { combined.removeEventListener("abort", onAbort); await ctx.close().catch(() => {}); contexts.delete(handle); }
    })() };
    contexts.add(handle); combined.addEventListener("abort", onAbort, { once: true });
    try {
      combined.throwIfAborted();
      await ctx.route("**/*", async route => {
        try { combined.throwIfAborted(); await guard(route.request().url()); combined.throwIfAborted(); await route.continue(); }
        catch { await route.abort("blockedbyclient").catch(() => {}); }
      });
      // 研究网页不需要双向socket；明确关闭，避免ws绕过http URL守卫。
      await ctx.routeWebSocket("**/*", ws => ws.close());
      combined.throwIfAborted();
      return {
        pages: () => [],
        newPage: async () => {
          const page = await ctx.newPage();
          return new Proxy(page, { get(target, key) {
            if (key === "goto") return async (...args: Parameters<typeof page.goto>) => {
              await guard(args[0]); combined.throwIfAborted();
              const response = await target.goto(...args);
              if (response) for (const url of collectRedirectChainUrls(response)) await guard(url);
              await guard(target.url()); combined.throwIfAborted(); return response;
            };
            const value = Reflect.get(target, key, target); return typeof value === "function" ? value.bind(target) : value;
          } });
        },
        close: handle.close,
      };
    } catch (error) { await handle.close(); throw error; }
  }
  const openContext = (callId: string, toolSignal: AbortSignal, session?: z.infer<typeof sessionSchema>) => {
    const pending = createContext(callId, toolSignal, session); pendingContexts.add(pending);
    void pending.then(() => pendingContexts.delete(pending), () => pendingContexts.delete(pending)); return pending;
  };
  const browserPages=createResearchBrowserSessions({guardUrl:guardBrowserUrl,openPage:async(sessionId,pageSignal)=>{
    const prepared=preparedPages.get(sessionId);if(!prepared)throw new Error("BROWSER_PREPARATION_MISSING");
    const combined=AbortSignal.any([signal,pageSignal]);combined.throwIfAborted();
    const connected=await getBrowser();combined.throwIfAborted();
    const storageState=mergeBrowserLoginStates((prepared.loginStates??[]).map(row=>row.stateJson));
    const ctx=await connected.newContext({serviceWorkers:"block",storageState});
    const handle={close:()=>ctx.close()};contexts.add(handle);
    const onAbort=()=>{void ctx.close().catch(()=>{});};combined.addEventListener("abort",onAbort,{once:true});
    ctx.once("close",()=>{contexts.delete(handle);combined.removeEventListener("abort",onAbort);});
    try{
      combined.throwIfAborted();
      await ctx.route("**/*",async route=>{
        try{
          combined.throwIfAborted();await guard(route.request().url());
          if(route.request().isNavigationRequest() && !route.request().frame().parentFrame())await guardBrowserUrl(route.request().url());
          combined.throwIfAborted();await route.continue();
        }catch{await route.abort("blockedbyclient").catch(()=>{});}
      });
      await ctx.routeWebSocket("**/*",ws=>ws.close());
      const page=await ctx.newPage();
      page.once("close",()=>{void ctx.close().catch(()=>{});});
      ctx.on("page",popup=>{void popup.close().catch(()=>{});});
      combined.throwIfAborted();return page;
    }catch(error){await ctx.close().catch(()=>{});throw error;}
  }});
  const close = () => closing ??= (async () => {
    abort.abort();
    // 先关已知server以打断connect/newContext；不能先等它们结束才释放底层连接。
    await server?.close().catch(() => {});
    await starting?.catch(() => {});
    await Promise.all([browser?.close().catch(() => {}), server?.close().catch(() => {})]);
    await browserPages.close();preparedPages.clear();
    await Promise.allSettled([...pendingContexts]);
    await Promise.all([...contexts].map(context => context.close()));
    deps.signal.removeEventListener("abort", onRunAbort);
  })();
  const onRunAbort = () => { void close(); };
  deps.signal.addEventListener("abort", onRunAbort, { once: true });
  const execute=async(name: string, input: unknown, scope: { callId: string; signal: AbortSignal }): Promise<AgenticToolOutcome> => {
      const combined = AbortSignal.any([signal, scope.signal]); combined.throwIfAborted();
      if (!["web.search","web.read","browser.observe","browser.act"].includes(name)) throw new Error("RESEARCH_TOOL_NOT_SUPPORTED");
      try {
        if(name==="browser.observe" || name==="browser.act"){
          const prepared=browserActionPreparationSchema.parse(await host("prepareBrowserAction",{callId:scope.callId},combined));
          if(prepared.status==="blocked")return prepared.outcome;
          browserAuthorization=prepared.authorization;preparedPages.set(prepared.input.sessionId,prepared);
          combined.throwIfAborted();
          const output=await browserPages.execute(name,prepared.input,{signal:combined,initialUrl:prepared.url});
          const observation=(output.data as {observation?:{text?:unknown}}|undefined)?.observation;
          if((output.status==="ok" || output.status==="partial") && output.error===null && output.sideEffect!=="unknown" && typeof observation?.text==="string" && observation.text.trim()){
            // 动作已发生，取消后也允许记录真实观察；该私有结算不携带admission signal。
            try{return agenticToolOutcomeSchema.parse(await deps.call("settleBrowserObservation",{callId:scope.callId,output}));}
            catch{throw new GenerationFailure("unknown_result","BROWSER_EVIDENCE_RECEIPT_UNKNOWN");}
          }
          return output;
        }
        if (name === "web.search") {
          const params = searchParams.parse(input);
          const adapter = createBrowserScrapeAdapter({ openContext: () => openContext(scope.callId, combined), saveScreenshot: async () => {} });
          const results = await searchBundledBrowserWithFallback(params.query, { count: params.count ?? 10, signal: combined },
            (baseUrl, query, options) => adapter.search({ provider: "browser", baseUrl, model: "", token: "" }, query, { count: options?.count ?? 10, timeoutMs: 15000, signal: combined }), undefined, searchState);
          return agenticToolOutcomeSchema.parse({ status: "ok", summary: `联网检索到 ${results.length} 条`, evidence: results.map(row => ({ sourceUrl: row.url, title: row.title, text: row.snippet })), data: { results }, error: null, continuation: null, sideEffect: "none" });
        }
        const params = readParams.parse(input);
        if (params.snapshotId) return agenticToolOutcomeSchema.parse(await host("executeEvidenceRead", { callId: scope.callId }, combined));
        await guard(params.url); combined.throwIfAborted();
        const domain = webDomainFromUrl(params.url);
        if (blockedDomains.has(domain)) return { status: "blocked", summary: "该来源尚需登录或验证，本轮不重复访问", evidence: [], error: { code: "needs_login", retryable: false, recovery: "换公开来源或完成登录后恢复" }, continuation: null, sideEffect: "none" };
        const response=await (deps.sessionAccess ? deps.sessionAccess.read(scope.callId,combined) : host("readBrowserSession", { callId: scope.callId }, combined));
        const blocked=z.object({status:z.literal("blocked"),outcome:agenticToolOutcomeSchema}).strict().safeParse(response);
        if(blocked.success)return blocked.data.outcome;
        const session = sessionSchema.parse(response);
        if(session.domain!==domain)throw new GenerationFailure("unknown_result","BROWSER_SESSION_OWNER_MISMATCH");
        const read = await (deps.read ?? readUrl)(params.url, { authDir: "", signal: combined }, { openContext: () => openContext(scope.callId, combined, session), guardUrl: guard });
        const observation={sourceUrl:read.finalUrl,title:read.title,fullText:read.text};
        return agenticToolOutcomeSchema.parse(await (deps.onRead ? deps.onRead(scope.callId,observation,combined) : host("settleResearchRead", { callId: scope.callId, observation }, combined)));
      } catch (error) {
        combined.throwIfAborted();
        if (error instanceof GenerationFailure) throw error;
        if(error instanceof Error && ["BROWSER_LOGIN_STATE_CONFLICT","BROWSER_LOGIN_STATE_INVALID"].includes(error.message))return {status:"blocked",summary:"网站登录状态需要恢复",evidence:[],error:{code:"needs_login",retryable:false,recovery:"通过网站登录入口重新登录后恢复"},continuation:null,sideEffect:"none"};
        if (error instanceof BrowserRuntimeUnavailableError) return { status: "blocked", summary: "浏览器运行环境不可用", evidence: [], data: { recoveryState: "browser_runtime_unavailable" }, error: { code: "permission", retryable: false, recovery: "修复系统或随包浏览器后恢复" }, continuation: null, sideEffect: "none" };
        if (error instanceof WebReaderLoginRequiredError) {
          blockedDomains.add(error.domain);
          return { status: "blocked", summary: "来源需要登录或人工验证", evidence: [], error: { code: "needs_login", retryable: false, recovery: "在网站登录保管库完成登录后恢复" }, continuation: null, sideEffect: "none" };
        }
        if (error instanceof UrlBlockedError || (error instanceof Error && "code" in error && error.code === "UNSAFE_URL")) return { status: "blocked", summary: "来源地址不允许访问", evidence: [], error: { code: "permission", retryable: false, recovery: "使用公开网页来源" }, continuation: null, sideEffect: "none" };
        return transient();
      }
    };
  let executionTail:Promise<unknown>=Promise.resolve();
  return {close,browserProcessIds:()=>[...pids],execute(name:string,input:unknown,scope:{callId:string;signal:AbortSignal}){
    // 同一任务的网站动作串行，web.read与交互页面不能同时使用底层登录profile。
    const pending=executionTail.then(()=>execute(name,input,scope));
    executionTail=pending.catch(()=>{});return pending;
  }};
}
