import { describe, expect, it, vi } from 'vitest';
import type { TranscribePlatformSource } from '@creatoros/contract/execution-worker';
import type { EveryInfraClient } from '@creatoros/ai-worker/everyinfra-client';
import { resolveEveryInfraMedia } from './everyinfra-media-resolver';

const mp4 = Uint8Array.of(0, 0, 0, 16, 102, 116, 121, 112, 105, 115, 111, 109);
const media = 'https://media.example.invalid/video';
const douyin = { platform: 'douyin', externalId: '1458', canonicalUrl: 'https://www.douyin.com/video/1458' } as const;
const noteId = '123456789abc123456789abc';
const note = { platform: 'xiaohongshu', externalId: noteId, canonicalUrl: `https://www.xiaohongshu.com/explore/${noteId}` } as const;
const channel = { platform: 'wechatVideo', externalId: '15039881603147501275', canonicalUrl: 'https://creatoros.local/sources/wechatVideo/15039881603147501275' } as const;
const reply = () => new Response(mp4, { headers: { 'Content-Type': 'video/mp4' } });

function fixture(maxBytes?: number) {
  const request = vi.fn<EveryInfraClient['request']>();
  const fetch = vi.fn<typeof globalThis.fetch>();
  const assertUrl = vi.fn(async () => {});
  const run = (source: TranscribePlatformSource & { canonicalUrl: string }) => resolveEveryInfraMedia(
    source,
    'fixture-attempt',
    new AbortController().signal,
    { client: { request }, fetch, assertUrl, maxBytes, now: () => Date.parse('2026-11-25T00:00:00Z') },
  );
  return { request, fetch, assertUrl, run };
}

