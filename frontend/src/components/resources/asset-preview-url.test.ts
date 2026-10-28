import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as React from "react";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import type { ResourceAsset } from "./types";

// [Bug-6 T-019] 缓存 TTL 强制 ≤ token TTL:local-fs 默认 15min 签名 → 我们 10min 缓存。
// 否则用户看一会儿图就全消失(token 过期后,缓存还认为 URL 有用 → onError → fallback)。

// 用 vi.useFakeTimers 控时间;vi.setSystemTime 移时钟。
const mockGetDownloadUrl = vi.fn<(p: { params: { assetId: string } }) => Promise<{ url?: string }>>();
vi.mock("@/lib/contract-client", () => ({
  client: {
    getDownloadUrl: (p: { params: { assetId: string } }) => mockGetDownloadUrl(p),
  },
}));

// 每个 case 用独立 module 实例,避免 module-scope cache 串味。
beforeEach(() => {
  vi.resetModules();
  mockGetDownloadUrl.mockReset();
  localStorage.clear();
  vi.useFakeTimers();
});

const previewAsset = (id: string): ResourceAsset => ({id,name:id,type:'image',mimeType:'image/png',fileSizeBytes:1,width:1,height:1,durationMs:null,tags:[],thumbnailToken:'synthetic',updatedAt:'2026-10-24'});
function pendingDownloads() {
  const pending = new Map<string, {resolve:(value:{url:string})=>void;reject:(error:Error)=>void}>();
  mockGetDownloadUrl.mockImplementation(({params})=>new Promise((resolve,reject)=>{pending.set(params.assetId,{resolve,reject});}));
  return pending;
}
async function flushPreview() { await act(async()=>{for(let i=0;i<12;i++)await Promise.resolve();}); }

it('T1424 真实24张缩略图最多同时发3个请求，仍挂载时全部可完成预览',async()=>{
 const pending=pendingDownloads(),{AssetThumbnail}=await import('./asset-thumbnail');
 const view=render(React.createElement(React.Fragment,null,...Array.from({length:24},(_,i)=>React.createElement(AssetThumbnail,{key:i,asset:previewAsset(`grid-${i}`)}))));
 await flushPreview();expect(mockGetDownloadUrl).toHaveBeenCalledTimes(3);
 let completed=0;
 while(completed<24){
  const batch=[...pending.entries()];expect(batch.length).toBeGreaterThan(0);expect(batch.length).toBeLessThanOrEqual(3);
  for(const [id,request]of batch){pending.delete(id);request.resolve({url:`https://signed/${id}.png`});completed++;}
  await flushPreview();
 }
 expect(mockGetDownloadUrl).toHaveBeenCalledTimes(24);expect(view.container.querySelectorAll('img')).toHaveLength(24);
});

it('T1424 缩略图占满3个名额时真实详情预览仍有第4名额',async()=>{
 pendingDownloads();const {AssetThumbnail}=await import('./asset-thumbnail'),{AssetLivePreview}=await import('./asset-live-preview');
 render(React.createElement(React.Fragment,null,...Array.from({length:24},(_,i)=>React.createElement(AssetThumbnail,{key:i,asset:previewAsset(`reserved-${i}`)}))));
 await flushPreview();render(React.createElement(AssetLivePreview,{asset:previewAsset('active-detail')}));await flushPreview();
 expect(mockGetDownloadUrl.mock.calls.map(([input])=>input.params.assetId)).toEqual(['reserved-0','reserved-1','reserved-2','active-detail']);
});

it('T1424 整页卸载撤销未发送缩略图，已发请求结算后不续旧队列',async()=>{
 const pending=pendingDownloads(),{AssetThumbnail}=await import('./asset-thumbnail');
 const view=render(React.createElement(React.Fragment,null,...Array.from({length:24},(_,i)=>React.createElement(AssetThumbnail,{key:i,asset:previewAsset(`leaving-${i}`)}))));
 await flushPreview();view.unmount();
 for(const [id,request]of pending)request.resolve({url:`https://signed/${id}.png`});
 await flushPreview();
 expect(mockGetDownloadUrl.mock.calls.map(([input])=>input.params.assetId)).toEqual(['leaving-0','leaving-1','leaving-2']);
});

