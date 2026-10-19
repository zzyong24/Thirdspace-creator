const fs=await import('node:fs/promises');const base='/Volumes/T7-MacData/CodexBuilds/CreatorT246Delivery-20261017';
const info=JSON.parse(await fs.readFile(base+'/preview-ready.json','utf8'));
const task=await taskSpace(2),page=task.page('p1');await page.cdp('Network.enable');await page.cdp('Network.setBlockedURLs',{urls:['https://*']});
const results=[];
async function inspect(width,state){
 await page.cdp('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:false});
 const result=await page.evaluate(()=>{const s=document.querySelector('#creatoros-manual-download-e315');if(!s)throw Error('缺手动下载区');const texts=[...s.querySelectorAll('h2,p,a,span')].map(n=>({text:n.textContent.trim(),font:parseFloat(getComputedStyle(n).fontSize)}));const r=s.getBoundingClientRect(),link=s.querySelector('a');return{width:innerWidth,scrollWidth:document.documentElement.scrollWidth,sectionLeft:r.left,sectionRight:r.right,sectionClientWidth:s.clientWidth,sectionScrollWidth:s.scrollWidth,minFont:Math.min(...texts.map(n=>n.font)),texts,href:link.getAttribute('href'),download:link.getAttribute('download')};});
 results.push({requestedWidth:width,state,...result});if(result.width!==width||result.minFont<16||result.sectionLeft<0||result.sectionRight>width||result.sectionScrollWidth>result.sectionClientWidth||result.href!=='/updates/CreatorOS_1.2.0_e3151ce89_macos-arm64.dmg')throw Error('手动下载区真实视口/布局/类型失败');
}
for(const width of [1440,360]){
 await page.goto(info.url);await page.waitForSelector('#creatoros-manual-download-e315',{state:'visible'});await inspect(width,'初始候选');await page.screenshot({path:base+'/download-preview-r2-'+width+'.png'});
 await page.reload();await page.waitForSelector('#creatoros-manual-download-e315',{state:'visible'});await inspect(width,'刷新');
 await page.goto('about:blank');await page.goto(info.url);await page.waitForSelector('#creatoros-manual-download-e315',{state:'visible'});await inspect(width,'返回');
}
await fs.writeFile(base+'/browser-preview-r2.json',JSON.stringify({status:'本地真实候选手动区布局PASS；不是生产下载验收',results,scope:'下载资产未公开；未点击虚拟下载、未改线上站点/账户/设备/钱包'},null,2)+'\n');console.log({status:'PASS',states:results.length});
