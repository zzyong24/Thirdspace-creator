import {render,screen} from '@testing-library/react';
import {describe,it,expect,vi} from 'vitest';
import type {DailyReport} from '@/features/daily-report/report-metrics';
import {GroupProjectEvidence,projectEvidence} from './group-project-evidence';
vi.mock('@/features/daily-report/report-native-comparisons',()=>({ReportNativeComparisons:({report}:{report:DailyReport})=><div data-testid="native-comparison">{report.works.map(w=>w.publicationId).join(',')}</div>}));
const work=(id:string,platform:string,metrics:Record<string,number>,projectId='p1')=>({publicationId:id,projectId,platform,accountId:`account-${id}`,title:'一期内容',publishedAt:'2026-09-28T10:00:00Z',capturedAt:'2026-10-04T10:00:00Z',metrics,script:null,traffic:[]});
const report:DailyReport={date:'2026-09-28',startDate:'2026-09-28',endDate:'2026-10-04',timeZone:'Asia/Shanghai',generatedAt:'2026-10-05T00:00:00Z',accountId:null,accountName:null,positioning:null,warnings:[],works:[work('dy','douyin',{views:0,likes:2}),work('wx','wechatOfficial',{views:5300}),work('ks','kuaishou',{}),work('other','douyin',{views:999999},'p2')],recentWorks:[]};
describe('账号组项目复盘原生证据',()=>{
 it('项目真实ID裁剪，不混入组内其他内容',()=>{expect(projectEvidence(report,'p1').works.map(w=>w.publicationId)).toEqual(['dy','wx','ks']);});
 it('视频与阅读分别统计，真实0保留、未知指标为—',()=>{render(<GroupProjectEvidence report={projectEvidence(report,'p1')} accountNames={{'account-dy':'抖音主号'}}/>);expect(screen.getByText('抖音主号')).toBeVisible();expect(screen.getByTestId('native-comparison')).toHaveTextContent('dy,wx,ks');expect(screen.queryByText('999,999')).not.toBeInTheDocument();expect(screen.getByRole('row',{name:/公众号/})).toHaveTextContent('5,300');expect(screen.getByRole('row',{name:/快手/})).toHaveTextContent('—');expect(screen.getByRole('row',{name:/抖音/})).toHaveTextContent('0');});
});