it('T1424 同素材独立订阅共享原Promise，释放一方不撤销另一方', async () => {
  const pending = pendingDownloads();
  const {acquireAssetPreviewUrl, resolveAssetPreviewUrl} = await import('./asset-preview-url');
  const thumbnail = acquireAssetPreviewUrl('shared', {priority: 'thumbnail'});
  const detail = acquireAssetPreviewUrl('shared', {priority: 'active'});
  expect(thumbnail.promise).toBe(detail.promise);
  thumbnail.release(); thumbnail.release();
  await flushPreview();
  expect(mockGetDownloadUrl).toHaveBeenCalledTimes(1);
  pending.get('shared')!.resolve({url: 'https://signed/shared'});
  expect(await detail.promise).toBe('https://signed/shared');
  detail.release();
  expect(await resolveAssetPreviewUrl('shared')).toBe('https://signed/shared');
  expect(mockGetDownloadUrl).toHaveBeenCalledTimes(1);
});

it('T1424 最后一个排队订阅释放不记失败，可立即重新获取', async () => {
  const pending = pendingDownloads();
  const {acquireAssetPreviewUrl} = await import('./asset-preview-url');
  const cancelled = acquireAssetPreviewUrl('cancelled', {priority: 'thumbnail'});
  cancelled.release(); cancelled.release();
  expect(await cancelled.promise).toBeNull();
  await flushPreview();
  expect(mockGetDownloadUrl).not.toHaveBeenCalled();
  const retry = acquireAssetPreviewUrl('cancelled', {priority: 'thumbnail'});
  await flushPreview();
  expect(mockGetDownloadUrl).toHaveBeenCalledTimes(1);
  pending.get('cancelled')!.resolve({url: 'https://signed/retry'});
  expect(await retry.promise).toBe('https://signed/retry');
  retry.release();
});

it.each(['group', 'account'] as const)('T1424 真正发送前复核%s，旧排队任务不借新scope发送', async scope => {
  const pending = pendingDownloads();
  const {CURRENT_GROUP_KEY, CURRENT_ACCOUNT_KEY} = await import('@/lib/http-transport');
  const key = scope === 'group' ? CURRENT_GROUP_KEY : CURRENT_ACCOUNT_KEY;
  localStorage.setItem(key, 'old');
  const {acquireAssetPreviewUrl} = await import('./asset-preview-url');
  const old = acquireAssetPreviewUrl('scoped', {priority: 'active'});
  localStorage.setItem(key, 'new');
  await flushPreview();
  expect(await old.promise).toBeNull();
  expect(mockGetDownloadUrl).not.toHaveBeenCalled();
  const current = acquireAssetPreviewUrl('scoped', {priority: 'active'});
  await flushPreview();
  pending.get('scoped')!.resolve({url: 'https://signed/current'});
  expect(await current.promise).toBe('https://signed/current');
  old.release(); current.release();
});

it('T1424 已排队等待名额时切组，结算后不发送旧队列且不缓存迟到失败', async () => {
  const pending = pendingDownloads();
  const {CURRENT_GROUP_KEY} = await import('@/lib/http-transport');
  const {acquireAssetPreviewUrl} = await import('./asset-preview-url');
  localStorage.setItem(CURRENT_GROUP_KEY, 'old');
  const leases = Array.from({length: 5}, (_, i) => acquireAssetPreviewUrl(`waiting-${i}`, {priority: 'active'}));
  await flushPreview();
  expect(mockGetDownloadUrl).toHaveBeenCalledTimes(4);
  localStorage.setItem(CURRENT_GROUP_KEY, 'new');
  pending.get('waiting-0')!.reject(new Error('late old-scope failure'));
  await flushPreview();
  expect(await leases[4]!.promise).toBeNull();
  expect(mockGetDownloadUrl).toHaveBeenCalledTimes(4);
  localStorage.setItem(CURRENT_GROUP_KEY, 'old');
  const retry = acquireAssetPreviewUrl('waiting-0', {priority: 'active'});
  await flushPreview();
  expect(mockGetDownloadUrl).toHaveBeenCalledTimes(5);
  pending.get('waiting-0')!.resolve({url: 'https://signed/retry-old-scope'});
  expect(await retry.promise).toBe('https://signed/retry-old-scope');
  for (const lease of leases) lease.release(); retry.release();
});

it('T1424 真实缩略图卸载不撤销同素材详情消费者', async () => {
  const pending = pendingDownloads();
  const {AssetThumbnail} = await import('./asset-thumbnail');
  const {AssetLivePreview} = await import('./asset-live-preview');
  const asset = previewAsset('shared-components');
  const thumbnail = render(React.createElement(AssetThumbnail, {asset}));
  const detail = render(React.createElement(AssetLivePreview, {asset}));
  await flushPreview(); thumbnail.unmount();
  pending.get(asset.id)!.resolve({url: 'https://signed/shared-components'});
  await flushPreview();
  expect(mockGetDownloadUrl).toHaveBeenCalledTimes(1);
  expect(detail.container.querySelector('img')?.getAttribute('src')).toBe('https://signed/shared-components');
});

