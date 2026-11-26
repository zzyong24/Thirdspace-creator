import { randomUUID } from "node:crypto";
import { setTimeout as sleep } from "node:timers/promises";
import {
  everyInfraHostSchema, everyInfraObservationSchema, everyInfraQuerySchema, everyInfraRequestSchema,
  everyInfraQueryErrorMessages, type EveryInfraCredentials, type EveryInfraObservation,
  type EveryInfraQuery, type EveryInfraQueryErrorCode, type EveryInfraRequest, type EveryInfraVideoHit,
} from "@creatoros/contract/internal/everyinfra";

import { executionTimeoutMs } from "@creatoros/contract/timeout-policy";

const requestTimeoutMs = executionTimeoutMs();
const maxResponseBytes = 4 * 1024 * 1024;
const defaultRetryAfterMs = 1_000;
const maxRetryAfterMs = 10_000;
const withheld = "[已隐藏敏感内容]";
const sensitiveField = /^(?:api_?key|authorization|cookie|(?:video|audio|download)_url|(?:request_?headers|video_?decode_?key)|(?:author_)?avatar_url|xsec_token)$/i;
const sensitiveText = /(?:[?&][^\s=&]+=[^\s&]+|\b(?:request_?headers|video_?decode_?key|xsec_token)\b|\b(?:(?:x-amz-|x-goog-)?signature|api_?key)\b\s*[:=]|\bBearer\s+[^\s]+)/i;

type Row = Record<string, unknown>;
type RequestOptions = { idempotencyKey?: string; signal?: AbortSignal };
type Dependencies = { fetch?: typeof fetch; now?: () => number; wait?: (ms: number, signal?: AbortSignal) => Promise<void> };

export class EveryInfraError extends Error {
  constructor(readonly code: EveryInfraQueryErrorCode, readonly automaticReplayBlocked = false) {
    super(everyInfraQueryErrorMessages[code]);
    this.name = "EveryInfraError";
  }
}

const isRow = (value: unknown): value is Row => typeof value === "object" && value !== null && !Array.isArray(value);
const safeId = (value: unknown) => typeof value === "string" && /^[^\s:]{1,120}$/.test(value) ? value : undefined;
const numericId = (value: unknown) => typeof value === "string" && /^\d{1,120}$/.test(value) ? value : undefined;
const xiaohongshuId = (value: unknown) => typeof value === "string" && /^[0-9a-f]{24}$/i.test(value) ? value : undefined;
const finiteNumber = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value : undefined;

async function readBody(response: Response, maxBytes = maxResponseBytes) {
  const reader = response.body?.getReader();
  if (!reader) return "";
  let bytes = 0;
  const decoder = new TextDecoder();
  const parts: string[] = [];
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) return parts.join("") + decoder.decode();
      bytes += chunk.value.byteLength;
      if (bytes > maxBytes) {
        void reader.cancel().catch(() => {});
        throw new EveryInfraError("EVERYINFRA_RESPONSE_SHAPE");
      }
      parts.push(decoder.decode(chunk.value, { stream: true }));
    }
  } finally {
    reader.releaseLock();
  }
}

async function readUpstreamError(response: Response): Promise<Row | undefined> {
  try {
    const body: unknown = JSON.parse(await readBody(response, 64 * 1024));
    if (isRow(body) && isRow(body.error)) return body.error;
  } catch {
    // 网关可能返回 HTML。只使用公开状态码规则，原始错误体始终丢弃。
  }
}

function readResponse(text: string, input: EveryInfraRequest): Row[] {
  let envelope: unknown;
  try {
    // 供应商有时会把标识符编码成 JSON 数字。保存十进制字面量，避免任何浮点转换。
    envelope = JSON.parse(text, (key: string, value: unknown, context?: { source?: string }) =>
      (key === "id" || key === "video_decode_key") && typeof value === "number" &&
      /^[0-9]+$/.test(context?.source ?? "") ? context?.source : value);
  } catch {
    throw new EveryInfraError("EVERYINFRA_RESPONSE_SHAPE");
  }
  if (!isRow(envelope) ||
      (envelope.platform !== undefined && envelope.platform !== upstreamPlatform(input.platform)) ||
      (envelope.action !== undefined && envelope.action !== input.action)) {
    throw new EveryInfraError("EVERYINFRA_RESPONSE_SHAPE");
  }
  if (input.action === "note" || input.action === "video") {
    if (isRow(envelope.results)) return [envelope.results];
  } else if (Array.isArray(envelope.results) && envelope.results.every(isRow)) {
    return envelope.results;
  }
  throw new EveryInfraError("EVERYINFRA_RESPONSE_SHAPE");
}

