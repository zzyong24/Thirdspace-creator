import "server-only";

// [T-217b] Web Reader —— 带登录态读**正文全文**(取代 headless 截公开页首屏图的默认路径)。
//
// 与 web-capture.captureUrl 平级、复用其**三墙错误分类**(打不开 / HTTP 码 / 登录墙),但两点不同:
//   ① 启动方式:launchPersistentContext(webAuthDirFor(domain))(带 `.auth/web/` 登录态),
//      而非 web-capture 的干净无头 chromium.launch —— 于是能读「你登录后才看得到」的页;
//   ② 输出:抽**可读正文纯文本**(而非截图字节)。
//
// 抽取策略(SPEC §2.2,用户拍板:通用兜底 + ChatGPT 定制先落,其余站点按实际链接增量加):
//   · ChatGPT share 定制 extractor(T-237 三层修复,2026-07 真机核实):chatgpt.com **已不是
//     Next.js**(无 __NEXT_DATA__),是 React Router 流式 SSR —— 全量对话在若干
//     `window.__reactRouterContext.streamController.enqueue("…")` 的转义 JSON(turbo-stream
//     扁平引用池)里,含 linear_conversation 逐轮 message。首选路径 = 拼接这些 script 分片 →
//     解引用 → 抽全量轮次(不依赖页面渲染,长对话不截断);结构对不上诚实返 null,回落
//     「滚真容器 + DOM textContent」兜底(不再正则扒原始 HTML,杜绝 `<div` 标签泄漏进正文);
//   · 通用兜底:Mozilla Readability(去导航/广告/侧栏,抽文章正文)→ 纯文本。
//
// 分层(与 douyin-cdp / web-capture 一致):抽取函数(extractChatGptShare / extractReadable)是
// **纯函数**(HTML 字符串进、文本出),可确定性单测;readUrl 经 openContext 端口注入(默认真
// launchPersistentContext;单测注 fake page/context 返回 fixture HTML),不起真浏览器。

import { WebCaptureError, detectLoginWall, makeAbortError } from "./web-capture";
import { webDomainFromUrl } from "./web-session";
import {
  UrlBlockedError,
  assertUrlAllowed,
  collectRedirectChainUrls,
} from "./url-guard";

/** 无有效会话 / 会话过期 —— 结构化降级信号(不截登录页糊弄)。携带 domain 供编导引导用户
 *  「去保管库登录一次」。是 WebCaptureError 的子类,复用三墙分类的 catch 通路。 */
export class WebReaderLoginRequiredError extends WebCaptureError {
  readonly domain: string;
  constructor(domain: string) {
    super(
      `「${domain}」需要先登录才能读到正文。请去设置 → 网站登录保管库登录一次,登好我再读。`,
      { code: "LOGIN_WALL" },
    );
    this.name = "WebReaderLoginRequiredError";
    this.domain = domain;
  }
}

export interface ReadResult {
  /** 正文纯文本(已去导航/广告;ChatGPT 逐轮对话则含 user/assistant 每轮全文)。 */
  text: string;
  /** 页面标题(素材命名用)。 */
  title: string;
  /** 跟随重定向后的最终 URL。 */
  finalUrl: string;
  /** 命中的抽取器(chatgpt-share | readability),存证/可观测用。 */
  extractor: "chatgpt-share" | "readability" | "rendered-text";
  /**
   * [T-237] 抽取路径诊断透出:ssr = 从流式 SSR script JSON 抽全量(不依赖渲染,长对话可信);
   * dom = 渲染后 DOM 兜底(懒渲染场景可能不全);readability = 通用正文抽取。
   * 供上层拼「抽到 N 轮(SSR 全量)/(DOM,可能不全)」给编导如实转述,而非让它猜。
   */
  extractPath: "ssr" | "dom" | "readability" | "rendered-text";
  /** [T-237] ChatGPT 对话抽到的轮次数(user/assistant 各算一轮);非对话页为 null。 */
  turnCount: number | null;
}

const NAV_TIMEOUT_MS = 30_000; // SPA 正文渲染比截图慢,给 30s

