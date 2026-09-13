import {it,expect} from 'vitest';
import {buildShareModel} from './share-model';
import type {DailyReport} from './report-metrics';
const fixture=(metrics:Record<string,number>[]):DailyReport=>({date:'2026-09-01',startDate:'2026-09-01',endDate:'2026-09-07',timeZone:'Asia/Shanghai',generatedAt:'2026-09-08T00:00:00Z',accountId:'secret-id',accountName:'我的账号',positioning:'内部定位秘密',warnings:[],recentWorks:[],works:metrics.map((metrics,i)=>({publicationId:`pub-${i}`,projectId:`project-${i}`,title:`作品 ${i}`,publishedAt:'2026-09-03T00:00:00Z',capturedAt:null,metrics,script:'私密脚本',traffic:[]}))});
it('汇总整个所选周期，仅投影公开成绩；按播放排序保留全部作品',()=>{
 const model=buildShareModel(fixture([{views:10,follower_gain:1,likes:3,comments:2,shares:1,favorites:0},{plays:30,follower_gain:2},{views:20},{views:0}]));
 expect(model.period).toBe('2026-09-01 至 2026-09-07');expect(model.count).toBe(4);
 expect(model.views).toEqual({value:60,coverage:4,expected:4});expect(model.followers).toEqual({value:3,coverage:2,expected:4});
 expect(model.interactions).toEqual({value:6,coverage:4,expected:16});
 expect(model.highlights.map(x=>x.title)).toEqual(['作品 1','作品 2','作品 0','作品 3']);
 expect(JSON.stringify(model)).not.toMatch(/pub-|project-|secret-id|内部定位|私密脚本/);
});
it('真实零与未采集严格区分，不把缺失关注冒充零',()=>{
 expect(buildShareModel(fixture([{}])).views.value).toBeNull();
 expect(buildShareModel(fixture([{views:0,follower_gain:0}])).followers.value).toBe(0);
 expect(buildShareModel(fixture([]))).toMatchObject({count:0,highlights:[],views:{value:null},followers:{value:null}});
});
