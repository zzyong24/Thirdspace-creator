import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../../..');
const out=resolve(root,'docs/verification/t1434/r4');
const baseline=resolve(root,'docs/verification/t1434/r3');
const commit=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
const local=process.argv.includes('--local');
const sites=[{name:'官网',url:local?'http://127.0.0.1:8764/':'https://creatoros.aitongban.cloud/',canonical:'https://creatoros.aitongban.cloud/'},{name:'购买页',url:local?'http://127.0.0.1:8765/creatoros/':'https://buy.aitongban.cloud/creatoros/',canonical:'https://buy.aitongban.cloud/creatoros/'}];
const checkIds=['download-removed','versions','keyboard-refresh','responsive','real-screenshots','seo','storefront-preserved'];
const hash=x=>createHash('sha256').update(x).digest('hex');
const manifest=JSON.parse(readFileSync(resolve(baseline,'image-manifest.json'),'utf8'));
assert.equal(manifest.length,14);
for(const row of manifest){assert.equal(row.pixel_identical,true);assert.equal(hash(readFileSync(resolve(root,'website'+row.src))),row.webp_sha256);}
const buy=JSON.parse(readFileSync(resolve(root,'website/buy/products/creatoros.json'),'utf8'));
const original=JSON.parse(readFileSync(resolve(baseline,'buy-product-before.json'),'utf8'));
for(const key of ['downloads','downloadSection','support'])assert.deepEqual(buy[key],original[key]);
const transactionalCommerce=commerce=>({...commerce,plans:commerce.plans.map(({summary,activationNote,...operational})=>operational)});
assert.deepEqual(transactionalCommerce(buy.commerce),transactionalCommerce(original.commerce));
assert.match(buy.faq.find(row=>row.question.includes('功能有区别')).answer,/仅限购买599元永久版，月卡不包含/);
assert.equal(hash(readFileSync(resolve(root,'website/buy/assets/store.js'))),readFileSync(resolve(baseline,'store-js-before.sha256'),'utf8').trim());
for(const [path,canonical] of [['website/index.html',sites[0].canonical],['website/buy/creatoros/index.html',sites[1].canonical]]){
 const html=readFileSync(resolve(root,path),'utf8');assert.ok(html.includes('rel="canonical" href="'+canonical+'"'));assert.equal((html.match(/<h1\b/g)||[]).length,1);assert.ok(html.includes('schema.org/SoftwareApplication'));assert.ok(html.includes('og:image'));assert.equal(new Set([...html.matchAll(/src="(\/shots\/real\/[^" ]+)"/g)].map(m=>m[1])).size,14);
}
const script=`
const task=await taskSpace(18), page=task.page('p1');
const fs=await import('node:fs/promises');
const sites=${JSON.stringify(sites)}, viewports=[{width:1440,height:1000},{width:390,height:844}], checks=${JSON.stringify(checkIds)};
const captures=[], observations=[];
for(const site of sites)for(const viewport of viewports){
 await page.goto(site.url);
 if(site.name==='购买页')await page.waitForSelector('#app[aria-busy="false"]');
 await page.cdp('Emulation.setDeviceMetricsOverride',{...viewport,deviceScaleFactor:1,mobile:false});
 await page.waitForFunction(w=>innerWidth===w,viewport.width);
 if(site.name==='官网'){
  await page.click('loc=css:.hero-version a');
  await page.waitForFunction(()=>Math.abs(document.querySelector('#changelog').getBoundingClientRect().top)<180);
  if(await page.evaluate(()=>document.querySelectorAll('img[loading="lazy"]').length)===0)throw Error('导航不应提前加载所有原图');
 }
 await page.evaluate(()=>document.querySelectorAll('img[loading="lazy"]').forEach(i=>i.loading='eager'));
 await page.waitForFunction(()=>[...document.images].filter(i=>i.getAttribute('src')).every(i=>i.complete&&i.naturalWidth>0),undefined,{timeout:60_000});
 const initial=await page.evaluate(()=>({title:document.title,width:innerWidth,scrollWidth:document.documentElement.scrollWidth,canonical:document.querySelector('link[rel="canonical"]')?.href,images:[...new Set([...document.images].map(i=>i.getAttribute('src')).filter(s=>s?.startsWith('/shots/real/')))],gallery:document.querySelectorAll('.real-gallery img,#gallery img').length,privacy:!!document.querySelector('.privacy-preview'),share:document.querySelector('meta[property="og:image"]')?.content,staticHeading:document.querySelector('h1').innerText,copy:document.body.innerText}));
 if(initial.width!==viewport.width||initial.scrollWidth>viewport.width||initial.images.length!==14||initial.gallery!==14||initial.privacy||initial.canonical!==site.canonical||!initial.title.includes('CreatorOS')||!initial.share?.endsWith('.webp'))throw Error('页面/截图/SEO不符合要求 '+site.name+' '+JSON.stringify(initial));
 const distorted=await page.evaluate(()=>[...document.images].filter(i=>i.getAttribute('src')?.startsWith('/shots/real/')).some(i=>{const r=i.getBoundingClientRect();return r.width&&r.height&&Math.abs(r.width/r.height-i.naturalWidth/i.naturalHeight)>0.01}));
 if(distorted)throw Error('截图显示比例失真 '+site.name);
 const selector=site.name==='官网'?'.real-gallery img':'#gallery img';
 await page.evaluate(sel=>document.querySelector(sel).closest('section').scrollIntoView({behavior:'instant',block:'start'}),selector);
 await page.click('loc=css:'+selector+' >> nth=0');
 const modal=site.name==='官网'?'#imageViewer.open':'#lightbox.open';
 await page.waitForSelector(modal,{state:'visible'});
 await page.keyboard.press('Escape');
 await page.waitForFunction(sel=>!document.querySelector(sel),modal);
 await page.focus('loc=css:'+selector+' >> nth=1');
 await page.keyboard.press('Enter');
 await page.waitForSelector(modal,{state:'visible'});
 await page.keyboard.press('Escape');
 await page.waitForFunction(sel=>!document.querySelector(sel),modal);
 if(site.name==='官网'){
  await page.evaluate(()=>document.querySelector('#changelog').scrollIntoView({behavior:'instant',block:'start'}));
  const ids=['130','120','110','100','030','020','010'];
  for(const id of ids){
   await page.click('loc=css:#release-tab-'+id);
   if(await page.evaluate(()=>document.querySelectorAll('.release-panel:not([hidden])').length)!==1||await page.evaluate(()=>document.querySelector('.release-panel:not([hidden])').id)!=='release-'+id)throw Error('版本切换失配 '+id);
  }
  await page.click('loc=css:#release-tab-130');
  await page.press('loc=css:#release-tab-130','ArrowRight');
  if(await page.evaluate(()=>document.activeElement.id)!=='release-tab-120')throw Error('版本方向键失败');
  await page.press('loc=css:#release-tab-120','ArrowLeft');
  if(await page.evaluate(()=>!!document.querySelector('[download],#creatoros-manual-download-e315')))throw Error('恢复了旧下载区');
 }else{
  await page.evaluate(()=>document.querySelector('#buy').scrollIntoView({behavior:'instant',block:'start'}));
  await page.click('loc=css:button[data-retail-sku="creatoros_lifetime"]');
  if(await page.evaluate(()=>document.querySelector('#retail-sku').value)!=='creatoros_lifetime')throw Error('永久版选择失败');
  await page.click('loc=css:button[data-retail-sku="creatoros_monthly_30d"]');
  if(await page.evaluate(()=>document.querySelector('#retail-sku').value)!=='creatoros_monthly_30d')throw Error('月卡选择失败');
  await page.click('loc=css:#show-redeem');
  await page.waitForSelector('#redeem-panel',{state:'visible'});
 }
 captures.push({checkpoint:site.name,check_ids:checks,viewport,text:initial.copy});
 await page.evaluate(sel=>document.querySelector(sel==='#gallery img'?'#gallery':'#screenshots').scrollIntoView({behavior:'instant'}),selector);
 const shot=await page.cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
 await fs.writeFile(${JSON.stringify(out)}+'/'+(site.name==='官网'?'website':'store')+'-'+viewport.width+'.png',Buffer.from(shot.data,'base64'));
 observations.push({site:site.name,viewport,...initial,zoom:true,keyboardZoom:true,plans:site.name==='购买页'?'两套餐切换/领取入口通过，未下单或兑换':'不适用'});
 await page.reload();
 if(site.name==='购买页')await page.waitForSelector('#app[aria-busy="false"]');
 if(await page.evaluate(()=>document.querySelectorAll('.real-gallery img,#gallery img').length)!==14)throw Error('刷新截图缺失');
}
await fs.writeFile(${JSON.stringify(out)}+'/visible-copy.json',JSON.stringify({schema:'frontend-visible-copy/v1',task_id:'T-1434',commit_sha:${JSON.stringify(commit)},captures},null,2));
await fs.writeFile(${JSON.stringify(out)}+'/browser-observations.json',JSON.stringify({observedAt:new Date().toISOString(),observations},null,2));
console.log('两站真实浏览器检查通过：两种视口、各14张截图、鼠标/键盘预览、版本切换、套餐选择与刷新；未创建订单/兑换。');
`;
const result=spawnSync('ego-browser',['nodejs'],{cwd:root,input:script,encoding:'utf8',maxBuffer:1024*1024});
const output=`${result.stdout??''}${result.stderr??''}`;
writeFileSync(resolve(out,'browser-run.log'),output.trimEnd()+'\n');process.stdout.write(output);
if(result.status!==0)process.exit(result.status||1);
const contract=readFileSync(resolve(root,'docs/features/t1434-website-changelog-refresh.md'),'utf8');
const evidence='docs/verification/t1434/r4/browser-observations.json';
const report={schema:'frontend-validation/v1',task_id:'T-1434',commit_sha:commit,contract_sha:hash(contract).slice(0,12),contract_path:'docs/features/t1434-website-changelog-refresh.md',observed_at:new Date().toISOString(),status:'pass',run:{verify_key:'website-t1434',command:'node docs/verification/t1434/verify-website.mjs',exit_code:0,output_ref:'docs/verification/t1434/r4/browser-run.log'},environment:{surface:'browser',runtime:'Ego Lite Chromium，真实官网与购买页',viewports:[{width:1440,height:1000,result:'pass'},{width:390,height:844,result:'pass'}]},data:{mode:'non-fixture',witnesses:[{id:'creatoros-public-site',role:'官网实际截图'},{id:'creatoros-public-store',role:'购买站实际截图'}]},levels:{logic:{status:'pass',evidence_ref:'docs/verification/t1434/r4/website-tests.log'},surface:{status:'pass',evidence_ref:evidence},journey:{status:'pass',evidence_ref:evidence},experience:{status:'not-requested',evidence_ref:'真实浏览器自动检查，不冒用户人工验收'}},checks:checkIds.map(id=>({id,test_id:'website-'+id,result:'pass',evidence_ref:evidence})),coverage:['refresh','keyboard'].map(condition=>({condition,result:'pass',evidence_ref:evidence})),tdd_red_ref:'静态内容不制造TDD红测；线上旧页面缺少14张截图及SEO的失败见 docs/verification/t1434/r3/production-before.log',open_defects:[],visible_copy:{artifact_path:'docs/verification/t1434/r4/visible-copy.json',artifact_sha256:hash(readFileSync(resolve(out,'visible-copy.json')))}};
if(process.argv.includes('--report'))writeFileSync(resolve(out,'frontend-report.md'),'# 两站真实截图与SEO验收\n\n```frontend-validation\n'+JSON.stringify(report,null,2)+'\n```\n');