// readUrl 只依赖 page/context 的这几个能力(收窄便于 fake page 单测)。真实 Playwright
// Page/BrowserContext 结构上满足(默认注入时向上转型目标)。
interface ReaderNavResponse {
  status(): number;
  url(): string;
  /** [T-326·RT-H04] 真实 Playwright Response 有 request()(供重定向链复检);fake 可缺省。 */
  request?(): unknown;
}
export interface ReaderCapablePage {
  goto(
    url: string,
    opts?: { waitUntil?: string; timeout?: number },
  ): Promise<ReaderNavResponse | null>;
  url(): string;
  title(): Promise<string>;
  content(): Promise<string>;
  waitForTimeout(ms: number): Promise<void>;
  /** 等正文容器渲染(SPA);拿不到 selector 不抛(catch 成 noop),继续用当前 DOM 兜底。 */
  waitForSelector(
    selector: string,
    opts?: { timeout?: number },
  ): Promise<unknown>;
  /** 页内求值:滚动/收集轮次(fn 会被序列化进页面执行,须自包含);注入 fake 时可 noop。 */
  evaluate<R, A = unknown>(fn: (arg: A) => R | Promise<R>, arg?: A): Promise<R>;
}
export interface ReaderCapableContext {
  pages(): ReaderCapablePage[];
  newPage(): Promise<ReaderCapablePage>;
  close(): Promise<void>;
}

/** readUrl 的可注入依赖(单测注 fake ctx)。
 *  [T-370b] 运行时(persistence-client)注入 **profile 池** openContext(pool.checkout(domain):
 *  域亲和 sticky + DB browser_sessions 解密注入,close = 回写 DB + clearCookies + 归还)——
 *  默认 realOpenReaderContext(直开 authDir persistent profile)保留为无池调用方/存量兜底。 */
export interface ReadUrlDeps {
  openContext?: (authDir: string) => Promise<ReaderCapableContext>;
  /** [T-326·RT-H04] SSRF 守卫(默认真 assertUrlAllowed:协议白名单 + 私网/回环/链路本地/
   *  云元数据阻断 + DNS 解析复核);单测可注 fake lookup 的守卫,不打真 DNS。 */
  guardUrl?: (url: string) => Promise<void>;
}

/** UrlBlockedError → WebCaptureError(保持三墙错误分类通路;message 已是人话原样带过)。 */
function toReaderError(err: unknown): Error {
  if (err instanceof UrlBlockedError) {
    return new WebCaptureError(err.message, { code: "UNSAFE_URL" });
  }
  return err instanceof Error ? err : new Error(String(err));
}

async function realOpenReaderContext(
  authDir: string,
): Promise<ReaderCapableContext> {
  const { chromium } = await import("@playwright/test");
  const { mkdir } = await import("node:fs/promises");
  const { guardedLaunch, chromiumSandboxOpts } = await import("./chromium-guard");
  await mkdir(authDir, { recursive: true }).catch(() => {});
  // 有头/无头:读取用 headless(不弹窗,复用 .auth/web 登录态);与 web-session.loginWeb 分工。
  // [T-307] 必须和 web-session.loginWeb **同一套浏览器选择**(优先系统 Chrome → 回落打包 chromium):
  //   登录写 profile 的浏览器和读 profile 的浏览器不一致 → Chrome 钥匙串加密的 cookie 读不出 → 误报「未登录」。
  //   channel:"chrome" headless 用系统 Chrome 二进制(非 chrome-headless-shell),顺带绕 T-299 那个坑。
  // [T-369] guardedLaunch:预检杀残留+清锁(只清锁,不动登录态)→ 同 profile 串行 → 超时人话报错。
  const { launchWithBrowser } = await import("./douyin-cdp");
  const ctx = await guardedLaunch(
    authDir,
    () =>
      launchWithBrowser((sel) =>
        chromium.launchPersistentContext(authDir, {
          headless: true,
          ...sel,
          ...chromiumSandboxOpts(), // [T-369] 去掉 Playwright 默认 --no-sandbox
          viewport: { width: 1440, height: 900 },
          args: ["--disable-blink-features=AutomationControlled"],
        }),
      ),
    { label: "网页读取浏览器" },
  );
  return ctx as unknown as ReaderCapableContext;
}

