import { createHash } from 'node:crypto';
import { executionTimeoutMs } from '@creatoros/contract/timeout-policy';
import { TRANSCRIBE_INPUT_MAX_BYTES, type TranscribePlatformSource } from '@creatoros/contract/execution-worker';
import { assertUrlAllowed } from '@creatoros/ai-worker/browser/url-guard';
import type { EveryInfraClient } from '@creatoros/ai-worker/everyinfra-client';
import { awaitPreparation } from '../execution/await-preparation';
import { CHANNELS_DECRYPT_UNSPECIFIED, decryptWechatChannelsMedia } from './wechat-channels-media';

const MAX_REDIRECTS = 3;
const CHANNELS_HTTP_HOST = 'wxapp.tc.qq.com';
const REDIRECTS = new Set([301, 302, 303, 307, 308]);

export const NO_PLAYABLE_MEDIA = 'NO_PLAYABLE_MEDIA';
type ReadResult = { kind: 'image'; reason: 'IMAGE_NOTE' | 'IMAGE_ALBUM' } | { kind: 'video'; bytes: Uint8Array };
type MediaTarget = TranscribePlatformSource & { canonicalUrl: string };
type MediaDeps = {
  client: Pick<EveryInfraClient, 'request'>;
  maxBytes?: number;
  fetch?: typeof fetch;
  assertUrl?: typeof assertUrlAllowed;
  now?: () => number;
};
type Request = Parameters<EveryInfraClient['request']>[0];

function noPlayableMedia(): Error {
  return Object.assign(new Error(NO_PLAYABLE_MEDIA), { code: NO_PLAYABLE_MEDIA });
}

function mediaUrl(value: unknown, platform: MediaTarget['platform'], base?: URL): URL {
  if (typeof value !== 'string' || !value) throw noPlayableMedia();
  const url = new URL(value, base);
  const allowedHttp = platform === 'wechatVideo' && url.protocol === 'http:'
    && url.hostname === CHANNELS_HTTP_HOST && !url.port;
  if ((!allowedHttp && url.protocol !== 'https:') || url.username || url.password
    || url.hostname.replace(/\.$/u, '') === 'creatoros.local') throw noPlayableMedia();
  return url;
}

function mediaHeaders(value: unknown): Headers {
  const headers = new Headers();
  if (value === undefined || value === null) return headers;
  if (typeof value !== 'object' || Array.isArray(value)) throw noPlayableMedia();
  for (const [name, header] of Object.entries(value)) {
    if (typeof header !== 'string') throw noPlayableMedia();
    // Authority, message framing and connection headers belong to the HTTP client.
    if (/^(?:host|content-length|transfer-encoding|connection|upgrade|proxy-.*)$/i.test(name)) continue;
    headers.set(name, header);
  }
  return headers;
}

function isMediaContainer(bytes: Uint8Array): boolean {
  const matches = (offset: number, prefix: number[]) => prefix.every((value, index) => bytes[offset + index] === value);
  return matches(4, [0x66, 0x74, 0x79, 0x70]) // ISO base media / MP4
    || matches(0, [0x1a, 0x45, 0xdf, 0xa3]) // Matroska / WebM
    || matches(0, [0x46, 0x4c, 0x56]) // FLV
    || matches(0, [0x4f, 0x67, 0x67, 0x53]) // Ogg
    || (matches(0, [0x52, 0x49, 0x46, 0x46]) && matches(8, [0x57, 0x41, 0x56, 0x45]))
    || matches(0, [0x49, 0x44, 0x33]); // MP3 with ID3
}

function xiaohongshuNoteUrl(value: unknown): string {
  if (typeof value !== 'string') throw noPlayableMedia();
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.port
    || !['www.xiaohongshu.com', 'xiaohongshu.com', 'xhslink.com'].includes(url.hostname)) {
    throw noPlayableMedia();
  }
  return value;
}

async function download(
  deps: MediaDeps,
  input: { url: unknown; headers?: Headers; platform: MediaTarget['platform']; signal: AbortSignal },
): Promise<Uint8Array> {
  const signal = AbortSignal.any([input.signal, AbortSignal.timeout(executionTimeoutMs())]);
  const validate = deps.assertUrl ?? assertUrlAllowed;
  const fetchMedia = deps.fetch ?? fetch;
  const maxBytes = Math.min(deps.maxBytes ?? TRANSCRIBE_INPUT_MAX_BYTES, TRANSCRIBE_INPUT_MAX_BYTES);
  let url = mediaUrl(input.url, input.platform);
  let headers = input.headers;
  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects++) {
    signal.throwIfAborted();
    await awaitPreparation(() => validate(url.href), signal);
    const response = await fetchMedia(url, { method: 'GET', headers, signal, redirect: 'manual' });
    if (REDIRECTS.has(response.status)) {
      const location = response.headers.get('location');
      await response.body?.cancel();
      if (redirects === MAX_REDIRECTS || !location) throw noPlayableMedia();
      const target = mediaUrl(location, input.platform, url);
      if (target.origin !== url.origin) headers = undefined;
      url = target;
      continue;
    }
    const mime = response.headers.get('content-type')?.toLowerCase();
    if (!response.ok || !response.body || Number(response.headers.get('content-length')) > maxBytes
      || mime?.startsWith('text/') || mime?.includes('json') || mime?.includes('xml')) {
      await response.body?.cancel();
      throw noPlayableMedia();
    }
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let length = 0;
    try {
      for (;;) {
        signal.throwIfAborted();
        const { done, value } = await reader.read();
        if (done) break;
        length += value.byteLength;
        if (length > maxBytes) throw noPlayableMedia();
        chunks.push(value);
      }
    } catch (error) {
      await reader.cancel().catch(() => {});
      throw error;
    } finally {
      reader.releaseLock();
    }
    if (!length) throw noPlayableMedia();
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return bytes;
  }
  throw noPlayableMedia();
}

