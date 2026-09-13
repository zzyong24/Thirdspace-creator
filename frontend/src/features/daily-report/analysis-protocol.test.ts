import {describe,it,expect} from 'vitest';
import {createReportRequest,parseReportAnalysis,reportEvidenceKey,declaresReportProtocol} from './analysis-protocol';
const report:any={date:'2026-09-12',timeZone:'Asia/Shanghai',generatedAt:'2026-09-13T01:00:00Z',accountId:'a',accountName:'账号',positioning:null,works:[{publicationId:'p',script:'正文',metrics:{plays:0}}],recentWorks:[],warnings:[]};
const result={format:'creatoros.daily-report.v1',date:report.date,accountId:'a',sourceGeneratedAt:report.generatedAt,headline:'建议',summary:'摘要',positioning:{observation:'观察',suggestion:'建议'},works:[{publicationId:'p',observation:'观察',hypothesis:'待验证',experiment:'实验'}],experiments:[]};
describe('日报分析协议',()=>{
 it('仅接受绑定源快照的结构，不跨账号日期作品挂载',()=>{expect(parseReportAnalysis(JSON.stringify(result),report)?.headline).toBe('建议');for(const patch of [{accountId:'b'},{date:'2026-09-11'},{sourceGeneratedAt:'old'},{works:[{...result.works[0],publicationId:'foreign'}]}])expect(parseReportAnalysis(JSON.stringify({...result,...patch}),report)).toBeNull();expect(parseReportAnalysis('普通Markdown分析',report)).toBeNull();});
 it('样本有界且数量明确，纯读取时间变化不让旧分析误过期',()=>{const r={...report,works:Array.from({length:1000},(_,i)=>({...report.works[0],publicationId:'p'+i,script:'稿'.repeat(9000)})),recentWorks:Array.from({length:1000},(_,i)=>({publicationId:'r'+i}))};const q=createReportRequest(r);expect(q.report.works).toHaveLength(12);expect(q.report.works[0].script).toHaveLength(5000);expect(q.totalWorks).toBe(1000);expect(q.report.recentWorks).toEqual([]);expect(reportEvidenceKey(r)).toBe(reportEvidenceKey({...r,generatedAt:'later'}));expect(reportEvidenceKey(q.report,q.totalWorks,q.totalRecentWorks)).toBe(reportEvidenceKey(r));});
});

describe('实际模型前言与围栏恢复',()=>{
 it('说明文字前后包裹唯一JSON也能恢复卡片',()=>{const text='先读取方法，再给出报告。\n\n```json\n'+JSON.stringify(result)+'\n```\n以上为分析。';expect(parseReportAnalysis(text,report)?.headline).toBe('建议');expect(declaresReportProtocol(text)).toBe(true);});
 it('前言不能让错账号JSON绕过校验，也不接受多个协议对象',()=>{const fence=(x:unknown)=>'说明\n```json\n'+JSON.stringify(x)+'\n```';const bad=fence({...result,accountId:'other'});expect(parseReportAnalysis(bad,report)).toBeNull();expect(declaresReportProtocol(bad)).toBe(true);const ambiguous=fence(result)+'\n'+fence(result);expect(parseReportAnalysis(ambiguous,report)).toBeNull();expect(declaresReportProtocol(ambiguous)).toBe(true);});
 it('不把JSON字符串内的围栏、花括号或普通代码块当另一份报告',()=>{const x={...result,summary:'文本里有 { } 和 ``` 标记'};expect(parseReportAnalysis('说明\r\n```JSON\r\n'+JSON.stringify(x)+'\r\n```',report)?.summary).toBe(x.summary);expect(parseReportAnalysis('```json\n{"ordinary":true}\n```',report)).toBeNull();});
});
