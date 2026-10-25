import * as React from 'react';
import {act,cleanup,fireEvent,render,screen,within} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {GroupPlatformData} from './group-platform-data';
import type {GroupWorkspace} from './workspace-query';
import {CURRENT_GROUP_KEY} from '@/lib/http-transport';
import {notifyAccountsChanged} from '@/lib/account-events';
const account={id:'wv',name:'月明视频号',platform:'wechatVideo' as const,historical:false,archived:false};
const workspace:GroupWorkspace={groupId:'g',groupName:'月明',status:'active',platform:'wechatVideo',accountId:null,startDate:'2026-09-24',endDate:'2026-10-23',generatedAt:'2026-10-24T00:00:00Z',contentCount:0,publicationCount:0,pendingCount:0,collectedAccounts:0,totalAccounts:1,videoViews:null,articleReads:null,followers:null,latestCapturedAt:null,coverage:'',metricMode:'published_and_collected_in_period_cumulative',accounts:[account],platforms:[],collected:{state:'ready',catalogWorkCount:0,unattributableWorkCount:0,deduplicatedWorkCount:0,metrics:[]}};
const response=(total=0,items:unknown[]=[])=>new Response(JSON.stringify({data:{items,total,nextCursor:total>1?'1':null}}),{status:200});
const report={id:'report',userId:'owner',groupId:'g',accountId:'wv',membershipVersion:1,platform:'wechatVideo',kind:'channelsDaily',scope:'accountDaily',accumulation:'daily',selection:{startDate:'2026-09-01',endDate:'2026-09-02',timeZone:'Asia/Shanghai',meaning:'statisticsDates'},sourcePath:'/platform/statistic/post',filename:'report.csv',sha256:'b'.repeat(64),receivedBytes:100,tables:[{key:'daily',label:'每日数据',columns:[{key:'时间',label:'时间',unit:'date'},{key:'播放',label:'播放',unit:'count'}],rows:[]}],observedAt:'2026-10-01T00:00:00Z',ingestedAt:'2026-10-01T00:00:00Z'};
beforeEach(()=>{localStorage.setItem(CURRENT_GROUP_KEY,'g');});
afterEach(()=>{cleanup();vi.useRealTimers();vi.unstubAllGlobals();localStorage.clear();});
it('微信只读真实报表总数0，不触发同步，携带冻结组账号且保留原累计内容',async()=>{
 const fetch=vi.fn(async()=>response());vi.stubGlobal('fetch',fetch);
 render(<><p>原累计播放123</p><GroupPlatformData workspace={workspace}/></>);
 expect(screen.getByText('正在读取已保存报表…')).toBeVisible();expect(screen.getByText('原累计播放123')).toBeVisible();
 await screen.findByText('尚未同步平台报表');
 const [url,init]=fetch.mock.calls[0] as unknown as [string,RequestInit];
 expect(url).toBe('/api/v1/dispatch');expect(new Headers(init.headers).get('x-group-id')).toBe('g');expect(new Headers(init.headers).get('x-account-id')).toBe('wv');
 expect(JSON.parse(String(init.body))).toEqual({id:'platforms.reports.list',input:{params:{accountId:'wv'},query:{pageSize:1,cursor:null}}});
 expect(fetch).toHaveBeenCalledOnce();expect(screen.getByRole('link',{name:'查看原生报表'})).toHaveAttribute('href','/accounts/works?accountId=wv');
 expect(screen.queryByRole('button',{name:/同步|登录/})).toBeNull();expect(screen.getByText('日报不计入上方按作品汇总的累计指标。')).toBeVisible();
});
it('已有报表显示全部保存份数，非当前日期匹配数，不把报表份数叫作品数',async()=>{
 vi.stubGlobal('fetch',vi.fn(async()=>response(4,[report])));render(<GroupPlatformData workspace={workspace}/>);
 await screen.findByText('已有 4 份报表');expect(screen.getByText('数量为全部已保存报表，不受当前日期筛选限制。')).toBeVisible();
});
it('非微信目录入口冻结账号ID，窗内汇总与系统发布记录分开，不发报表请求',()=>{
 const fetch=vi.fn();vi.stubGlobal('fetch',fetch);
 render(<GroupPlatformData workspace={{...workspace,platform:'xiaohongshu',accounts:[{...account,id:'x/a ?',platform:'xiaohongshu'}],collected:{...workspace.collected!,catalogWorkCount:11}}}/>);
 expect(screen.getByText('所选日期内已纳入汇总 11 条平台作品')).toBeVisible();expect(screen.getByText(/与通过系统创建的发布记录分别统计/)).toBeVisible();
 expect(screen.getByRole('link',{name:'查看已采集作品'})).toHaveAttribute('href','/accounts/works?accountId=x%2Fa+%3F');expect(fetch).not.toHaveBeenCalled();
});
it('快手窗内0解释发布日期范围，保留全部目录入口但不声称全目录0',()=>{
 vi.stubGlobal('fetch',vi.fn());render(<GroupPlatformData workspace={{...workspace,platform:'kuaishou',accounts:[{...account,id:'ks',platform:'kuaishou'}]}}/>);
 expect(screen.getByText('2026-09-24 — 2026-10-23')).toBeVisible();expect(screen.getByText(/当前日期内没有可汇总的作品，可调整日期或查看已采集作品/)).toBeVisible();
 expect(screen.getByRole('link',{name:'查看已采集作品'})).toHaveAttribute('href','/accounts/works?accountId=ks');expect(screen.queryByText(/全目录.*0/)).toBeNull();
});
it('报表失败局部可重试，双击仅一次新请求',async()=>{
 const fetch=vi.fn(async()=>new Response('{}',{status:503}));vi.stubGlobal('fetch',fetch);render(<GroupPlatformData workspace={workspace}/>);
 await screen.findByText('已保存报表暂时无法读取。');let resolve!:(value:Response)=>void;fetch.mockImplementation(()=>new Promise<Response>(done=>{resolve=done;}));
 const retry=screen.getByRole('button',{name:'重试读取报表'});fireEvent.click(retry);fireEvent.click(retry);expect(fetch).toHaveBeenCalledTimes(2);
 await act(async()=>resolve(response(1,[report])));expect(screen.getByText('已有 1 份报表')).toBeVisible();
});
it('2秒慢读取可重试，取消旧请求且迟到结果不覆盖新结果',async()=>{
 vi.useFakeTimers();const calls:Array<{resolve:(value:Response)=>void;init:RequestInit}>=[];vi.stubGlobal('fetch',vi.fn((_url,init)=>new Promise<Response>(resolve=>calls.push({resolve,init}))));
 render(<GroupPlatformData workspace={workspace}/>);await act(async()=>vi.advanceTimersByTime(2000));
 expect(screen.getByText('报表读取较慢，其他数据仍可使用。')).toBeVisible();const retry=screen.getByRole('button',{name:'重试读取报表'});fireEvent.click(retry);fireEvent.click(retry);
 expect(calls).toHaveLength(2);expect(calls[0]!.init.signal?.aborted).toBe(true);await act(async()=>calls[1]!.resolve(response()));await act(async()=>calls[0]!.resolve(response(99,[report])));
 expect(screen.getByText('尚未同步平台报表')).toBeVisible();expect(screen.queryByText('已有 99 份报表')).toBeNull();
});
it('筛选切换取消旧读取且隔离迟到响应，同scope对象重建不重读',async()=>{
 const calls:Array<{resolve:(value:Response)=>void;init:RequestInit}>=[];vi.stubGlobal('fetch',vi.fn((_url,init)=>new Promise<Response>(resolve=>calls.push({resolve,init}))));
 const view=render(<GroupPlatformData workspace={workspace}/>);view.rerender(<GroupPlatformData workspace={{...workspace,accounts:[{...account}]}}/>);expect(calls).toHaveLength(1);
 const next={...workspace,startDate:'2026-10-01'};view.rerender(<GroupPlatformData workspace={next}/>);expect(calls).toHaveLength(2);expect(calls[0]!.init.signal?.aborted).toBe(true);
 await act(async()=>calls[1]!.resolve(response()));await act(async()=>calls[0]!.resolve(response(99,[report])));expect(screen.queryByText('已有 99 份报表')).toBeNull();
 view.unmount();expect(calls[1]!.init.signal?.aborted).toBe(true);
});
it('切组立即隐藏旧组数值并取消，拒绝迟到响应与旧组入口',async()=>{
 let resolve!:(value:Response)=>void;const fetch=vi.fn<(url:RequestInfo|URL,init?:RequestInit)=>Promise<Response>>(()=>new Promise<Response>(done=>{resolve=done;}));vi.stubGlobal('fetch',fetch);
 render(<GroupPlatformData workspace={workspace}/>);const init=fetch.mock.calls[0]![1] as RequestInit;
 await act(async()=>{localStorage.setItem(CURRENT_GROUP_KEY,'other');notifyAccountsChanged({source:'account-switcher',routeRefreshScheduled:true,groupId:'other'});});
 expect(init.signal?.aborted).toBe(true);await act(async()=>resolve(response(99,[report])));
 expect(screen.getByText('账号组已切换，请等待当前账号组的数据。')).toBeVisible();expect(screen.queryByRole('link',{name:'查看原生报表'})).toBeNull();expect(screen.queryByText('已有 99 份报表')).toBeNull();
});
it.each(['groupId','accountId','platform'])('报表%s与冻结范围不符不展示计数',async field=>{
 vi.stubGlobal('fetch',vi.fn(async()=>response(7,[{...report,[field]:field==='platform'?'wechatOfficial':'wrong'}])));render(<GroupPlatformData workspace={workspace}/>);
 await screen.findByText('已保存报表暂时无法读取。');expect(screen.queryByText('已有 7 份报表')).toBeNull();
});
it('仅当前筛选活跃微信账号读取，历史归档不创建不可用入口或请求',async()=>{
 const fetch=vi.fn(async()=>response());vi.stubGlobal('fetch',fetch);
 const view=render(<GroupPlatformData workspace={{...workspace,accounts:[account,{...account,id:'old',historical:true},{...account,id:'archived',archived:true},{...account,id:'official',platform:'wechatOfficial'}]}}/>);
 await screen.findByText('尚未同步平台报表');expect(fetch).toHaveBeenCalledOnce();expect(screen.getAllByRole('link',{name:'查看原生报表'})).toHaveLength(1);
 expect(within(view.container).queryByText('official')).toBeNull();
});
it('已有数值在同账号日期重新读取时保留并标明，卸载后取消',async()=>{
 const calls:Array<{resolve:(value:Response)=>void;init:RequestInit}>=[];vi.stubGlobal('fetch',vi.fn((_url,init)=>new Promise<Response>(resolve=>calls.push({resolve,init}))));
 const view=render(<GroupPlatformData workspace={workspace}/>);await act(async()=>calls[0]!.resolve(response(4,[report])));
 view.rerender(<GroupPlatformData workspace={{...workspace,startDate:'2026-10-01'}}/>);expect(screen.getByText('已有 4 份报表')).toBeVisible();expect(screen.getByText('正在读取已保存报表…')).toBeVisible();
 view.unmount();expect(calls[1]!.init.signal?.aborted).toBe(true);await act(async()=>calls[1]!.resolve(response()));
});

