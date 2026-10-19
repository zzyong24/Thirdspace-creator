import * as React from 'react';
import {act,cleanup,fireEvent,render,screen} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {DashboardTrendCard,type DashboardTrendSource} from './dashboard-trend-card';
import {CURRENT_GROUP_KEY} from '@/lib/http-transport';
import {notifyAccountsChanged} from '@/lib/account-events';
const source:DashboardTrendSource={groupId:'g',query:{platform:'wechatVideo',accountId:'a',startDate:'2026-10-01',endDate:'2026-10-03'}};
const pubs=[{id:'p',title:'一个很长但需要完整阅读的真实作品名称用于检查换行和数字对齐',platform:'douyin' as const,status:'published' as const,views:0,engagement:null,publishedAt:'2026-10-01T00:00:00Z'}];
function data(values:Array<number|null>=[0,20,30],target=source){return {groupId:target.groupId,platform:target.query.platform??null,accountId:target.query.accountId??null,startDate:target.query.startDate,endDate:target.query.endDate,trend:values.map((value,i)=>({label:`2026-10-0${i+1}`,value})),performanceTrend:{mode:'daily',unit:'次',valueLabel:'播放量',reason:null,accountId:target.query.accountId,observedAt:'2026-10-04T01:00:00Z',reportIds:['report']}};}
const response=(value:unknown)=>new Response(JSON.stringify({data:value}),{status:200,headers:{'content-type':'application/json'}});
beforeEach(()=>localStorage.setItem(CURRENT_GROUP_KEY,'g'));
afterEach(()=>{cleanup();vi.unstubAllGlobals();localStorage.clear();});
it('独立读取真实日曲线、真0、日期时间轴与冻结组账号，不影响其它内容',async()=>{
 const fetch=vi.fn(async()=>response(data()));vi.stubGlobal('fetch',fetch);
 const view=render(<><p>继续创作仍可操作</p><DashboardTrendCard source={source} publications={pubs}/></>);
 expect(screen.getByText('继续创作仍可操作')).toBeVisible();
 await screen.findByText('每日播放');
 const [url,init]=fetch.mock.calls[0]! as unknown as [string,RequestInit];
 expect(url).toBe('/api/v1/dispatch');expect(JSON.parse(String(init.body)).id).toBe('pages.groupTrend.get');expect(new Headers(init.headers).get('x-group-id')).toBe('g');expect(new Headers(init.headers).get('x-account-id')).toBe('a');
 const chart=view.container.querySelector('[data-testid="dashboard-data-trend"]')!;const option=JSON.parse(chart.getAttribute('data-option')!);
 expect(option.xAxis.type).toBe('time');expect(option.series[0].data.map((p:[number,number])=>p[1])).toEqual([0,20,30]);expect(option.series[0].connectNulls).toBe(false);
 expect(view.container.querySelectorAll('[data-slot="section-card"]')).toHaveLength(1);
});
it('迟到旧组响应拒显，切组立即清旧图，并abort原请求',async()=>{
 let finish!:(value:Response)=>void;const fetch=vi.fn(()=>new Promise<Response>(done=>{finish=done;}));vi.stubGlobal('fetch',fetch);
 const view=render(<DashboardTrendCard source={source} publications={pubs}/>);
 expect(screen.getByText('正在读取每日数据…')).toBeVisible();
 const init=(fetch.mock.calls[0] as unknown as [unknown,RequestInit])[1];
 await act(async()=>{localStorage.setItem(CURRENT_GROUP_KEY,'other');notifyAccountsChanged({source:'account-switcher',routeRefreshScheduled:true,groupId:'other'});});
 expect((init.signal as AbortSignal).aborted).toBe(true);
 await act(async()=>finish(response(data())));
 expect(view.container.querySelector('[data-testid="dashboard-data-trend"]')).toBeNull();
 expect(screen.getByText('账号组已切换，请等待当前账号组的数据。')).toBeVisible();
});
it('筛选新scope同步隐藏旧图，旧响应不能覆盖新日期平台',async()=>{
 const calls:Array<{resolve:(v:Response)=>void;init:RequestInit}>=[];vi.stubGlobal('fetch',vi.fn((_url,init)=>new Promise<Response>(resolve=>calls.push({resolve,init}))));
 const view=render(<DashboardTrendCard source={source} publications={pubs}/>);
 const next={...source,query:{...source.query,accountId:'b'}};
 view.rerender(<DashboardTrendCard source={next} publications={pubs}/>);
 expect(calls).toHaveLength(2);expect(calls[0]!.init.signal?.aborted).toBe(true);
 await act(async()=>calls[1]!.resolve(response(data([0,2,3],next))));
 expect(screen.getByText('已显示 3 天数据 · 最高 3 次')).toBeVisible();
 await act(async()=>calls[0]!.resolve(response(data([0,200,300]))));
 expect(screen.queryByText(/最高 300 次/)).toBeNull();
});
it('日报失败局部回退且重试单在途；无日报不初始化ECharts',async()=>{
 const fetch=vi.fn(async()=>new Response('{}',{status:503}));vi.stubGlobal('fetch',fetch);
 const view=render(<DashboardTrendCard source={source} publications={pubs}/>);
 await screen.findByText('每日数据暂时无法读取。');expect(screen.getByText('0 次')).toBeVisible();expect(view.container.querySelector('[data-slot="echart"]')).toBeNull();
 let finish!:(v:Response)=>void;fetch.mockImplementation(()=>new Promise<Response>(resolve=>{finish=resolve;}));
 const button=screen.getByRole('button',{name:'重试读取每日数据'});fireEvent.click(button);fireEvent.click(button);expect(fetch).toHaveBeenCalledTimes(2);
 await act(async()=>finish(response(data())));await screen.findByText('每日播放');
});
it('同scope父对象重建不重复请求；单日准确提示，null保空',async()=>{
 const fetch=vi.fn(async()=>response(data([null,0,null])));vi.stubGlobal('fetch',fetch);
 const view=render(<DashboardTrendCard source={source} publications={pubs}/>);await screen.findByText('所选日期内仅有一天每日数据，暂不能判断走势。');
 view.rerender(<DashboardTrendCard source={{...source,query:{...source.query}}} publications={pubs}/>);expect(fetch).toHaveBeenCalledOnce();
});
it('公众号单位不明的旧views不改名绘图，并提供真实原生入口',()=>{
 vi.stubGlobal('fetch',vi.fn());const view=render(<DashboardTrendCard publications={[{...pubs[0]!,platform:'wechatOfficial',views:999}]} source={undefined}/>);
 expect(screen.getByText('暂无可比较的每日阅读人数')).toBeVisible();expect(view.container.textContent).not.toContain('999');expect(view.container.querySelector('[data-slot="dashboard-recent-plays-svg"]')).toBeNull();
});
it('混平台累计数据不共轴比较，legacy旧差分没有入口',()=>{
 const view=render(<DashboardTrendCard publications={[pubs[0]!,{...pubs[0]!,id:'other',platform:'youtube',views:200}]}/>);
 expect(screen.getByText('选择一个平台后查看近期作品表现。')).toBeVisible();expect(view.container.querySelector('[data-slot="dashboard-recent-plays-svg"]')).toBeNull();
});

