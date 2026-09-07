import { describe, it, expect, vi } from "vitest";
import { DouyinAudioFetchError, fetchDouyinVideoUrl, fetchDouyinVideoSource, parseAwemeDetail, normalizeDouyinPlaybackUrl } from "./douyin-transcribe-source";
const html = (item: unknown) => `<script>window._ROUTER_DATA = ${JSON.stringify({loaderData:{"video_(id)/page":{videoInfoRes:{item_list:[item]}}}})}</script>`;
const video = { video: { play_addr: {url_list:["https://cdn.test/playwm/1"]}, cover:{url_list:["https://cdn.test/cover"]} } };
describe("Worker 抖音转写取流", () => {
  it("匿名成功经过通道且不调用登录回退", async () => {
    const fetchViaDetail = vi.fn(); const channel = vi.fn(async (run) => run());
    const fetcher = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(html(video)));
    const result = await fetchDouyinVideoSource({awemeId:"id",authDir:"fixture"}, {
      fetchViaDetail, fetchIesdouyin: id => fetchDouyinVideoUrl(id, {fetch:fetcher as typeof fetch, channel}),
    });
    expect(result).toEqual({kind:"video",playUrl:"https://cdn.test/play/1",coverUrl:"https://cdn.test/cover"});
    expect(channel).toHaveBeenCalledOnce(); expect(fetchViaDetail).not.toHaveBeenCalled();
    expect(fetcher.mock.calls[0]?.[0]).toBe("https://www.iesdouyin.com/share/video/id/");
  });
  it("默认匿名路径直接执行 Worker 请求并使用注入通道", async () => {
    const fetcher = vi.fn(async () => new Response(html(video)));
    const channel = vi.fn(async (run: () => Promise<{playUrl:string}>) => run());
    const detail = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    try {
      await expect(fetchDouyinVideoSource({awemeId:"default",authDir:"fixture"},{channel,fetchViaDetail:detail})).resolves.toMatchObject({kind:"video"});
      expect(fetcher).toHaveBeenCalledOnce(); expect(channel).toHaveBeenCalledOnce(); expect(detail).not.toHaveBeenCalled();
    } finally { vi.unstubAllGlobals(); }
  });
  it("匿名请求保留 30 秒超时边界", async () => {
    const timeout = vi.spyOn(AbortSignal, "timeout");
    try {
      await fetchDouyinVideoUrl("timeout", {fetch:vi.fn(async()=>new Response(html(video))) as typeof fetch});
      expect(timeout).toHaveBeenCalledWith(30_000);
    } finally { timeout.mockRestore(); }
  });
  it("解析失败回退时保留账号、网关、取消信号", async () => {
    const signal = new AbortController().signal; const gateway = {fixture:true};
    const detail = vi.fn(async () => parseAwemeDetail({aweme_detail:{images:[{}]}}));
    await expect(fetchDouyinVideoSource({awemeId:"a",authDir:"fixture/account",gateway,signal}, {
      fetchIesdouyin: id => fetchDouyinVideoUrl(id,{fetch:vi.fn(async()=>new Response("changed")) as typeof fetch}), fetchViaDetail:detail,
    })).resolves.toEqual({kind:"image-album"});
    expect(detail).toHaveBeenCalledWith({awemeId:"a",authDir:"fixture/account",gateway,signal});
  });
  it.each(["network", "http", "foreign"])("%s 失败不登录回退", async (kind) => {
    const detail = vi.fn(); const error = new Error("parseDouyinVideoUrl foreign");
    const fetchIesdouyin = kind === "foreign" ? async () => {throw error;} : (id:string) => fetchDouyinVideoUrl(id,{fetch:vi.fn(async()=>{if(kind === "network") throw new Error("offline"); return new Response("",{status:503});}) as typeof fetch});
    await expect(fetchDouyinVideoSource({awemeId:"a",authDir:"fixture"},{fetchIesdouyin,fetchViaDetail:detail})).rejects.toThrow();
    expect(detail).not.toHaveBeenCalled();
  });
  it("取消期间的解析失败不触发登录回退", async () => {
    const control = new AbortController(); const detail = vi.fn();
    await expect(fetchDouyinVideoSource({awemeId:"a",authDir:"fixture",signal:control.signal},{fetchViaDetail:detail,fetchIesdouyin:async()=>{control.abort();throw new DouyinAudioFetchError("parseDouyinVideoUrl");}})).rejects.toMatchObject({name:"AbortError"});
    expect(detail).not.toHaveBeenCalled();
  });
  it("通道先把空列表识别为内容错误，缺 router 为风控", async () => {
    const classifications:unknown[] = [];
    for (const page of [html(null).replace('[null]', '[]'), "changed"]) {
      await expect(fetchDouyinVideoUrl("a",{fetch:vi.fn(async()=>new Response(page)) as typeof fetch,channel:async(run,map)=>{try{return await run();}catch(error){classifications.push(map(error));throw error;}}})).rejects.toBeInstanceOf(DouyinAudioFetchError);
    }
    expect(classifications).toEqual([{kind:"empty-item-list"},{kind:"router-data-missing"}]);
  });
  it.each([{images:[{}]},{aweme_type:"68",video:{}},{}])("detail 图集形状不产生音频", detail => {expect(parseAwemeDetail({aweme_detail:detail})).toEqual({kind:"image-album"});});
  it("detail 保留下载回退与嵌套播放地址兼容",()=>{
    const url="https://aweme.snssdk.com/aweme/v1/play?video_id="+encodeURIComponent("https://cdn.test/playwm/2");
    expect(normalizeDouyinPlaybackUrl(url)).toBe("https://cdn.test/play/2");
    expect(parseAwemeDetail({aweme_detail:{video:{download_addr:{url_list:[url]}}}})).toEqual({kind:"video",playUrl:"https://cdn.test/play/2"});
    expect(()=>parseAwemeDetail({})).toThrow(DouyinAudioFetchError);
  });
});