// ── ChatGPT share 定制 extractor(纯函数,可单测)────────────────────────────

/** 一轮对话(role 原样保留;text 已是纯文本)。 */
export interface ChatTurn {
  role: string;
  text: string;
}

/**
 * [T-237·修①] 从 chatgpt.com/share/* 的 HTML 抽**SSR 数据源**里的逐轮对话(不依赖页面渲染,
 * 长对话不截断)。先试当前真实结构 —— React Router 流式 SSR 的
 * `streamController.enqueue("…")` 转义 JSON 分片(turbo-stream 扁平引用池,含
 * linear_conversation / mapping 逐轮 message);再试历史 __NEXT_DATA__(旧 Next.js 结构,兼容
 * 存档 HTML)。结构对不上 → 诚实返 null(调用方走 DOM 兜底,绝不硬凑)。
 */
export function extractChatGptShareSsr(html: string): ChatTurn[] | null {
  const fromStream = extractTurnsFromReactRouterStream(html);
  if (fromStream && fromStream.length) return fromStream;
  const fromNext = extractTurnsFromNextData(html);
  if (fromNext && fromNext.length) return fromNext;
  return null;
}

/**
 * 兼容旧签名的字符串版(SSR → 正则 DOM 最后兜底)。readUrl 主路径已改用
 * extractChatGptShareSsr + 页内 textContent 兜底;此函数保留给「只有 HTML 字符串、没有活页面」
 * 的调用方(及既有单测)。
 */
export function extractChatGptShare(html: string): string | null {
  const ssr = extractChatGptShareSsr(html);
  if (ssr && ssr.length) return formatChatTurns(ssr);
  const fromDom = extractFromAuthorRoleDom(html);
  if (fromDom && fromDom.trim()) return fromDom;
  return null;
}

/** 逐轮对话 → 「角色:\n正文」段落文本。 */
export function formatChatTurns(turns: ChatTurn[]): string {
  return turns.map((t) => `${roleLabel(t.role)}:\n${t.text}`).join("\n\n");
}

// ── React Router 流式 SSR(turbo-stream)解码(2026-07 真机核实的当前结构)─────────
//
// 页面含若干 `<script>window.__reactRouterContext.streamController.enqueue("…")</script>`,
// 每个入参是 JS 字符串字面量(JSON 转义)。全部解转义拼接后,开头是一个**扁平引用池**大数组:
//   · pool[0] 是根对象;
//   · 对象编码为 { "_K": V }:键 = pool[K](字符串),值 = 解引用 pool[V];
//   · 数组编码为纯下标数组 [i, j, …](逐个解引用);首元素为字符串的是类型标签值
//     (["P",id] Promise 等),对话抽取不需要 → 视作 null;
//   · 负下标是特殊常量(undefined/null/NaN…)→ 视作 null;
//   · 主数组之后还有 "P32:[…]" 这类 Promise 延迟块(对话数据不在其中,忽略)。
// 对话在 loaderData → serverResponse → data 里:linear_conversation(有序逐轮)/ mapping。

function extractTurnsFromReactRouterStream(html: string): ChatTurn[] | null {
  // 收集全部 enqueue("…") 的 JS 字符串字面量分片(可能被流式切成多段,按出现顺序拼接)。
  const re = /streamController\.enqueue\("((?:[^"\\]|\\.)*)"\)/g;
  const chunks: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    try {
      chunks.push(JSON.parse(`"${m[1]}"`) as string); // 解 JS/JSON 字符串转义
    } catch {
      // 单片转义损坏 → 跳过该片(尽力拼接,主数组若因此断裂会在 JSON.parse 处诚实失败)
    }
  }
  if (!chunks.length) return null;
  const joined = chunks.join("");
  const arrayText = sliceLeadingJsonArray(joined);
  if (!arrayText) return null;
  let pool: unknown;
  try {
    pool = JSON.parse(arrayText);
  } catch {
    return null;
  }
  if (!Array.isArray(pool) || !pool.length) return null;
  const root = resolveTurboStreamPool(pool as unknown[]);
  return collectTurnsFromResolved(root);
}