const upstreamPlatform = (platform: EveryInfraRequest["platform"]) => platform === "wechatVideo" ? "wechat_channels" : platform;

function retryDelay(retryAfter: string | null, now: number): number {
  if (!retryAfter) return defaultRetryAfterMs;
  if (/^\d+$/.test(retryAfter)) return Number(retryAfter) * 1000;
  const date = Date.parse(retryAfter);
  return Number.isFinite(date) ? Math.max(0, date - now) : defaultRetryAfterMs;
}

function candidateUrl(raw: unknown): URL | undefined {
  if (typeof raw !== "string" || !raw.startsWith("https://") || raw.length > 4096 || /[\s\\]/.test(raw)) return undefined;
  try {
    const url = new URL(raw);
    if (url.protocol === "https:" && !url.username && !url.password && !url.port) return url;
  } catch {
    return undefined;
  }
}

function xiaohongshuNoteUrl(raw: unknown, id: string) {
  if (typeof raw !== "string") return undefined;
  const url = candidateUrl(raw);
  if (!url || url.hash || !["www.xiaohongshu.com", "xiaohongshu.com"].includes(url.hostname) ||
      ![`/explore/${id}`, `/discovery/item/${id}`].includes(url.pathname)) return undefined;
  return { raw, url };
}

function collectSensitiveStrings(value: unknown, output: Set<string>, depth = 0, isSensitive = false) {
  if (depth > 12) return;
  if (typeof value === "string") {
    if (isSensitive && value) output.add(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectSensitiveStrings(item, output, depth + 1, isSensitive);
    return;
  }
  if (isRow(value)) {
    for (const [key, item] of Object.entries(value)) {
      collectSensitiveStrings(item, output, depth + 1, isSensitive || sensitiveField.test(key));
    }
  }
}

function publicObservation(input: EveryInfraQuery, rows: Row[], apiKey: string, radar: boolean): EveryInfraObservation {
  const secrets = new Set([apiKey]);
  for (const row of rows) {
    collectSensitiveStrings(row, secrets);
    if (input.platform === "xiaohongshu") {
      const accessToken = candidateUrl(row.url)?.searchParams.get("xsec_token");
      if (accessToken) secrets.add(accessToken);
    }
  }
  const sensitiveValues = [...secrets];
  const containsSecret = (value: string) => sensitiveValues.some(secret => secret.length >= 4 ? value.includes(secret) : value === secret);
  const safeText = (value: unknown, max: number) => {
    if (typeof value !== "string") return undefined;
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    if (sensitiveText.test(trimmed) || containsSecret(trimmed)) return withheld;
    return trimmed.slice(0, max);
  };
  const safeIdentifier = (value: unknown) => {
    const id = safeId(value);
    return id && !containsSecret(id) && !sensitiveText.test(id) ? id : undefined;
  };
  const safeCover = (value: unknown) => {
    const url = candidateUrl(value);
    // 带签名的封面只供雷达临时展示，不进入对话。
    return url && !url.hash && (radar || !url.search) && !containsSecret(url.href) ? url.href : undefined;
  };

  const hits = rows.slice(0, 100).map((row): EveryInfraVideoHit => {
    const { platform, action } = input;
    const onlyDiscovery = (platform === "wechatVideo" && action === "search") || (platform === "douyin" && action === "trending");
    const providerId = platform === "xiaohongshu" ? xiaohongshuId(row.id) : numericId(row.id);
    const externalId = onlyDiscovery ? undefined : safeIdentifier(providerId);
    const type = onlyDiscovery ? undefined : platform === "xiaohongshu"
      ? row.is_video === true ? "video" : row.is_video === false ? "article" : undefined
      : row.media_type === "image" ? "article" : "video";
    let canonicalUrl: string | undefined;
    if (externalId && platform === "douyin") canonicalUrl = `https://www.douyin.com/video/${externalId}`;
    if (externalId && platform === "xiaohongshu") {
      const link = xiaohongshuNoteUrl(row.url, externalId);
      if (link && !link.raw.includes(apiKey)) {
        canonicalUrl = radar ? link.raw : `${link.url.origin}${link.url.pathname}`;
      }
      if (!canonicalUrl && action === "user_posts") canonicalUrl = `https://www.xiaohongshu.com/explore/${externalId}`;
    }
    if (externalId && platform === "wechatVideo" && action === "video") {
      const link = candidateUrl(input.params.object_id);
      if (link && !link.href.includes(apiKey)) canonicalUrl = radar ? input.params.object_id : `${link.origin}${link.pathname}`;
    }
    if (radar && externalId && platform === "wechatVideo" && !canonicalUrl) {
      canonicalUrl = `https://creatoros.local/sources/wechatVideo/${externalId}`;
    }
    const body = platform === "wechatVideo" ? row.description : row.text;
    const channelsDiscovery = platform === "wechatVideo" && action === "search";
    const title = safeText(platform === "douyin" && action === "trending" ? row.keyword : row.title, 300)
      ?? (channelsDiscovery ? undefined : safeText(body, 300));
    const summary = channelsDiscovery ? undefined : safeText(body, 4000);
    const coverUrl = platform === "douyin"
      ? safeCover(row.cover_image_url) ?? (action === "trending" ? safeCover(row.image_url) : undefined)
      : platform === "xiaohongshu"
        ? safeCover(row.image_url) ?? (Array.isArray(row.images) ? safeCover(row.images[0]) : undefined)
        : safeCover(row.cover_url);
    const duration = platform === "xiaohongshu" ? finiteNumber(row.duration_sec) : finiteNumber(row.duration_seconds) ?? finiteNumber(row.duration_sec);
    const milliseconds = type !== "article" && duration !== undefined && duration >= 0 ? finiteNumber(duration * 1000) : undefined;
    const published = !channelsDiscovery && typeof row.posted_at === "string" ? Date.parse(row.posted_at) : NaN;
    return {
      platform, action, externalId, canonicalUrl, title, summary,
      authorId: channelsDiscovery ? undefined : safeIdentifier(platform === "wechatVideo" ? row.author_username : row.author_id),
      authorName: safeText(row.author_name, 300),
      coverUrl, durationMs: milliseconds, publishedAt: Number.isFinite(published) ? new Date(published).toISOString() : undefined,
      type, addable: Boolean(externalId && type && (canonicalUrl || platform === "wechatVideo")),
      metrics: {
        likes: finiteNumber(row.like_count),
        comments: channelsDiscovery ? undefined : finiteNumber(row.comment_count),
        shares: channelsDiscovery ? undefined : finiteNumber(row.share_count),
        favorites: channelsDiscovery ? undefined : finiteNumber(row.collect_count),
      },
    };
  });
  const nextPageToken = rows.map(row => row.next_page_token).find(token =>
    typeof token === "string" && token.length > 0 && token.length <= 2000 && !containsSecret(token) && !sensitiveText.test(token));
  const projection = JSON.parse(JSON.stringify({ platform: input.platform, action: input.action, hits, nextPageToken }));
  const result = everyInfraObservationSchema.safeParse(projection);
  if (!result.success) throw new EveryInfraError("EVERYINFRA_RESPONSE_SHAPE");
  return result.data;
}

export class EveryInfraClient {
  private readonly endpoint: string;
  readonly #apiKey: string;
  private readonly fetcher: typeof fetch;
  private readonly now: () => number;
  private readonly wait: (ms: number, signal?: AbortSignal) => Promise<void>;

  constructor(credentials: EveryInfraCredentials, deps: Dependencies = {}) {
    const host = everyInfraHostSchema.safeParse(credentials.baseUrl);
    if (!host.success) throw new EveryInfraError("EVERYINFRA_UPSTREAM");
    if (!credentials.apiKey.trim()) throw new EveryInfraError("EVERYINFRA_NOT_CONFIGURED");
    this.endpoint = `${host.data}/api/v1/social`;
    this.#apiKey = credentials.apiKey;
    this.fetcher = deps.fetch ?? fetch;
    this.now = deps.now ?? Date.now;
    this.wait = deps.wait ?? ((ms, signal) => sleep(ms, undefined, { signal }));
  }

  /** 仅供服务端下载和小红书笔记刷新使用。原始行不属于工具结果或情报记录。 */
  async request(input: EveryInfraRequest, options: RequestOptions = {}): Promise<Row[]> {
    const parsed = everyInfraRequestSchema.safeParse(input);
    if (!parsed.success) throw new EveryInfraError("EVERYINFRA_RESPONSE_SHAPE");
    const request = parsed.data;
    const requestInit: RequestInit = {
      method: "POST",
      redirect: "error",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.#apiKey}`,
        "Idempotency-Key": options.idempotencyKey ?? randomUUID(),
      },
      body: JSON.stringify({ ...request, platform: upstreamPlatform(request.platform) }),
    };
    for (let attempt = 0; attempt < 2; attempt++) {
      options.signal?.throwIfAborted();
      const timeout = AbortSignal.timeout(requestTimeoutMs);
      const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;
      let response: Response;
      try {
        response = await this.fetcher(this.endpoint, { ...requestInit, signal });
        if (response.ok) return readResponse(await readBody(response), request);
      } catch (error) {
        options.signal?.throwIfAborted();
        if (error instanceof EveryInfraError) throw error;
        if (attempt === 0) continue;
        throw new EveryInfraError("EVERYINFRA_UPSTREAM");
      }
      const { status } = response;
      const error = status === 409 || status >= 500 ? await readUpstreamError(response) : undefined;
      if (status < 500 && status !== 409) void response.body?.cancel().catch(() => {});
      options.signal?.throwIfAborted();
      if (status === 401 || status === 403) throw new EveryInfraError("EVERYINFRA_AUTH_INVALID");
      if (status === 402) throw new EveryInfraError("EVERYINFRA_QUOTA_EXHAUSTED");
      if (status === 429 || (status === 409 && error?.code === "idempotency_in_progress")) {
        const code = status === 429 ? "EVERYINFRA_RATE_LIMIT" : "EVERYINFRA_UPSTREAM";
        const delay = retryDelay(response.headers.get("Retry-After"), this.now());
        if (attempt === 0 && delay <= maxRetryAfterMs) {
          await this.wait(delay, signal).catch(() => {
            options.signal?.throwIfAborted();
            throw new EveryInfraError(code);
          });
          continue;
        }
        throw new EveryInfraError(code);
      }
      const replayBlocked = status >= 500 && (error?.retryable === false ||
        error?.code === "refund_outcome_unknown" || error?.code === "submission_outcome_unknown");
      if (!replayBlocked && attempt === 0 && status >= 500 &&
          (error?.retryable === true || status === 502 || status === 504)) continue;
      throw new EveryInfraError("EVERYINFRA_UPSTREAM", replayBlocked);
    }
    throw new EveryInfraError("EVERYINFRA_UPSTREAM");
  }

  private async queryProjection(input: EveryInfraQuery, radar: boolean, options?: RequestOptions) {
    const parsed = everyInfraQuerySchema.safeParse(input);
    if (!parsed.success) throw new EveryInfraError("EVERYINFRA_RESPONSE_SHAPE");
    return publicObservation(parsed.data, await this.request(parsed.data, options), this.#apiKey, radar);
  }

  query(input: EveryInfraQuery, options?: RequestOptions): Promise<EveryInfraObservation> {
    return this.queryProjection(input, false, options);
  }

  /** 雷达支持小红书笔记访问令牌。此输出只能供受信任的宿主组装雷达收据。 */
  queryForRadar(input: EveryInfraQuery, options?: RequestOptions): Promise<EveryInfraObservation> {
    return this.queryProjection(input, true, options);
  }

  async readXiaohongshuNoteUrl(externalId: string, options?: RequestOptions): Promise<string | undefined> {
    const [row] = await this.request({ platform: "xiaohongshu", action: "note", params: { url: externalId } }, options);
    if (!row || (row.id !== undefined && row.id !== externalId)) return undefined;
    const link = xiaohongshuNoteUrl(row.url, externalId);
    return link && !link.raw.includes(this.#apiKey) ? link.raw : undefined;
  }
}