it('换账号隐藏前号保存数并冻结新账号，迟到旧响应不得写回',async()=>{
 const calls:Array<{resolve:(value:Response)=>void;init:RequestInit}>=[];vi.stubGlobal('fetch',vi.fn((_url,init)=>new Promise<Response>(resolve=>calls.push({resolve,init}))));
 const view=render(<GroupPlatformData workspace={workspace}/>);await act(async()=>calls[0]!.resolve(response(4,[report])));
 view.rerender(<GroupPlatformData workspace={{...workspace,accountId:'wv2',accounts:[{...account,id:'wv2'}]}}/>);
 expect(screen.queryByText('已有 4 份报表')).toBeNull();expect(calls[0]!.init.signal?.aborted).toBe(true);expect(new Headers(calls[1]!.init.headers).get('x-account-id')).toBe('wv2');
 await act(async()=>calls[1]!.resolve(response(2,[{...report,accountId:'wv2'}])));expect(screen.getByText('已有 2 份报表')).toBeVisible();
});
it('当前组与旧页面不符时不请求，也不提供旧账号入口',()=>{
 localStorage.setItem(CURRENT_GROUP_KEY,'other');const fetch=vi.fn();vi.stubGlobal('fetch',fetch);render(<GroupPlatformData workspace={workspace}/>);
 expect(screen.getByText('账号组已切换，请等待当前账号组的数据。')).toBeVisible();expect(fetch).not.toHaveBeenCalled();expect(screen.queryByRole('link')).toBeNull();
});
it('摘要读取失败不变成平台作品0，报表异常协议不变成未同步',async()=>{
 vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify({data:{total:-1,items:[],nextCursor:null}}),{status:200})));
 render(<GroupPlatformData workspace={{...workspace,collected:{state:'unavailable',catalogWorkCount:null,unattributableWorkCount:null,deduplicatedWorkCount:null,metrics:[]}}}/>);
 expect(screen.getByText('平台作品汇总暂时无法读取，可查看各账号已采集数据。')).toBeVisible();await screen.findByText('已保存报表暂时无法读取。');expect(screen.queryByText('尚未同步平台报表')).toBeNull();expect(screen.queryByText(/已纳入汇总 0/)).toBeNull();
});

