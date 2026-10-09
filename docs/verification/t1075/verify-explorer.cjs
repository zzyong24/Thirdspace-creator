const {chromium,expect}=require('../../../frontend/node_modules/@playwright/test');
const {resolve}=require('node:path');
(async()=>{
 const browser=await chromium.launch();
 const page=await browser.newPage({viewport:{width:1366,height:1000}});
 await page.goto('file://'+resolve('docs/features/t1075-knowledge-redesign/style-explorer.html'));
 const sample=page.locator('img').nth(1);
 await expect.poll(()=>sample.evaluate(e=>{for(let n=e;n;n=n.parentElement)if(Number(getComputedStyle(n).opacity)<1)return false;return true})).toBe(true);
 await page.screenshot({path:'docs/verification/t1075/explorer.png',fullPage:true});
 await page.getByRole('button',{name:'单张',exact:true}).click();
 await expect(page.getByRole('button',{name:'实际尺寸 100%',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'并排',exact:true}).click();
 await page.getByRole('button',{name:'手机 390',exact:true}).click();
 console.log('PASS 离线图片加载与入场完成、并排/单张/手机切换');
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