it('T1424 release与invalidate不提前释放真实在途名额，迟到结果不回填', async () => {
  const pending = pendingDownloads();
  const {acquireAssetPreviewUrl, invalidateAssetPreviewUrl, resolveAssetPreviewUrl} = await import('./asset-preview-url');
  const running = Array.from({length: 4}, (_, i) => acquireAssetPreviewUrl(`held-${i}`, {priority: 'active'}));
  await flushPreview();
  running[0]!.release(); invalidateAssetPreviewUrl('held-0');
  const replacement = acquireAssetPreviewUrl('held-0', {priority: 'active'});
  await flushPreview();
  expect(mockGetDownloadUrl).toHaveBeenCalledTimes(4);
  pending.get('held-0')!.resolve({url: 'https://signed/stale'});
  await flushPreview();
  expect(await running[0]!.promise).toBeNull();
  expect(mockGetDownloadUrl).toHaveBeenCalledTimes(5);
  pending.get('held-0')!.resolve({url: 'https://signed/replacement'});
  expect(await replacement.promise).toBe('https://signed/replacement');
  expect(await resolveAssetPreviewUrl('held-0')).toBe('https://signed/replacement');
  for (const lease of running) lease.release(); replacement.release();
});

it('T1424 后加入的主动消费者提升同素材排队优先级，未释放同级仍FIFO', async () => {
  const pending = pendingDownloads();
  const {acquireAssetPreviewUrl} = await import('./asset-preview-url');
  const leases = Array.from({length: 5}, (_, i) => acquireAssetPreviewUrl(`priority-${i}`, {priority: 'thumbnail'}));
  await flushPreview();
  const detail = acquireAssetPreviewUrl('priority-4', {priority: 'active'});
  expect(detail.promise).toBe(leases[4]!.promise);
  await flushPreview();
  expect(mockGetDownloadUrl.mock.calls.map(([input]) => input.params.assetId)).toEqual(['priority-0', 'priority-1', 'priority-2', 'priority-4']);
  pending.get('priority-0')!.resolve({url: 'https://signed/first'});
  await flushPreview();
  expect(mockGetDownloadUrl.mock.calls.at(-1)![0].params.assetId).toBe('priority-3');
  for (const lease of leases) lease.release(); detail.release();
});

it('T1424 失败释放名额并保留30秒失败缓存，不阻塞后续预览', async () => {
  const pending = pendingDownloads();
  const {acquireAssetPreviewUrl, resolveAssetPreviewUrl} = await import('./asset-preview-url');
  const leases = Array.from({length: 5}, (_, i) => acquireAssetPreviewUrl(`failed-${i}`, {priority: 'active'}));
  await flushPreview();
  pending.get('failed-0')!.reject(new Error('synthetic failure'));
  await flushPreview();
  expect(await leases[0]!.promise).toBeNull();
  expect(mockGetDownloadUrl).toHaveBeenCalledTimes(5);
  expect(await resolveAssetPreviewUrl('failed-0')).toBeNull();
  expect(mockGetDownloadUrl).toHaveBeenCalledTimes(5);
  for (const lease of leases) lease.release();
});

it('T1424 StrictMode重复effect不泄漏名额，原编辑器消费者能使用保留名额', async () => {
  pendingDownloads();
  const {AssetThumbnail} = await import('./asset-thumbnail');
  const {FinalVideoPreview} = await import('@/features/production/production-media-previews');
  render(React.createElement(React.StrictMode, null, ...Array.from({length: 24}, (_, i) => React.createElement(AssetThumbnail, {key: i, asset: previewAsset(`strict-${i}`)}))));
  await flushPreview();
  render(React.createElement(FinalVideoPreview, {assetId: 'editor-final'}));
  await flushPreview();
  expect(mockGetDownloadUrl.mock.calls.map(([input]) => input.params.assetId)).toEqual(['strict-0', 'strict-1', 'strict-2', 'editor-final']);
});

