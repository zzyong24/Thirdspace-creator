import { describe, expect, it, vi } from 'vitest';
import {
  fetchDouyinVideoUrlAnonymously,
  isAwemeDetailResponseFor,
  type AnonymousDetailContext,
  type AnonymousDetailPage,
  type AnonymousDetailResponse,
  type FetchAnonymousDetailDeps,
} from './douyin-transcribe-anonymous';

const VIDEO = { aweme_detail: { video: { play_addr: { url_list: ['https://cdn.example/video'] } } } };

function fixture(options: { responses?: Array<{ url: string; json: unknown }>; body?: string } = {}) {
  const responses: AnonymousDetailResponse[] = (options.responses ?? [
    { url: 'https://www.douyin.com/aweme/v1/web/aweme/detail/?aid=6383&aweme_id=111&a_bogus=x', json: VIDEO },
  ]).map(r => ({ url: () => r.url, json: async () => r.json }));
  const page: AnonymousDetailPage = {
    goto: vi.fn().mockResolvedValue(undefined),
    waitForTimeout: vi.fn().mockResolvedValue(undefined),
    evaluate: vi.fn().mockResolvedValue(options.body ?? ''),
    waitForResponse: vi.fn().mockImplementation(async (predicate: (r: AnonymousDetailResponse) => boolean) => {
      const hit = responses.find(predicate);
      if (!hit) throw new Error('Timeout waiting for response');
      return hit;
    }),
  };
  const close = vi.fn().mockResolvedValue(undefined);
  const context: AnonymousDetailContext = { newPage: vi.fn().mockResolvedValue(page), close };
  const openContext = vi.fn().mockResolvedValue(context);
  const channel = vi.fn<FetchAnonymousDetailDeps['channel']>().mockImplementation(run => run());
  return { page, close, openContext, channel };
}

describe('未登录转写:游客作品页详情', () => {
  it('截取作品页自身的 detail 响应解析播放地址,不检查登录 cookie', async () => {
    const f = fixture();
    await expect(fetchDouyinVideoUrlAnonymously({ awemeId: '111' }, f)).resolves.toEqual({ kind: 'video', playUrl: 'https://cdn.example/video' });
    expect(f.page.goto).toHaveBeenCalledWith('https://www.douyin.com/video/111', expect.anything());
    expect(f.channel).toHaveBeenCalledTimes(1);
    expect(f.close).toHaveBeenCalledTimes(1);
  });

  it('只认同一作品的 detail 响应,其它作品的推荐详情不算', async () => {
    const f = fixture({ responses: [{ url: 'https://www.douyin.com/aweme/v1/web/aweme/detail/?aweme_id=999', json: VIDEO }] });
    await expect(fetchDouyinVideoUrlAnonymously({ awemeId: '111' }, f)).rejects.toThrow('aweme_detail 为空');
    expect(f.channel.mock.calls[0]![1](new Error('aweme_detail 为空'))).toEqual({ kind: 'empty-item-list' });
    expect(f.close).toHaveBeenCalledTimes(1);
  });

  it('没拿到详情且页面是验证码 → 按验证码分类', async () => {
    const f = fixture({ responses: [], body: '请完成下列验证后继续' });
    await expect(fetchDouyinVideoUrlAnonymously({ awemeId: '111' }, f)).rejects.toThrow('验证码');
  });

  it('已取消时不启动浏览器', async () => {
    const f = fixture(), controller = new AbortController();
    const reason = new Error('停止'); controller.abort(reason);
    await expect(fetchDouyinVideoUrlAnonymously({ awemeId: '111', signal: controller.signal }, f)).rejects.toBe(reason);
    expect(f.openContext).not.toHaveBeenCalled();
  });

  it('URL 匹配按路径与 aweme_id 精确比较', () => {
    expect(isAwemeDetailResponseFor('https://www.douyin.com/aweme/v1/web/aweme/detail/?aweme_id=1', '1')).toBe(true);
    expect(isAwemeDetailResponseFor('https://www.douyin.com/aweme/v1/web/aweme/detail/?aweme_id=12', '1')).toBe(false);
    expect(isAwemeDetailResponseFor('https://www.douyin.com/aweme/v1/web/aweme/post/?aweme_id=1', '1')).toBe(false);
    expect(isAwemeDetailResponseFor('not a url', '1')).toBe(false);
  });
});