/** 取字符串开头(容忍前导空白)的第一个完整 JSON 数组文本;没有 → null。 */
function sliceLeadingJsonArray(s: string): string | null {
  const start = s.search(/\S/);
  if (start === -1 || s[start] !== "[") return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < s.length; i++) {
    const ch = s[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
    } else if (ch === '"') inStr = true;
    else if (ch === "[" || ch === "{") depth++;
    else if (ch === "]" || ch === "}") {
      depth--;
      if (depth === 0) return s.slice(start, i + 1);
    }
  }
  return null; // 数组未闭合(分片缺失)→ 诚实失败
}

/** 解 turbo-stream 扁平引用池为普通对象图(memo 防环;标签值/负下标 → null)。 */
function resolveTurboStreamPool(pool: unknown[]): unknown {
  const memo = new Map<number, unknown>();
  const resolve = (i: number): unknown => {
    if (!Number.isInteger(i) || i < 0 || i >= pool.length) return null;
    if (memo.has(i)) return memo.get(i);
    const v = pool[i];
    if (v === null || typeof v !== "object") {
      memo.set(i, v);
      return v;
    }
    if (Array.isArray(v)) {
      if (!v.every((e) => typeof e === "number")) {
        memo.set(i, null); // 类型标签值(["P",id] 等),对话抽取不需要
        return null;
      }
      const out: unknown[] = [];
      memo.set(i, out); // 先占位再填,防循环引用
      for (const e of v) out.push(resolve(e as number));
      return out;
    }
    const out: Record<string, unknown> = {};
    memo.set(i, out);
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      if (!k.startsWith("_") || typeof val !== "number") continue;
      const key = pool[Number(k.slice(1))];
      if (typeof key !== "string") continue;
      out[key] = resolve(val);
    }
    return out;
  };
  return resolve(0);
}

/** 从解引用后的对象图收对话轮次:优先 linear_conversation(有序全量),兜底整树深搜 message。 */
function collectTurnsFromResolved(root: unknown): ChatTurn[] | null {
  const linear = findFirstArrayByKey(root, "linear_conversation");
  if (linear) {
    const turns = linear
      .map((node) => turnFromMessageNode(node, { unwrapMessage: true }))
      .filter((t): t is ChatTurn => t !== null);
    if (turns.length) return turns;
  }
  // 兜底:mapping 等任意位置的 message 形状(顺序不保证,但至少全量)。
  const turns: ChatTurn[] = [];
  walkObjectGraph(root, (node) => {
    const t = turnFromMessageNode(node, { unwrapMessage: false });
    if (t) turns.push(t);
  });
  return turns.length ? turns : null;
}

/**
 * 从一个节点抽一轮:形如 { author:{role}, content:{parts:[…] | text} }(unwrapMessage 时先取
 * node.message)。只收 user/assistant(system/tool 是分享页不可见的噪声);parts 只取字符串
 * (多模态对象/思维链跳过);空文本跳过。
 */
function turnFromMessageNode(
  node: unknown,
  opts: { unwrapMessage: boolean },
): ChatTurn | null {
  if (!node || typeof node !== "object") return null;
  const rec = node as Record<string, unknown>;
  const msg =
    opts.unwrapMessage && rec.message && typeof rec.message === "object"
      ? (rec.message as Record<string, unknown>)
      : rec;
  const author = msg.author as { role?: unknown } | undefined;
  const content = msg.content as { parts?: unknown; text?: unknown } | undefined;
  if (!author || typeof author.role !== "string" || !content) return null;
  if (author.role !== "user" && author.role !== "assistant") return null;
  let body = "";
  if (Array.isArray(content.parts)) {
    body = content.parts
      .filter((p): p is string => typeof p === "string")
      .join("\n")
      .trim();
  }
  if (!body && typeof content.text === "string") body = content.text.trim(); // content_type=code 等
  if (!body) return null;
  return { role: author.role, text: body };
}