it.each(['thumbnail', 'detail'] as const)('T1424 真实%s媒体加载失败只重取一次，不形成请求循环', async kind => {
  mockGetDownloadUrl.mockResolvedValue({url: 'https://signed/broken'});
  const {AssetThumbnail} = await import('./asset-thumbnail');
  const {AssetLivePreview} = await import('./asset-live-preview');
  const view = render(React.createElement(kind === 'thumbnail' ? AssetThumbnail : AssetLivePreview, {asset: previewAsset('broken')}));
  await flushPreview();
  await act(async () => { fireEvent.error(view.container.querySelector('img')!); await vi.advanceTimersByTimeAsync(0); });
  await flushPreview();
  expect(mockGetDownloadUrl).toHaveBeenCalledTimes(2);
  await act(async () => { fireEvent.error(view.container.querySelector('img')!); await vi.advanceTimersByTimeAsync(0); });
  await flushPreview();
  expect(mockGetDownloadUrl).toHaveBeenCalledTimes(2);
  expect(view.container.querySelector('img')).toBeNull();
});

it("T-1073 预览元数据缓存超过256项淘汰最久未用项",async()=>{
  mockGetDownloadUrl.mockImplementation(async ({params})=>({url:`https://signed/${params.assetId}`}));
  const {resolveAssetPreviewUrl}=await import('./asset-preview-url');
  for(let i=0;i<300;i++)await resolveAssetPreviewUrl(`bounded-${i}`);
  await resolveAssetPreviewUrl('bounded-0');
  expect(mockGetDownloadUrl).toHaveBeenCalledTimes(301);
});

