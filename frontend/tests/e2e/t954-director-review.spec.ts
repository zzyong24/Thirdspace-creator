import type { Page } from '@playwright/test';
import { expect, test } from '../helpers/test-environment';

async function create(page:Page,id:string,body:unknown,accountId?:string):Promise<{id:string}>{
 const response=await page.request.post('/api/v1/dispatch',{headers:{'content-type':'application/json',...(accountId?{'x-account-id':accountId}:{})},data:{id,input:{body}}});
 expect(response.ok(),`${id}: ${response.status()} ${await response.text()}`).toBe(true);
 return (await response.json()).data;
}

test('T954 无发布数据的真实复盘页面可用，补采返回空结果，诊断入口不强制成功经验',async({page,baseURL},testInfo)=>{
 test.setTimeout(180_000);
 const account=await create(page,'accounts.create',{platform:'douyin',accountHandle:`@t954-isolated-${Date.now()}`});
 const project=await create(page,'projects.create',{title:'T954 内容诊断隔离验收',brief:''},account.id);
 await page.context().addCookies([{name:'creatoros_current_account',value:encodeURIComponent(account.id),url:baseURL!}]);
 await page.addInitScript(id=>window.localStorage.setItem('creatoros:current-account',id),account.id);
 await page.goto(`/projects/${project.id}/review`);
 const traffic=page.getByRole('region',{name:'流量来源'});
 await expect(traffic.getByText('观众从哪里来')).toBeVisible({timeout:60_000});
 await expect(traffic.getByText(/暂无流量来源数据/)).toBeVisible();
 const review=page.getByRole('button',{name:'帮我复盘'}).first();
 await expect(review).toBeEnabled();
 const refreshResponse=page.waitForResponse(response=>{
  if(!response.url().endsWith('/api/v1/dispatch'))return false;
  try{return response.request().postDataJSON()?.id==='analytics.traffic.refresh';}catch{return false;}
 });
 await traffic.getByRole('button',{name:'补采 / 重试'}).click();
 const response=await refreshResponse;
 expect(response.ok(),await response.text()).toBe(true);
 expect((await response.json()).data).toMatchObject({queued:0,jobRunId:null,aiTaskId:null});
 await expect(traffic.getByText('本项目暂无可补采的已发布抖音作品。')).toBeVisible();
 await expect(traffic.getByRole('button',{name:'补采 / 重试'})).toBeEnabled();
 await page.screenshot({path:testInfo.outputPath('t954-review-empty-desktop.png'),fullPage:true});
 // 只验证真实按钮至聊天请求的接线；截停模型请求，避免隔离 smoke 消费付费模型。
 const chatRequest=page.waitForRequest(request=>request.url().endsWith('/api/chat'));
 await page.route('**/api/chat',route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'T954_SMOKE_MODEL_NOT_INVOKED'})}));
 await review.click();
 const request=await chatRequest;
 const payload=request.postDataJSON();
 expect(payload.chatContext).toMatchObject({projectId:project.id,functionKey:'review.analyze'});
 expect(JSON.stringify(payload.messages)).toContain('没有表现数据时只诊断内容，不作效果归因');
 expect(JSON.stringify(payload.messages)).toContain('没有足够依据可以没有经验候选');
 await page.setViewportSize({width:1024,height:768});
 await expect(traffic).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth>document.documentElement.clientWidth)).toBe(false);
 await page.screenshot({path:testInfo.outputPath('t954-review-empty-narrow.png'),fullPage:true});
});