describe('万有引擎转写媒体', () => {
  it('抖音只取新的视频链接并使用目录返回的下载头', async () => {
    const f = fixture();
    f.request.mockResolvedValue([{ id: '1458', video_url: media, audio_url: 'https://audio.example.invalid/music', request_headers: { Referer: 'https://fixture.invalid/' } }]);
    f.fetch.mockResolvedValueOnce(reply());
    await expect(f.run(douyin)).resolves.toEqual({ kind: 'video', bytes: mp4 });
    expect(f.request).toHaveBeenCalledExactlyOnceWith(
      { platform: 'douyin', action: 'media_links', params: { urls: ['1458'], fresh: true } },
      { idempotencyKey: expect.any(String), signal: expect.any(AbortSignal) },
    );
    expect(f.fetch).toHaveBeenCalledTimes(1);
    const [request, options] = f.fetch.mock.calls[0]!;
    expect(String(request)).toBe(media);
    expect(new Headers(options?.headers).get('Referer')).toBe('https://fixture.invalid/');
  });

  it('已过期的链接不下载，仅重取一次且每次使用独立幂等键', async () => {
    const f = fixture();
    f.request.mockResolvedValueOnce([{ id: '1458', video_url: media, expires_at: '2026-11-24T00:00:00Z' }])
      .mockResolvedValueOnce([{ id: '1458', video_url: media, expires_at: '2026-11-26T00:00:00Z' }]);
    f.fetch.mockResolvedValueOnce(reply());
    await expect(f.run(douyin)).resolves.toEqual({ kind: 'video', bytes: mp4 });
    expect(f.fetch).toHaveBeenCalledTimes(1);
    expect(f.request).toHaveBeenCalledTimes(2);
    expect(f.request.mock.calls[0]?.[1]?.idempotencyKey).not.toBe(f.request.mock.calls[1]?.[1]?.idempotencyKey);
  });

  it('小红书刷新只走 video → note → video 并保留页面查询串', async () => {
    const f = fixture();
    const freshUrl = `${note.canonicalUrl}?xsec_token=fixture`;
    f.request.mockRejectedValueOnce(new Error('fixture failure'))
      .mockResolvedValueOnce([{ id: noteId, url: freshUrl, is_video: true }])
      .mockResolvedValueOnce([{ id: noteId, video_url: media }]);
    f.fetch.mockResolvedValueOnce(reply());
    await expect(f.run(note)).resolves.toEqual({ kind: 'video', bytes: mp4 });
    expect(f.request.mock.calls.map(([input]) => input)).toEqual([
      { platform: 'xiaohongshu', action: 'video', params: { url: note.canonicalUrl } },
      { platform: 'xiaohongshu', action: 'note', params: { url: noteId } },
      { platform: 'xiaohongshu', action: 'video', params: { url: freshUrl } },
    ]);
    expect(f.fetch.mock.calls[0]?.[1]?.headers).toBeUndefined();
  });

  it('小红书下载失败仅重取一次，图文返回跳过且没有下载', async () => {
    const f = fixture();
    f.request.mockResolvedValueOnce([{ id: noteId, video_url: media }])
      .mockResolvedValueOnce([{ id: noteId, url: note.canonicalUrl }])
      .mockResolvedValueOnce([{ id: noteId, video_url: null }]);
    f.fetch.mockResolvedValueOnce(new Response('', { status: 403 }));
    await expect(f.run(note)).rejects.toMatchObject({ code: 'NO_PLAYABLE_MEDIA' });
    expect(f.request).toHaveBeenCalledTimes(3);
    const image = fixture();
    image.request.mockResolvedValueOnce([{ id: noteId, video_url: null }])
      .mockResolvedValueOnce([{ id: noteId, is_video: false }]);
    await expect(image.run(note)).resolves.toEqual({ kind: 'image', reason: 'IMAGE_NOTE' });
    expect(image.fetch).not.toHaveBeenCalled();
  });

  it('小红书可刷新首次解析失败，但不会自动重复可能已计费的请求', async () => {
    const shape = Object.assign(new Error('fixture error'), { code: 'EVERYINFRA_RESPONSE_SHAPE' });
    const f = fixture();
    f.request.mockRejectedValueOnce(shape).mockResolvedValueOnce([{ id: noteId, url: note.canonicalUrl }]).mockRejectedValueOnce(shape);
    await expect(f.run(note)).rejects.toMatchObject({ code: 'EVERYINFRA_RESPONSE_SHAPE' });
    expect(f.request.mock.calls.map(([input]) => input.action)).toEqual(['video', 'note', 'video']);
    const uncertain = fixture();
    uncertain.request.mockRejectedValueOnce(Object.assign(new Error('fixture error'), {
      code: 'EVERYINFRA_UPSTREAM', automaticReplayBlocked: true,
    }));
    await expect(uncertain.run(note)).rejects.toMatchObject({ code: 'EVERYINFRA_UPSTREAM' });
    expect(uncertain.request).toHaveBeenCalledTimes(1);
  });

  it('视频号以字符串传入大 ID，先下载再返回固定解密错误且不重试', async () => {
    const f = fixture();
    f.request.mockResolvedValue([{ id: channel.externalId, video_url: 'http://wxapp.tc.qq.com/fixture', video_decode_key: '1' }]);
    f.fetch.mockResolvedValue(new Response(Uint8Array.of(0, 1, 2, 3)));
    await expect(f.run(channel)).rejects.toMatchObject({ code: 'CHANNELS_DECRYPT_UNSPECIFIED' });
    expect(f.request).toHaveBeenCalledExactlyOnceWith(
      { platform: 'wechatVideo', action: 'video', params: { object_id: '15039881603147501275' } },
      { idempotencyKey: expect.any(String), signal: expect.any(AbortSignal) },
    );
    expect(f.fetch).toHaveBeenCalledTimes(1);
    expect(String(f.fetch.mock.calls[0]?.[0])).toBe('http://wxapp.tc.qq.com/fixture');
    expect(f.fetch.mock.calls[0]?.[1]?.headers).toBeUndefined();
  });

  it.each(['http://example.invalid/not-allowed', 'https://creatoros.local/source', 'file:///fixture'])(
    '拒绝未允许的下载地址 %s',
    async url => {
      const f = fixture();
      f.request.mockResolvedValue([{ id: '1458', video_url: url }]);
      await expect(f.run(douyin)).rejects.toMatchObject({ code: 'NO_PLAYABLE_MEDIA' });
      expect(f.fetch).not.toHaveBeenCalled();
    },
  );

  it('重定向最多三次，逐跳检查，跨站不转发下载头', async () => {
    const f = fixture();
    f.request.mockResolvedValue([{ id: '1458', video_url: media, request_headers: { Referer: 'https://fixture.invalid/' } }]);
    f.fetch.mockResolvedValueOnce(new Response(null, { status: 302, headers: { Location: '/second' } }))
      .mockResolvedValueOnce(new Response(null, { status: 302, headers: { Location: 'https://other.example.invalid/third' } }))
      .mockResolvedValueOnce(new Response(null, { status: 302, headers: { Location: '/fourth' } }))
      .mockResolvedValueOnce(reply());
    await expect(f.run(douyin)).resolves.toEqual({ kind: 'video', bytes: mp4 });
    expect(f.assertUrl).toHaveBeenCalledTimes(4);
    expect(new Headers(f.fetch.mock.calls[1]?.[1]?.headers).get('Referer')).toBe('https://fixture.invalid/');
    expect(f.fetch.mock.calls[2]?.[1]?.headers).toBeUndefined();

    const loop = fixture();
    loop.request.mockResolvedValue([{ id: '1458', video_url: media }]);
    loop.fetch.mockImplementation(async () => new Response(null, { status: 302, headers: { Location: '/loop' } }));
    await expect(loop.run(douyin)).rejects.toMatchObject({ code: 'NO_PLAYABLE_MEDIA' });
    expect(loop.fetch).toHaveBeenCalledTimes(8);
  });

  it('拒绝超限和伪装成 MP4 的非媒体响应', async () => {
    const size = fixture(4);
    size.request.mockResolvedValue([{ id: '1458', video_url: media }]);
    size.fetch.mockImplementation(async () => reply());
    await expect(size.run(douyin)).rejects.toMatchObject({ code: 'NO_PLAYABLE_MEDIA' });
    const body = fixture();
    body.request.mockResolvedValue([{ id: '1458', video_url: media }]);
    body.fetch.mockImplementation(async () => new Response('not-media', { headers: { 'Content-Type': 'video/mp4' } }));
    await expect(body.run(douyin)).rejects.toMatchObject({ code: 'NO_PLAYABLE_MEDIA' });
  });
});