it('T1356小红书真实零浏览的累计回退不标作播放，辅助说明同语义',async()=>{
 const xhs={...source,query:{...source.query,platform:'xiaohongshu' as const}};
 const unavailable={...data([],xhs),trend:[],performanceTrend:{mode:'unavailable',unit:'次',valueLabel:'播放量',reason:'unsupported_platform',accountId:'a',observedAt:null,reportIds:[]}};
 vi.stubGlobal('fetch',vi.fn(async()=>response(unavailable)));
 const view=render(<DashboardTrendCard source={xhs} publications={[{...pubs[0]!,platform:'xiaohongshu',views:0}]}/>);
 await screen.findByText('暂无每日数据，先看近期作品表现',{}, {timeout:120000});
 expect(screen.getByRole('heading',{name:'近期作品累计浏览'})).toBeVisible();expect(screen.getByText('0 次')).toBeVisible();
 expect(view.container.querySelector('[data-slot="chart-summary"]')).toHaveTextContent('累计浏览比较');expect(view.container.textContent).not.toContain('累计播放');
 expect(screen.getByRole('figure',{name:'近期作品累计浏览'})).toHaveAttribute('data-slot','dashboard-recent-plays');
 expect(view.container.querySelector('[data-slot="dashboard-recent-plays-svg"]')).not.toBeNull();expect(view.container.querySelector('[data-slot="dashboard-recent-plays-axis"]')).not.toBeNull();
});