/** 深搜对象图,对每个对象节点回调(seen 防环;数组元素逐个下钻)。 */
function walkObjectGraph(root: unknown, visit: (node: unknown) => void): void {
  const seen = new Set<unknown>();
  const walk = (node: unknown): void => {
    if (!node || typeof node !== "object" || seen.has(node)) return;
    seen.add(node);
    if (!Array.isArray(node)) visit(node);
    const values = Array.isArray(node) ? node : Object.values(node as Record<string, unknown>);
    for (const v of values) walk(v);
  };
  walk(root);
}

/** 深搜第一个键名为 key 且值是数组的字段。 */
function findFirstArrayByKey(root: unknown, key: string): unknown[] | null {
  let found: unknown[] | null = null;
  walkObjectGraph(root, (node) => {
    if (found) return;
    const v = (node as Record<string, unknown>)[key];
    if (Array.isArray(v)) found = v;
  });
  return found;
}

// ── 历史 __NEXT_DATA__ 结构(chatgpt.com 已迁走;留作旧存档 HTML 兼容)─────────
function extractTurnsFromNextData(html: string): ChatTurn[] | null {
  const m = html.match(
    /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i,
  );
  if (!m) return null;
  let data: unknown;
  try {
    data = JSON.parse(m[1]);
  } catch {
    return null;
  }
  // 深搜任意 message 形状:{ author:{role}, content:{parts:[...]} }。
  const turns: ChatTurn[] = [];
  walkObjectGraph(data, (node) => {
    const t = turnFromMessageNode(node, { unwrapMessage: false });
    if (t) turns.push(t);
  });
  return turns.length ? turns : null;
}

function extractFromAuthorRoleDom(html: string): string | null {
  const turns: string[] = [];
  const re = /data-message-author-role="(user|assistant|system)"[^>]*>([\s\S]*?)(?=data-message-author-role=|$)/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html)) !== null) {
    const role = match[1];
    const text = stripHtml(match[2]).trim();
    if (text) turns.push(`${roleLabel(role)}:\n${text}`);
  }
  return turns.length ? turns.join("\n\n") : null;
}

function roleLabel(role: string): string {
  if (role === "user") return "用户";
  if (role === "assistant") return "ChatGPT";
  return role;
}

