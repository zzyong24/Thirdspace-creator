import {describe,it,expect,vi} from 'vitest';
import type {Page} from '@playwright/test';
import {readDouyinTrafficPage,readTrafficPageState} from './douyin-traffic';
import {DouyinNotLoggedInError} from './douyin-errors';
// 2026-09-11 本人创作者中心真实作品 7683770599029640448 的展开后 DOM 表格。
const rows=[['抖音 App','来源占比','对比7日'],['推荐页','95.7%','+8.2%'],['关注页','2%','+1%'],['消息页','1%','+0.1%'],['朋友页','0.5%','-1.1%'],['个人主页','0.4%','-2.8%'],['其他','0.3%','-0.3%']];
function fixture(){
 let url='',expanded=false;
 const expand={isVisible:vi.fn(async()=>!expanded),click:vi.fn(async()=>{expanded=true;})};
 const page={setDefaultTimeout:vi.fn(),goto:vi.fn(async(value:string)=>{url=value;}),url:()=>url,getByRole:vi.fn(()=>({click:vi.fn(async()=>{})})),waitForFunction:vi.fn(async()=>{}),getByText:vi.fn(()=>({first:()=>expand,isVisible:async()=>false})),locator:vi.fn(()=>({evaluateAll:async(fn:(nodes:Element[])=>unknown)=>{const t=document.createElement('table');for(const values of expanded?rows:rows.slice(0,-1)){const r=t.insertRow();for(const value of values){const c=r.insertCell();Object.defineProperty(c,'innerText',{value});}}return fn([t]);}}))};
 return {page:page as unknown as Page,raw:page,expand};
}
describe('真实来源表适配',()=>{
 it('导航原作品、展开并解析真实列，比较7日列不会误用为统计窗口',async()=>{const f=fixture();const result=await readDouyinTrafficPage(f.page,'7683770599029640448');expect(f.expand.click).toHaveBeenCalledOnce();expect(f.raw.getByRole).toHaveBeenCalledWith('tab',{name:'流量分析',exact:true});expect(result).toMatchObject({app:'抖音 App',windowLabel:null,complete:true,entries:[{label:'推荐页',percentage:95.7},{label:'关注页',percentage:2},{label:'消息页',percentage:1},{label:'朋友页',percentage:0.5},{label:'个人主页',percentage:0.4},{label:'其他',percentage:0.3}]});});
 it('失效会话返回可重连错误；取消不发请求',async()=>{const f=fixture();f.raw.goto.mockImplementation(async()=>{f.raw.url=()=> 'https://creator.douyin.com/passport/login';});f.raw.getByRole.mockImplementation(()=>({click:vi.fn(async()=>{throw new Error('tab unavailable');})}));await expect(readDouyinTrafficPage(f.page,'7683770599029640448')).rejects.toBeInstanceOf(DouyinNotLoggedInError);const controller=new AbortController();controller.abort();const g=fixture();await expect(readDouyinTrafficPage(g.page,'7683770599029640448',controller.signal)).rejects.toThrow();expect(g.raw.goto).not.toHaveBeenCalled();});
 it('作品上下文被跳转时拒绝写入',async()=>{const f=fixture();f.raw.goto.mockImplementation(async()=>{f.raw.url=()=> 'https://creator.douyin.com/creator-micro/work-management';});await expect(readDouyinTrafficPage(f.page,'7683770599029640448')).rejects.toThrow('上下文已变化');});
});
describe('已确认页面状态，不把未提供来源误判超时',()=>{
 const legacy=()=>{document.body.innerHTML='<div role="tab" aria-selected="true">流量分析</div><div>作品状态正常</div><section class="card-observed"><div class="header-x"><div class="card-title-x">内容吸引力</div><div class="tips-x">以下数据更新至2026年09月04日</div></div><div>完播率 2.06% 平均播放时长 16 秒</div></section><section class="card-observed"><div class="header-x"><div class="card-title-x">观众参与度</div><div class="tips-x">弹幕量、不感兴趣率更新至2026年09月04日</div></div><div>点赞率 1.64% 评论率 0.16%</div></section>';};
 it('两张已加载的旧版指标卡但无来源组件，返回平台未提供',()=>{legacy();expect(readTrafficPageState()).toBe('unavailable');});
 it('来源卡尚在加载、登录/验证提示、非流量页或未知结构不能当作未提供',()=>{
  legacy();document.body.insertAdjacentHTML('beforeend','<div class="card-title-x">流量来源</div>');expect(readTrafficPageState()).toBe(false);
  for(const text of ['加载中','扫码登录','安全验证']){legacy();document.body.insertAdjacentHTML('beforeend',`<div>${text}</div>`);expect(readTrafficPageState()).toBe(false);}
  legacy();document.querySelector('[role=tab]')!.setAttribute('aria-selected','false');expect(readTrafficPageState()).toBe(false);
  document.body.innerHTML='<div role="tab" aria-selected="true">流量分析</div>';expect(readTrafficPageState()).toBe(false);
 });
 it('真实来源表有数据行才就绪，不能把表头当作采集完成',()=>{
  legacy();document.body.insertAdjacentHTML('beforeend','<div class="card-title-x">流量来源</div><table><tr><th>抖音 App</th><th>来源占比</th></tr></table>');expect(readTrafficPageState()).toBe(false);
  document.querySelector('table')!.insertAdjacentHTML('beforeend','<tr><td>推荐页</td><td>90%</td></tr>');expect(readTrafficPageState()).toBe('available');
 });
});
