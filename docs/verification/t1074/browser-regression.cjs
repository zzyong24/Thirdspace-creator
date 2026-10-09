const { chromium,expect }=require('../../../frontend/node_modules/@playwright/test');
const fs=require('node:fs');
(async()=>{
 const browser=await chromium.launch();const context=await browser.newContext({storageState:'/tmp/creatoros-t1075-browser-state.json'});const page=await context.newPage();
 const accountId='acct-f0bd945b-31';await page.addInitScript(id=>localStorage.setItem('creatoros:current-account',id),accountId);
 const op=async(id,input)=>{const r=await page.request.post('http://127.0.0.1:3195/api/v1/dispatch',{headers:{'x-account-id':accountId},data:{id,input},timeout:120000});const b=await r.json();expect(r.ok(),JSON.stringify(b.error)).toBe(true);return b.data;};
 const original=await op('topics.workspace.get',{});
 const config={...original.config,audience:'已保存的历史观众',audienceGrid:[{id:'a0',text:'已保存观众格',evidence:'hypothesis',sourceRefs:[],version:1,basis:'',publicQueryAllowed:false}]};
 const saved=await op('topics.workspace.save',{body:{config,expectedVersion:original.version,idempotencyKey:'t1074-preserve-historical'}});
 for(const width of [1366,1024]){
  await page.setViewportSize({width,height:900});await page.goto('http://127.0.0.1:3195/topics',{timeout:180000});
  await expect(page.getByTestId('topics-three-column')).toBeVisible({timeout:120000});await expect(page.getByTestId('audience-task-workspace')).toHaveCount(0);await expect(page.getByText(/九宫格/)).toHaveCount(0);
  await expect(page.getByTestId('topics-generate-actions').getByRole('link')).toHaveCount(4);
  await page.screenshot({path:`docs/verification/t1074/after-${width}.png`,fullPage:true});
 }
 expect(await op('topics.workspace.get',{})).toEqual(saved);
 console.log('PASS:1366/1024 page removal + four ordinary generation links + historical nonempty configuration write/read unchanged');await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
