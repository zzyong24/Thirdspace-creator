import type {Page} from '@playwright/test';
import {parseTrafficTables} from '@creatoros/backend/modules/analytics';
import {DouyinNotLoggedInError} from './douyin-errors';
/** 只读实际作品详情页的流量分析表；不猜测未验证的私有 API。 */
export async function readDouyinTrafficPage(page:Page,externalId:string,signal?:AbortSignal){
 if(!/^\d{10,25}$/.test(externalId))throw new Error('抖音作品标识无效');
 signal?.throwIfAborted();page.setDefaultTimeout(15_000);
 await page.goto(`https://creator.douyin.com/creator-micro/work-management/work-detail/${externalId}?enter_from=operation`,{waitUntil:'domcontentloaded',timeout:30_000});
 try{
  await page.getByRole('tab',{name:'流量分析',exact:true}).click();
  await page.waitForFunction(()=>[...document.querySelectorAll('table')].some(t=>t.innerText.includes('来源占比')),undefined,{timeout:15_000});
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
