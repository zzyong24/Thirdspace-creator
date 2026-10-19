import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {pathToFileURL,fileURLToPath} from 'node:url';
const root=process.cwd(),out=path.join(root,'docs/verification/t1245/browser-3942-config-stable'),indexRoot=path.join(root,'docs/verification/t1207');
const require=createRequire(path.join(root,'frontend/package.json')),{chromium,expect:baseExpect}=require('@playwright/test'),expect=baseExpect.configure({timeout:120000});
const records=fs.readFileSync(path.join(indexRoot,'scenario-index.ndjson'),'utf8').trim().split('\n').map(JSON.parse);expect(records).toHaveLength(394);
const browser=await chromium.launch({headless:true,timeout:120000}),context=await browser.newContext({viewport:{width:1024,height:960}});context.setDefaultTimeout(120000);context.setDefaultNavigationTimeout(120000);
const observations={recordCount:394,checkpointImages:54,opened:[],nonFileAttempts:[],scope:'本地证据页真实打开与原图解码，不重新执行产品功能'};
try{
 await context.route('**/*',async route=>{const u=route.request().url();if(!u.startsWith('file:')&&!u.startsWith('data:')){observations.nonFileAttempts.push(new URL(u).origin);await route.abort();}else await route.continue();});
 const page=await context.newPage();await page.goto(pathToFileURL(path.join(indexRoot,'E2E-GALLERY.html')).href);await expect(page.locator('article.case')).toHaveCount(394);
 const id='6d09fca92676595ee8d1-925a30d511adcca21d02',selected=records.filter(r=>r.testId===id);expect(selected.map(r=>r.status)).toEqual(['passed','failed','failed','passed','passed']);observations.automationStatuses=selected.map(r=>r.status);const cards=page.locator('article.case').filter({hasText:id});await expect(cards).toHaveCount(5);
 for(let i=0;i<5;i++){const p=context.waitForEvent('page',{timeout:120000});await cards.nth(i).locator('a.thumb').click();const popup=await p;await popup.waitForLoadState('load',{timeout:120000});await expect.poll(()=>popup.locator('img').evaluate(img=>img.complete&&img.naturalWidth>0&&img.naturalHeight>0)).toBe(true);expect(fileURLToPath(popup.url())).toBe(path.resolve(indexRoot,selected[i].screenshot));observations.opened.push({status:selected[i].status,path:fileURLToPath(popup.url()),decoded:true});await popup.close();}
 await page.goto(pathToFileURL(path.join(indexRoot,'SETTINGS-CHECKPOINT-GALLERY.html')).href);await expect(page.locator('img')).toHaveCount(54);await expect.poll(()=>page.locator('img').evaluateAll(imgs=>imgs.every(img=>img.complete&&img.naturalWidth>0))).toBe(true);
 for(const width of [1024,390]){await page.setViewportSize({width,height:960});await page.locator('#checks-3942').scrollIntoViewIfNeeded();await expect(page.locator('#checks-3942')).toBeVisible();await page.screenshot({path:path.join(out,`gallery-latest-${width}.png`),timeout:120000,animations:'disabled'});}
 expect(observations.nonFileAttempts).toEqual([]);fs.writeFileSync(path.join(out,'gallery-browser-observations.json'),JSON.stringify(observations,null,2)+'\n');
}finally{await context.close();await browser.close();}
