const {chromium,expect}=require('../../../frontend/node_modules/@playwright/test');
const fs=require('node:fs');
(async()=>{
 const browser=await chromium.launch();const context=await browser.newContext({viewport:{width:1366,height:900}});const page=await context.newPage();
 await context.addCookies([{name:'creatoros_current_account',value:'acct-f0bd945b-31',url:'http://127.0.0.1:3195'}]);
 await page.addInitScript(()=>localStorage.setItem('creatoros:current-account','acct-f0bd945b-31'));
 fs.writeFileSync('/tmp/creatoros-t1075-browser-state.json',JSON.stringify(await context.storageState()));
 await page.goto('http://127.0.0.1:3195/topics',{timeout:180000});
 console.log('topics body:',(await page.locator('body').innerText()).slice(-1800));
 await page.screenshot({path:'docs/verification/t1074/after.png',fullPage:true});
 for(const variant of ['a','b']){
  await page.goto('http://127.0.0.1:3195/knowledge-design?variant='+variant,{timeout:180000});
  await expect(page.locator('[data-design-candidate]')).toBeVisible({timeout:180000});
  await expect(page.locator('[data-slot=knowledge-detail-content]')).toBeVisible({timeout:180000});
  await page.screenshot({path:`docs/verification/t1075/candidate-${variant}.png`,fullPage:true});
  await page.getByLabel('搜索资料标题').fill('字幕');
  await expect(page.getByRole('button',{name:/观众问：字幕怎么校对/})).toBeVisible();
  await page.getByRole('button',{name:/观众问：字幕怎么校对/}).click();
  await expect(page.getByText('不能把一条问题当作普遍需求',{exact:false})).toBeVisible({timeout:120000});
  await page.getByLabel('搜索资料标题').fill('不存在的资料');
  await expect(page.getByText('没有匹配的资料。',{exact:false})).toBeVisible();
  for(const width of [1024,390]){await page.getByLabel('搜索资料标题').fill('');await page.setViewportSize({width,height:900});await page.screenshot({path:`docs/verification/t1075/candidate-${variant}-${width}.png`,fullPage:true});}
  await page.setViewportSize({width:1366,height:900});
 }
 console.log('candidates: real title filtering, real detail read, no-result and 1366/1024/390 captured');await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