function stripHtml(fragment: string): string {
  return fragment
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

// ── [T-237·修②③] 页内 DOM 兜底:滚**真滚动容器**到轮次计数稳定 + textContent 收轮次 ────────
/**
 * 自包含页内函数(经 page.evaluate 序列化进浏览器执行,**只准引用 document/window,不得闭包
 * 外部符号**;单测用 jsdom stub 全局直接调用)。做两件事:
 *   ① 修③滚真容器:ChatGPT 对话列表在内部 overflow 容器里滚,window.scrollTo 无效 → 从首个
 *      [data-message-author-role] 往上找最近的 overflow-y:auto|scroll 且可滚祖先;找不到回落
 *      window。循环「滚到底 → 等 settleMs → 数轮次」,连续两轮计数不变(或到 maxRounds 上限)
 *      才停 —— 长对话懒渲染的后续轮次借此全部渲出;
 *   ② 修②textContent 抽取:逐个 [data-message-author-role] 元素取 textContent(浏览器算好的
 *      纯文本,零 HTML 标签泄漏),带 role 返回,Node 侧再拼「角色:正文」。
 */
export async function harvestChatGptTurnsInPage(opts: {
  settleMs: number;
  maxRounds: number;
}): Promise<{ role: string; text: string }[]> {
  const sel = "[data-message-author-role]";
  const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
  // 找真滚动容器:含轮次元素的最近 overflow-y auto/scroll 且实际可滚的祖先;找不到回落 window。
  const scrollToBottom = (): void => {
    let el: Element | null = document.querySelector(sel);
    el = el ? el.parentElement : null;
    while (el) {
      const style = window.getComputedStyle(el);
      if (
        /(auto|scroll)/.test(style.overflowY) &&
        el.scrollHeight > el.clientHeight
      ) {
        (el as HTMLElement).scrollTop = el.scrollHeight;
        return;
      }
      el = el.parentElement;
    }
    window.scrollTo(0, document.body.scrollHeight);
  };
  let prevCount = -1;
  let stableRounds = 0;
  for (let round = 0; round < opts.maxRounds; round++) {
    scrollToBottom();
    await wait(opts.settleMs);
    const count = document.querySelectorAll(sel).length;
    if (count === prevCount) {
      stableRounds += 1;
      if (stableRounds >= 2) break; // 连续两轮计数不变 → 渲染到底了
    } else {
      stableRounds = 0;
      prevCount = count;
    }
  }
  const out: { role: string; text: string }[] = [];
  document.querySelectorAll(sel).forEach((node) => {
    const role = node.getAttribute("data-message-author-role") || "";
    const text = (node.textContent || "").trim();
    if ((role === "user" || role === "assistant") && text) out.push({ role, text });
  });
  return out;
}

// ── 通用 Readability(jsdom + @mozilla/readability,Node 侧执行;dynamic import 不进顶层 bundle)──
/**
 * 通用正文抽取:jsdom 解析 HTML → Mozilla Readability → { title, text }。抽不到(极短页/纯
 * 交互页)→ null。**Node 侧执行**(不往 page 里注脚本):readUrl 拿 page.content() 的 HTML 字符串
 * 后调它,故可脱离浏览器单测(传 fixture HTML)。
 */
export async function extractReadable(
  html: string,
  url: string,
): Promise<{ title: string; text: string } | null> {
  const { JSDOM } = await import("jsdom");
  const { Readability } = await import("@mozilla/readability");
  const dom = new JSDOM(html, { url });
  const parsed = new Readability(dom.window.document).parse();
  if (!parsed) return null;
  const text = (parsed.textContent ?? "").replace(/\n{3,}/g, "\n\n").trim();
  if (!text) return null;
  return { title: (parsed.title ?? "").trim(), text };
}

/**
 * [T-217b] 带登录态读一个 URL 的正文全文。launchPersistentContext(authDir) → goto(复用
 * web-capture 三墙分类:打不开 / HTTP 码 / 登录墙)→ 等 SPA 正文渲染 + 滚动懒加载 → 抽正文
 * (ChatGPT share 定制 → 通用 Readability 兜底)。无会话/过期(登录墙命中)→ 抛
 * WebReaderLoginRequiredError(结构化降级,不截登录页)。openContext 端口注入,故错误分类 +
 * 抽取器选择可单测。
 */
export async function readUrl(
  url: string,
  opts: {
    authDir: string;
    /** [T-239c] 中断信号(additive):用户停止本轮对话 → 关浏览器提前退出,抛 AbortError。 */
    signal?: AbortSignal;
  },
  deps: ReadUrlDeps = {},
): Promise<ReadResult> {
  const target = url.trim();
  if (!/^https?:\/\//i.test(target)) {
    throw new WebCaptureError(
      `页面打不开:只支持 http/https 链接(收到「${target.slice(0, 80)}」)`,
      { code: "UNSAFE_URL" },
    );
  }
  // [T-326·RT-H04] SSRF 前置守卫:私网/回环/链路本地/云元数据地址在**起浏览器之前**就拒
  // (协议白名单 + IP 字面量直接判 + 域名 DNS 解析逐地址判;DNS 解析失败放行,goto 会诚实失败)。
  const guardUrl = deps.guardUrl ?? assertUrlAllowed;
  try {
    await guardUrl(target);
  } catch (err) {
    throw toReaderError(err);
  }
  // [T-239c] 入口即断:已中断的信号不再起浏览器。
  const signal = opts.signal;
  if (signal?.aborted) throw makeAbortError("网页读取");
  const domain = webDomainFromUrl(target);
  const openContext = deps.openContext ?? realOpenReaderContext;
  const ctx = await openContext(opts.authDir);
  // [T-239c] abort → 关 context 让挂起导航/求值立刻 reject;各 catch 先查 aborted 改抛
  // AbortError(不误报「页面打不开」→ 不被编导转述成假故障)。
  const onAbort = () => {
    void ctx.close().catch(() => {});
  };
  signal?.addEventListener("abort", onAbort, { once: true });
  try {
    const page = ctx.pages()[0] ?? (await ctx.newPage());
    let resp: ReaderNavResponse | null;
    try {
      resp = await page.goto(target, {
        waitUntil: "domcontentloaded",
        timeout: NAV_TIMEOUT_MS,
      });
    } catch (err) {
      if (signal?.aborted) throw makeAbortError("网页读取");
      throw new WebCaptureError(
        `页面打不开:${err instanceof Error ? err.message : String(err)}`,
        {
          code:
            (err instanceof Error &&
              (err.name === "TimeoutError" ||
                /timed?\s*out|timeout|超时/i.test(err.message)))
              ? "TIMEOUT"
              : "HTTP_ERROR",
        },
      );
    }
    if (signal?.aborted) throw makeAbortError("网页读取");
    // Tencent EdgeOne 等站点会先返回非标准 567 bot challenge，页面脚本写入
    // 一次性 Cookie 后要求重载。直接按 HTTP 错误退出会让正常公网热榜永远不可用。
    // 只对 567 做最多两次有界重载；最终仍非 2xx 时继续诚实报 HTTP_ERROR。
    for (
      let challengeAttempt = 0;
      resp?.status() === 567 && challengeAttempt < 2;
      challengeAttempt += 1
    ) {
      await page.waitForTimeout(1_500);
      resp = await page.goto(page.url() || target, {
        waitUntil: "domcontentloaded",
        timeout: NAV_TIMEOUT_MS,
      });
    }
    const status = resp ? resp.status() : 0;
    if (status >= 400) {
      // [T-390] 带结构化 status:上层(persistence-client readWebUrl 端口)据此触发多路回退
      // (搜索引擎找同内容替代来源),不解析 message 文本。
      throw new WebCaptureError(
        `页面返回 HTTP ${status}:该链接不可访问(可能已下架或需要权限)`,
        { status, code: "HTTP_ERROR" },
      );
    }
    const finalUrl = (resp ? resp.url() : "") || page.url();
    // [T-326·RT-H04] 重定向逐跳复检(事后链审计,选型见 url-guard 文件头):goto 已跟随的每一跳
    // + 最终 URL 逐个重过守卫 —— 命中私网/元数据即抛错,正文绝不抽取返回。残留:命中跳的 HTTP
    // 请求本身已被浏览器发出(无法事前拦,Playwright route 不触发于 redirect 跳)。
    {
      const checked = new Set<string>([target]);
      for (const hop of [...collectRedirectChainUrls(resp), finalUrl]) {
        if (!hop || checked.has(hop)) continue;
        checked.add(hop);
        try {
          await guardUrl(hop);
        } catch (err) {
          throw toReaderError(err);
        }
      }
    }
    // 等 SPA 正文渲染 + 滚动到底触发懒加载/长对话全量(拿不到 selector/滚动失败都不抛,兜底用当前 DOM)。
    await page.waitForSelector("main, article, [data-message-author-role]", { timeout: 8_000 }).catch(() => {});
    await page
      .evaluate(() => {
        // 滚到底几次,触发懒加载(ChatGPT 长对话按需渲染)。
        return new Promise<void>((resolve) => {
          let n = 0;
          const timer = setInterval(() => {
            window.scrollTo(0, document.body.scrollHeight);
            if (++n >= 6) {
              clearInterval(timer);
              resolve();
            }
          }, 300);
        });
      })
      .catch(() => {});
    await page.waitForTimeout(500);
    const html = await page.content().catch(() => "");
    const isChatGpt = domain === "chatgpt.com" || domain.endsWith(".chatgpt.com");
    // [T-237] ChatGPT share 的 SSR 全量抽取放在登录墙判定**之前**:公开分享页对匿名访客也会渲
    // 「Log in / 登录」CTA,会让启发式误报登录墙 —— 但 SSR JSON 里已拿到全量对话 = 内容真可读,
    // 直接返回。真被登录门挡住的分享页 SSR 里没有对话 → 自然落回下方登录墙判定,不漏报。
    const title = (await page.title().catch(() => "")).trim();
    if (isChatGpt) {
      // ①首选:流式 SSR script JSON 抽全量轮次(不依赖渲染,长对话不截断)。
      const ssrTurns = extractChatGptShareSsr(html);
      if (ssrTurns && ssrTurns.length) {
        return {
          text: formatChatTurns(ssrTurns),
          title: title || finalUrl,
          finalUrl,
          extractor: "chatgpt-share",
          extractPath: "ssr",
          turnCount: ssrTurns.length,
        };
      }
    }
    // 登录墙 / 验证码启发式命中 → 结构化降级(有 .auth 登录态仍撞墙 = 会话过期/未登录该站)。
    if (detectLoginWall(finalUrl, html)) {
      throw new WebReaderLoginRequiredError(domain);
    }

    // ChatGPT share 定制兜底(T-237 修②③):SSR 没抽到 → 滚真容器 DOM 兜底 → 正则兜底。
    if (isChatGpt) {
      // ②③兜底:页内滚**真滚动容器**到轮次计数稳定,再逐元素 textContent 收轮次
      // (不再正则扒原始 HTML,杜绝 `<div` 标签泄漏)。evaluate 失败不抛,继续降级。
      const domTurns = await page
        .evaluate(harvestChatGptTurnsInPage, { settleMs: 500, maxRounds: 20 })
        .catch(() => null);
      if (Array.isArray(domTurns) && domTurns.length) {
        return {
          text: formatChatTurns(domTurns),
          title: title || finalUrl,
          finalUrl,
          extractor: "chatgpt-share",
          extractPath: "dom",
          turnCount: domTurns.length,
        };
      }
      // 最后:纯字符串正则兜底(页面 evaluate 不可用的极端场景;轮次数不可信 → null)。
      const convo = extractChatGptShare(html);
      if (convo) {
        return {
          text: convo,
          title: title || finalUrl,
          finalUrl,
          extractor: "chatgpt-share",
          extractPath: "dom",
          turnCount: null,
        };
      }
    }
    // 通用 Readability 兜底。
    const readable = await extractReadable(html, finalUrl).catch(() => null);
    if (readable && readable.text) {
      return {
        text: readable.text,
        title: (readable.title || title || finalUrl).trim(),
        finalUrl,
        extractor: "readability",
        extractPath: "readability",
        turnCount: null,
      };
    }
    // [T-546] 热榜、榜单、SPA 首页常由卡片/列表组成，并不是“文章”，Mozilla
    // Readability 会合法返回 null。页面已经通过 URL/重定向/HTTP/登录墙四层校验时，
    // 再读取浏览器实际渲染的 body.innerText 作为通用动态页兜底；设最小长度避免把
    // “加载中”/空壳/错误页伪装成有效来源。这里仍只返回真实可见文本，不由模型补写。
    const renderedText = await page
      .evaluate(() =>
        (document.body?.innerText ?? "")
          .replace(/\u00a0/g, " ")
          .replace(/[ \t]+\n/g, "\n")
          .replace(/\n{3,}/g, "\n\n")
          .replace(/[ \t]{2,}/g, " ")
          .trim(),
      )
      .catch(() => "");
    if (typeof renderedText === "string" && renderedText.length >= 120) {
      return {
        text: renderedText,
        title: title || finalUrl,
        finalUrl,
        extractor: "rendered-text",
        extractPath: "rendered-text",
        turnCount: null,
      };
    }
    // [T-239c] 中断关 context 会让上方 content()/evaluate 走 catch 兜底(html 空)最终落到这里
    // —— 如实抛 AbortError,不误报「抽不出正文」。
    if (signal?.aborted) throw makeAbortError("网页读取");
    throw new WebCaptureError(
      "读到页面但抽不出正文(可能是纯交互页/空页)——换一个有正文内容的链接,或用截图存网页样子。",
      { code: "PARSE_FAILED" },
    );
  } finally {
    signal?.removeEventListener("abort", onAbort);
    await ctx.close().catch(() => {});
  }
}
