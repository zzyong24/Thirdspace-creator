import { describe, expect, it, vi } from 'vitest';
import { fetchDouyinVideoUrlViaDetail, type DetailContext, type DetailPage, type FetchVideoUrlViaDetailDeps } from './douyin-transcribe-detail';
import { DouyinNotLoggedInError } from './douyin-errors';

function fixture(options: { body?: string; cookies?: string[]; album?: boolean } = {}) {
  const evaluate = vi.fn().mockResolvedValueOnce(options.body ?? '').mockResolvedValueOnce({ aweme_detail: options.album ? { images: [{}] } : { video: { play_addr: { url_list: ['https://cdn.example/video'] } } } });
  const page: DetailPage = { goto: vi.fn().mockResolvedValue(undefined), waitForTimeout: vi.fn().mockResolvedValue(undefined), evaluate };
  const close = vi.fn().mockResolvedValue(undefined);
  const context: DetailContext = { pages: () => [page], newPage: vi.fn().mockResolvedValue(page), cookies: vi.fn().mockResolvedValue((options.cookies ?? ['sessionid']).map(name => ({ name }))), close };
  const openContext = vi.fn().mockResolvedValue(context);
  const channel = vi.fn<FetchVideoUrlViaDetailDeps['channel']>().mockImplementation(run => run());
  return { page, context, close, evaluate, openContext, channel };
}

describe('Worker 转写详情读取', () => {
  it('导航与页内取流共用一次通道，最后关闭资源', async () => {
    const f = fixture();
    await expect(fetchDouyinVideoUrlViaDetail({ awemeId: '12/34' }, f)).resolves.toEqual({ kind: 'video', playUrl: 'https://cdn.example/video' });
    expect(f.channel).toHaveBeenCalledTimes(1);
    expect(f.page.goto).toHaveBeenCalledWith('https://www.douyin.com/video/12%2F34', expect.objectContaining({ timeout: 60000 }));
    expect(f.evaluate.mock.calls[1]![1]).toContain('aweme_id=12%2F34');
    expect(f.close).toHaveBeenCalledTimes(1);
  });
  it('图集保留结构化跳过结果', async () => {
    const f = fixture({ album: true });
    await expect(fetchDouyinVideoUrlViaDetail({ awemeId: 'a' }, f)).resolves.toEqual({ kind: 'image-album' });
    expect(f.close).toHaveBeenCalledTimes(1);
  });
  it('无登录不导航、不申请通道，错误保持唯一类身份', async () => {
    const f = fixture({ cookies: [] });
    await expect(fetchDouyinVideoUrlViaDetail({ awemeId: 'a' }, f)).rejects.toBeInstanceOf(DouyinNotLoggedInError);
    expect(f.channel).not.toHaveBeenCalled();
    expect(f.page.goto).not.toHaveBeenCalled();
    expect(f.close).toHaveBeenCalledTimes(1);
  });
  it('验证码不发详情请求，保留限流错误分类', async () => {
    const f = fixture({ body: '请完成验证' });
    await expect(fetchDouyinVideoUrlViaDetail({ awemeId: 'a' }, f)).rejects.toThrow('验证码');
    expect(f.evaluate).toHaveBeenCalledTimes(1);
    expect(f.channel.mock.calls[0]![1](new Error('验证码'))).toEqual({ kind: 'captcha' });
    expect(f.close).toHaveBeenCalledTimes(1);
  });
  it('已取消时不打开浏览器', async () => {
    const f = fixture(), controller = new AbortController();
    const reason = new Error('停止'); controller.abort(reason);
    await expect(fetchDouyinVideoUrlViaDetail({ awemeId: 'a', signal: controller.signal }, f)).rejects.toBe(reason);
    expect(f.openContext).not.toHaveBeenCalled();
  });
  it('页面等待期间取消后不再观察或取流，关闭一次', async () => {
    const f = fixture(), controller = new AbortController();
    const reason = new Error('停止');
    vi.mocked(f.page.waitForTimeout).mockImplementation(async () => { controller.abort(reason); });
    await expect(fetchDouyinVideoUrlViaDetail({ awemeId: 'a', signal: controller.signal }, f)).rejects.toBe(reason);
    expect(f.evaluate).not.toHaveBeenCalled();
    expect(f.close).toHaveBeenCalledTimes(1);
  });
  it('迟到的 context 在取消后只清理，不读取 cookie', async () => {
    const f = fixture(), controller = new AbortController();
    const reason = new Error('停止');
    f.openContext.mockImplementation(async () => { controller.abort(reason); return f.context; });
    await expect(fetchDouyinVideoUrlViaDetail({ awemeId: 'a', signal: controller.signal }, f)).rejects.toBe(reason);
    expect(f.context.cookies).not.toHaveBeenCalled();
    expect(f.close).toHaveBeenCalledTimes(1);
  });
});
