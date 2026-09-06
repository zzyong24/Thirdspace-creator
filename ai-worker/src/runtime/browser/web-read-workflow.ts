import { WebCaptureError } from "./web-capture";
import { WebReaderLoginRequiredError, type ReadResult } from "./web-reader";
import { webDomainFromUrl } from "./web-domain";
import { findAlternatesViaSearch, type AlternateSearcher } from "./web-read-fallback";

export interface WebReadAsset {
  assetId: string;
  name: string;
  previewUrl: string | null;
}
export interface WebReadWorkflowPorts {
  /** 只有查询/字节不可读才返回 miss；来源或正文投影写入失败必须上抛。 */
  readCached(url: string, signal?: AbortSignal): Promise<(WebReadAsset & { fullText: string }) | null>;
  read(url: string, signal?: AbortSignal): Promise<ReadResult>;
  searchers(signal?: AbortSignal): Promise<AlternateSearcher[]>;
  hasSession(domain: string, signal?: AbortSignal): Promise<boolean>;
  /** 来源、正文与 pending 素材全部成功才可返回；不能把半成品作为可保存结果。 */
  saveDocument(input: { name: string; sourceUrl: string; fullText: string }, signal?: AbortSignal): Promise<WebReadAsset>;
}

/** 旧入口和独立 Worker 共用的读取编排。数据读写只经端口，分页与不可信内容包装仍由原工具负责。 */
export async function readWebDocument(input: { url: string; signal?: AbortSignal }, ports: WebReadWorkflowPorts) {
  const { url, signal } = input;
  signal?.throwIfAborted();
  const cached = await ports.readCached(url, signal);
  signal?.throwIfAborted();
  if (cached) return {
    needLogin: false as const, ...cached, sourceUrl: url, title: cached.name.replace(/^正文·/, ""),
    excerpt: cached.fullText.slice(0, 280), extractor: "cached", turnCount: null,
    extraction: `复用已存正文素材(未重新抓取;全文 ${cached.fullText.length} 字,按窗读取)`, fromCache: true,
  };
  const domain = webDomainFromUrl(url);
  let read: ReadResult;
  try { read = await ports.read(url, signal); }
  catch (error) {
    signal?.throwIfAborted();
    if (error instanceof WebReaderLoginRequiredError) return { needLogin: true as const, domain: error.domain };
    if (!(error instanceof WebCaptureError) || error.status === null || error.status < 400) throw error;
    const searchers = await ports.searchers(signal);
    signal?.throwIfAborted();
    const alternates = await findAlternatesViaSearch(url, searchers, { signal });
    signal?.throwIfAborted();
    const hasSession = await ports.hasSession(domain, signal).catch(() => false);
    signal?.throwIfAborted();
    return { blocked: true as const, status: error.status,
      message: hasSession ? error.message : `${error.message}(该站还没在「设置 → 网站登录保管库」登录过 —— 登录后重试,带登录态访问更容易通过)`, alternates };
  }
  signal?.throwIfAborted();
  const asset = await ports.saveDocument({ name: `正文·${(read.title || read.finalUrl).slice(0, 40)}`, sourceUrl: url, fullText: read.text }, signal);
  signal?.throwIfAborted();
  return {
    needLogin: false as const, ...asset, sourceUrl: url, title: read.title, excerpt: read.text.slice(0, 280),
    extractor: read.extractor, turnCount: read.turnCount,
    extraction: read.turnCount != null ? read.extractPath === "ssr"
      ? `抽到 ${read.turnCount} 轮对话(SSR 全量,长对话不截断)`
      : `抽到 ${read.turnCount} 轮对话(DOM 渲染抽取,超长对话可能不全)` : null,
    fullText: read.text, fromCache: false,
  };
}