it("到期自动清除小元数据并停止清理timer，同素材共享在途且invalidate拒旧回填",async()=>{
 const {resolveAssetPreviewUrl,invalidateAssetPreviewUrl}=await import('./asset-preview-url');
 let release!:(value:{url:string})=>void;
 mockGetDownloadUrl.mockImplementationOnce(()=>new Promise(resolve=>{release=resolve;})).mockResolvedValue({url:'https://signed/new'});
 const first=resolveAssetPreviewUrl('same');expect(resolveAssetPreviewUrl('same')).toBe(first);
 await Promise.resolve();invalidateAssetPreviewUrl('same');
 expect(await resolveAssetPreviewUrl('same')).toBe('https://signed/new');
 release({url:'https://signed/old'});expect(await first).toBeNull();
 expect(await resolveAssetPreviewUrl('same')).toBe('https://signed/new');
 await vi.advanceTimersByTimeAsync(600000);
 expect(vi.getTimerCount()).toBe(0);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

it("真实缩略图消费者共享URL读取，到期重挂恢复，卸载与切scope拒旧签名", async () => {
  const { AssetThumbnail } = await import("./asset-thumbnail");
  const { CURRENT_GROUP_KEY } = await import("@/lib/http-transport");
  const asset: ResourceAsset = { id: "consumer-asset", name: "合成图片", type: "image", mimeType: "image/png", fileSizeBytes: 1, width: 1, height: 1, durationMs: null, tags: [], thumbnailToken: "synthetic", updatedAt: "2026-10-07" };
  localStorage.setItem(CURRENT_GROUP_KEY, "preview-group-a");
  mockGetDownloadUrl.mockResolvedValue({ url: "https://signed/first.png" });
  const first = render(React.createElement(React.Fragment, null, React.createElement(AssetThumbnail, { asset }), React.createElement(AssetThumbnail, { asset })));
  await act(async () => { await vi.advanceTimersByTimeAsync(0); });
  expect(first.container.querySelectorAll('img[src="https://signed/first.png"]')).toHaveLength(2);
  expect(mockGetDownloadUrl).toHaveBeenCalledTimes(1);
  first.unmount();
  await act(async () => { await vi.advanceTimersByTimeAsync(600000); });
  mockGetDownloadUrl.mockResolvedValue({ url: "https://signed/refreshed.png" });
  const refreshed = render(React.createElement(AssetThumbnail, { asset }));
  await act(async () => { await vi.advanceTimersByTimeAsync(0); });
  expect(refreshed.container.querySelector("img")?.getAttribute("src")).toBe("https://signed/refreshed.png");
  expect(mockGetDownloadUrl).toHaveBeenCalledTimes(2);
  refreshed.unmount();
  let finish!: (value: { url: string }) => void;
  mockGetDownloadUrl.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const pendingAsset = { ...asset, id: "pending-consumer-asset" };
  const pending = render(React.createElement(AssetThumbnail, { asset: pendingAsset }));
  await act(async () => { await Promise.resolve(); });
  localStorage.setItem(CURRENT_GROUP_KEY, "preview-group-b");
  await act(async () => { finish({ url: "https://signed/old-group.png" }); });
  expect(pending.container.querySelector("img")).toBeNull();
  pending.unmount();
  mockGetDownloadUrl.mockResolvedValue({ url: "https://signed/new-group.png" });
  const current = render(React.createElement(AssetThumbnail, { asset: pendingAsset }));
  await act(async () => { await vi.advanceTimersByTimeAsync(0); });
  expect(current.container.querySelector("img")?.getAttribute("src")).toBe("https://signed/new-group.png");
  localStorage.removeItem(CURRENT_GROUP_KEY);
});

describe("asset-preview-url TTL 缓存 (Bug-6 T-019)", () => {
  it("首次调用 → 走 dispatch 并缓存(TTL 10min)", async () => {
    mockGetDownloadUrl.mockResolvedValue({ url: "https://signed/1.jpg" });
    const { resolveAssetPreviewUrl } = await import("./asset-preview-url");
    const t0 = Date.now();
    vi.setSystemTime(t0);
    const u = await resolveAssetPreviewUrl("asset-1");
    expect(u).toBe("https://signed/1.jpg");
    expect(mockGetDownloadUrl).toHaveBeenCalledTimes(1);
  });

  it("TTL 内(<10min)再次调用 → 不再走 dispatch", async () => {
    mockGetDownloadUrl.mockResolvedValue({ url: "https://signed/2.jpg" });
    const { resolveAssetPreviewUrl } = await import("./asset-preview-url");
    const t0 = Date.now();
    vi.setSystemTime(t0);
    await resolveAssetPreviewUrl("asset-2");
    // 5 分钟后 —— 还在 10min TTL 内,缓存命中。
    vi.setSystemTime(t0 + 5 * 60 * 1000);
    const u = await resolveAssetPreviewUrl("asset-2");
    expect(u).toBe("https://signed/2.jpg");
    expect(mockGetDownloadUrl).toHaveBeenCalledTimes(1); // 没多调
  });

  it("TTL 后(>=10min)再次调用 → 自动 invalidate 并重换", async () => {
    mockGetDownloadUrl
      .mockResolvedValueOnce({ url: "https://signed/old.jpg" })
      .mockResolvedValueOnce({ url: "https://signed/new.jpg" });
    const { resolveAssetPreviewUrl } = await import("./asset-preview-url");
    const t0 = Date.now();
    vi.setSystemTime(t0);
    await resolveAssetPreviewUrl("asset-3");
    // 10 分钟 + 1ms 后 —— 缓存过期。
    vi.setSystemTime(t0 + 10 * 60 * 1000 + 1);
    const u = await resolveAssetPreviewUrl("asset-3");
    expect(u).toBe("https://signed/new.jpg"); // 拿到了新 URL
    expect(mockGetDownloadUrl).toHaveBeenCalledTimes(2); // 重换了一次
  });

  it("invalidate → 立即重换(下次调必新 fetch,不管 TTL)", async () => {
    mockGetDownloadUrl
      .mockResolvedValueOnce({ url: "https://signed/old.jpg" })
      .mockResolvedValueOnce({ url: "https://signed/replaced.jpg" });
    const { resolveAssetPreviewUrl, invalidateAssetPreviewUrl } =
      await import("./asset-preview-url");
    await resolveAssetPreviewUrl("asset-4");
    expect(mockGetDownloadUrl).toHaveBeenCalledTimes(1);
    invalidateAssetPreviewUrl("asset-4");
    // invalidate 后立刻调 → 必重换。
    const u = await resolveAssetPreviewUrl("asset-4");
    expect(u).toBe("https://signed/replaced.jpg");
    expect(mockGetDownloadUrl).toHaveBeenCalledTimes(2);
  });

  it("dispatch 失败 → 缓存 null(短 TTL),invalidate 后可重试", async () => {
    mockGetDownloadUrl.mockRejectedValueOnce(new Error("网络断"));
    const { resolveAssetPreviewUrl, invalidateAssetPreviewUrl } =
      await import("./asset-preview-url");
    const u = await resolveAssetPreviewUrl("asset-5");
    expect(u).toBeNull(); // 失败缓存 null,不无限重试
    // 30s 内的失败不会反复触发 dispatch(避免瞬时 5xx 打爆后端)。
    mockGetDownloadUrl.mockResolvedValueOnce({ url: "https://signed/recover.jpg" });
    const u2 = await resolveAssetPreviewUrl("asset-5");
    expect(u2).toBeNull(); // 失败 TTL 内仍返 null
    // invalidate + 再调 → 拿到好 URL。
    invalidateAssetPreviewUrl("asset-5");
    const u3 = await resolveAssetPreviewUrl("asset-5");
    expect(u3).toBe("https://signed/recover.jpg");
  });
});
