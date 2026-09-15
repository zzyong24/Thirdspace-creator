import type {Page} from '@playwright/test';
import {parseTrafficTables} from '@creatoros/backend/modules/analytics';
import {DouyinNotLoggedInError} from './douyin-errors';
/** SEMANTIC_BOUNDARY_ALLOW: 只识别已实测的平台页面协议，不按内容或作品年龄推断数据。 */
export function readTrafficPageState():false|'available'|'unavailable'{
 const text=(node:Element)=>(node as HTMLElement).innerText??node.textContent??'';
 const body=text(document.body);
 if(/扫码登录|安全验证|验证码|加载中|请稍候/.test(body)||document.querySelector('[aria-busy="true"],.semi-spin-spinning'))return false;
 if(![...document.querySelectorAll('[role="tab"][aria-selected="true"]')].some(n=>text(n).trim()==='流量分析'))return false;
 if([...document.querySelectorAll('table')].some(t=>[...t.querySelectorAll('th,td')].some(n=>text(n).trim()==='来源占比')&&t.querySelectorAll('tr').length>1))return 'available';
 const titles=[...document.querySelectorAll('[class^="card-title-"]')];
 if(titles.some(n=>text(n).trim()==='流量来源'))return false;
 // 2026-09-14实测旧作品页面：两个完整指标卡各有更新日期，新版来源页没有此旧版组合。
 // 未识别布局仍等待/报错，不把“暂时没找到表”泛化成无数据。
 if(!body.includes('作品状态正常'))return false;
 const legacy=['内容吸引力','观众参与度'].every(label=>{
  const title=titles.find(n=>text(n).trim()===label);
  const card=title?.closest('[class^="header-"]')?.parentElement;
  if(!card?.className.startsWith('card-'))return false;
  const tips=card.querySelector('[class^="tips-"]');
  return !!tips&&/更新至\s*\d{4}年\d{1,2}月\d{1,2}日/.test(text(tips))&&/\d+(?:\.\d+)?\s*%/.test(text(card));
 });
 return legacy?'unavailable':false;
}
/** 只读实际作品详情页的流量分析表；不猜测未验证的私有 API。 */
export async function readDouyinTrafficPage(page:Page,externalId:string,signal?:AbortSignal){
 if(!/^\d{10,25}$/.test(externalId))throw new Error('抖音作品标识无效');
 signal?.throwIfAborted();page.setDefaultTimeout(15_000);
 await page.goto(`https://creator.douyin.com/creator-micro/work-management/work-detail/${externalId}?enter_from=operation`,{waitUntil:'domcontentloaded',timeout:30_000});
 try{
  await page.getByRole('tab',{name:'流量分析',exact:true}).click();
  const ready=await page.waitForFunction(readTrafficPageState,undefined,{timeout:30_000});
  signal?.throwIfAborted();
  if(!page.url().includes(`/work-detail/${externalId}`))throw new Error('流量来源作品上下文已变化');
  if(await ready?.jsonValue()==='unavailable'){
   const error=new Error('平台暂未提供该作品的流量来源数据');error.name='DouyinTrafficUnavailableError';throw error;
  }
 }catch(error){
  if(/login|passport/.test(page.url())||await page.getByText('扫码登录',{exact:true}).isVisible().catch(()=>false))throw new DouyinNotLoggedInError();
  throw error;
 }
 signal?.throwIfAborted();
 const expand=page.getByText('展开更多',{exact:true}).first();
 if(await expand.isVisible())await expand.click();
 const complete=!(await expand.isVisible());
 const tables=await page.locator('table').evaluateAll(nodes=>nodes.map(t=>({rows:[...t.querySelectorAll('tr')].map(row=>[...row.querySelectorAll('th,td')].map(cell=>(cell as HTMLElement).innerText.trim()))})));
 if(!page.url().includes(`/work-detail/${externalId}`))throw new Error('流量来源作品上下文已变化');
 return parseTrafficTables(tables,{complete,windowLabel:null});
}
