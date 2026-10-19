const fs=await import('node:fs/promises');const base='/Volumes/T7-MacData/CodexBuilds/CreatorT246Delivery-20261017';
const task=await taskSpace(10),page=task.page('p1');await page.cdp('Network.enable');await page.cdp('Network.setBlockedURLs',{urls:[]});
const results=[];
async function inspect(width,state){
 await page.cdp('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:false});
 const r=await page.evaluate(()=>{const s=document.querySelector('#creatoros-manual-download-e315');if(!s)throw Error('缺手动下载区');const nodes=[...s.querySelectorAll('h2,p,a,span')].map(n=>({text:n.textContent.trim(),font:parseFloat(getComputedStyle(n).fontSize)}));const b=s.getBoundingClientRect(),link=s.querySelector('a');return{url:location.href,width:innerWidth,sectionLeft:b.left,sectionRight:b.right,sectionClientWidth:s.clientWidth,sectionScrollWidth:s.scrollWidth,minFont:Math.min(...nodes.map(n=>n.font)),nodes,href:link.href,download:link.getAttribute('download')};});
 if(r.width!==width||r.minFont<16||r.sectionLeft<0||r.sectionRight>width||r.sectionScrollWidth>r.sectionClientWidth||r.href!=='https://creatoros.aitongban.cloud/updates/CreatorOS_1.2.0_e3151ce89_macos-arm64.dmg')throw Error('真实官网手动下载区验收失败');results.push({requestedWidth:width,state,...r});
}
for(const width of [1440,360]){
 await page.goto('https://creatoros.aitongban.cloud/');await page.waitForSelector('#creatoros-manual-download-e315',{state:'visible'});await inspect(width,'真实官网初始');await page.screenshot({path:base+'/download-production-r4-'+width+'.png'});
 await page.reload();await page.waitForSelector('#creatoros-manual-download-e315',{state:'visible'});await inspect(width,'刷新');
 await page.goto('about:blank');await page.goto('https://creatoros.aitongban.cloud/');await page.waitForSelector('#creatoros-manual-download-e315',{state:'visible'});await inspect(width,'返回官网');
}
await fs.writeFile(base+'/browser-production-r4.json',JSON.stringify({status:'PASS',results,scope:'真实公开官网手动区；未重复下载/安装/激活；不冒真人双机UAT'},null,2)+'\n');console.log({status:'PASS',states:results.length});