it.each(['g','other'])('SSR到hydrate当前组%s保持首屏一致，确认前不渲染旧账号入口',async currentGroup=>{
 const {renderToString}=await import('react-dom/server');const {hydrateRoot}=await import('react-dom/client');
 const originalWindow=window;vi.stubGlobal('window',undefined);
 let html:string;
 try{html=renderToString(<GroupPlatformData workspace={workspace}/>);}finally{vi.stubGlobal('window',originalWindow);}
 expect(html!).not.toContain('/accounts/works?accountId=wv');expect(html!).toContain('正在确认当前账号组…');
 localStorage.setItem(CURRENT_GROUP_KEY,currentGroup);const fetch=vi.fn(async()=>response());vi.stubGlobal('fetch',fetch);
 const container=document.createElement('div');container.innerHTML=html!;document.body.appendChild(container);
 const recoverable:unknown[]=[];let root:ReturnType<typeof hydrateRoot>|undefined;
 try{
  await act(async()=>{root=hydrateRoot(container,<GroupPlatformData workspace={workspace}/>,{onRecoverableError:error=>recoverable.push(error)});});
  expect(recoverable).toEqual([]);
  if(currentGroup==='g'){expect(container.querySelector('a')).toHaveAttribute('href','/accounts/works?accountId=wv');expect(fetch).toHaveBeenCalledOnce();}
  else{expect(container.textContent).toContain('账号组已切换');expect(container.querySelector('a')).toBeNull();expect(fetch).not.toHaveBeenCalled();}
 }finally{await act(async()=>root?.unmount());container.remove();}
});
it.each(['same','unknown','cleared'] as const)('storage未知时%s事件按明确groupId判断',async kind=>{
 vi.stubGlobal('fetch',vi.fn(async()=>response()));render(<GroupPlatformData workspace={workspace}/>);await screen.findByText('尚未同步平台报表');
 localStorage.removeItem(CURRENT_GROUP_KEY);
 await act(async()=>{window.dispatchEvent(new CustomEvent('creatoros:accounts-changed',{detail:{source:'external',routeRefreshScheduled:false,...(kind==='same'?{groupId:'g'}:kind==='cleared'?{groupId:null}:{})}}));});
 if(kind==='cleared'){expect(screen.getByText('账号组已切换，请等待当前账号组的数据。')).toBeVisible();expect(screen.queryByRole('link')).toBeNull();}
 else{expect(screen.getByRole('link',{name:'查看原生报表'})).toBeVisible();expect(screen.queryByText('账号组已切换，请等待当前账号组的数据。')).toBeNull();}
});