function matchesId(row: Record<string, unknown>, externalId: string): boolean {
  return row.id === externalId || (typeof row.id === 'number' && Number.isSafeInteger(row.id) && String(row.id) === externalId);
}

const queryErrors = new Set([
  'EVERYINFRA_NOT_CONFIGURED', 'EVERYINFRA_AUTH_INVALID', 'EVERYINFRA_QUOTA_EXHAUSTED',
  'EVERYINFRA_RATE_LIMIT', 'EVERYINFRA_RESPONSE_SHAPE',
]);
export function everyInfraMediaErrorCode(error: unknown): string | undefined {
  if (!(error instanceof Error) || !('code' in error) || typeof error.code !== 'string') return undefined;
  if (queryErrors.has(error.code) || error.code === 'EVERYINFRA_UPSTREAM'
    || error.code === NO_PLAYABLE_MEDIA || error.code === CHANNELS_DECRYPT_UNSPECIFIED) return error.code;
  return undefined;
}

/** Resolves a bound radar item for one transcription attempt. Raw transport data stays here. */
export async function resolveEveryInfraMedia(
  source: MediaTarget,
  attemptKey: string,
  signal: AbortSignal,
  deps: MediaDeps,
): Promise<ReadResult> {
  const read = async (request: Request, pass: number) => {
    const idempotencyKey = createHash('sha256')
      .update(JSON.stringify([attemptKey, source.platform, source.externalId, request.action, pass]))
      .digest('hex');
    const rows = await deps.client.request(request, { signal, idempotencyKey });
    const row = rows.find(value => matchesId(value, source.externalId));
    if (!row) throw noPlayableMedia();
    return row;
  };
  const play = async (url: unknown, headers?: Headers, decodeKey?: string): Promise<ReadResult> => {
    const rawBytes = await download(deps, { url, headers, platform: source.platform, signal });
    const bytes = decodeKey === undefined ? rawBytes : decryptWechatChannelsMedia(rawBytes, decodeKey);
    if (!isMediaContainer(bytes)) throw noPlayableMedia();
    return { kind: 'video', bytes };
  };
  for (let pass = 0; pass < 2; pass++) {
    try {
      signal.throwIfAborted();
      if (source.platform === 'douyin') {
        const row = await read({ platform: 'douyin', action: 'media_links', params: { urls: [source.externalId], fresh: true } }, pass);
        if (row.media_type === 'image') return { kind: 'image', reason: 'IMAGE_ALBUM' };
        const expires = typeof row.expires_at === 'string' ? Date.parse(row.expires_at) : NaN;
        if (Number.isFinite(expires) && expires <= (deps.now ?? Date.now)()) throw noPlayableMedia();
        return await play(row.video_url, mediaHeaders(row.request_headers));
      }
      if (source.platform === 'xiaohongshu') {
        let url = source.canonicalUrl;
        if (pass > 0) {
          if (!/^[a-f0-9]{24}$/i.test(source.externalId)) throw noPlayableMedia();
          const note = await read({ platform: 'xiaohongshu', action: 'note', params: { url: source.externalId } }, pass);
          if (note.is_video === false) return { kind: 'image', reason: 'IMAGE_NOTE' };
          url = xiaohongshuNoteUrl(note.url);
        }
        const row = await read({ platform: 'xiaohongshu', action: 'video', params: { url: xiaohongshuNoteUrl(url) } }, pass);
        return await play(row.video_url);
      }
      const row = await read({ platform: 'wechatVideo', action: 'video', params: { object_id: source.externalId } }, pass);
      const key = row.video_decode_key;
      const decodeKey = typeof key === 'string' ? key
        : typeof key === 'number' && Number.isSafeInteger(key) ? String(key) : '';
      if (!decodeKey) throw noPlayableMedia();
      return await play(row.video_url, undefined, decodeKey);
    } catch (error) {
      signal.throwIfAborted();
      const code = everyInfraMediaErrorCode(error);
      const replayBlocked = error instanceof Error && 'automaticReplayBlocked' in error && error.automaticReplayBlocked === true;
      const refreshMalformedNoteVideo = code === 'EVERYINFRA_RESPONSE_SHAPE' && source.platform === 'xiaohongshu' && pass === 0;
      if (code && ((queryErrors.has(code) && !refreshMalformedNoteVideo) || code === CHANNELS_DECRYPT_UNSPECIFIED || replayBlocked || pass > 0)) {
        throw Object.assign(new Error(code), { code });
      }
      if (pass > 0) throw noPlayableMedia();
    }
  }
  throw noPlayableMedia();
}
