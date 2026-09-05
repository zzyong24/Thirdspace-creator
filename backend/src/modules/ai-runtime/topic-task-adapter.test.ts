import {describe,it,expect,vi} from 'vitest';
import type {RequestContext} from '@creatoros/contract';
import {buildTrendQuery,formatTrendBrief,assembleTrendBriefDetailed,trendQualityFromDetail,type TrendHit} from './topic-task-adapter';
const ctx:RequestContext={userId:'u1',requestId:'r1',source:'user'};
describe("buildTrendQuery", () => {
  it("贴定位领域,空白归一 + 截断", () => {
    expect(buildTrendQuery("  硬核 AI  创作者  ")).toBe(
      "硬核 AI 创作者 最新热点 趋势",
    );
  });
  it("无定位 → 通用 query,不产出空串", () => {
    expect(buildTrendQuery("")).toBe("内容创作 最新热点 趋势");
    expect(buildTrendQuery(undefined as unknown as string)).toBe(
      "内容创作 最新热点 趋势",
    );
  });
});

describe("formatTrendBrief", () => {
  it("非空命中 → 带段头的编号列表(title —— snippet)", () => {
    const hits: TrendHit[] = [
      { title: "热点一", snippet: "摘要一" },
      { title: "热点二" },
    ];
    const brief = formatTrendBrief(hits);
    expect(brief).toContain("当前热点");
    expect(brief).toContain("1. 热点一 —— 摘要一");
    expect(brief).toContain("2. 热点二");
  });
  it("空数组 / 全空 title → 空串(诚实降级)", () => {
    expect(formatTrendBrief([])).toBe("");
    expect(formatTrendBrief([{ title: "  " }])).toBe("");
  });
});


describe('聊天/每日选题共享趋势装配',()=>{
 it('保留定位派生query和真实搜索摘要',async()=>{
 const trendSearch=vi.fn(async(_ctx:RequestContext,_query:string,_opts?:{count?:number})=>[{title:'AI Agent 爆发',snippet:'多个框架发布'}]);
 const result=await assembleTrendBriefDetailed(ctx,'',{trendSearch});expect(trendSearch).toHaveBeenCalledTimes(1);expect(trendSearch).toHaveBeenCalledWith(ctx,'内容创作 最新热点 趋势',{count:8});expect(result.brief).toContain('AI Agent 爆发');expect(result.brief).toContain('多个框架发布');expect(result.searchHitCount).toBe(1);
 });
 it('搜索失败/未装配保持诚实空降级',async()=>{
 const result=await assembleTrendBriefDetailed(ctx,'',{trendSearch:async()=>{throw Error('web.search未配')}});expect(result.brief).toBe('');expect(result.searchHitCount).toBe(0);expect((await assembleTrendBriefDetailed(ctx,'',{})).brief).toBe('');
 });
 it('单路失败保留另一真实来源及质量计数',async()=>{
 const result=await assembleTrendBriefDetailed(ctx,'领域',{trendSearch:async()=>{throw Error('offline')},trendSourceSignals:async()=>[{title:'真实信号',url:'https://example.com',heat:null,publishedAt:null,sourceName:'真实源'}]});expect(result.brief).toContain('真实信号');expect(trendQualityFromDetail(result)).toEqual({sourceCount:1,signalCount:1});
 });
});
