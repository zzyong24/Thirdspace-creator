const fs = await import('node:fs/promises');
const root='/Volumes/T7-MacData/CodexBuilds/T243-CreatorOS-20261017/artifact-smoke-e3151ce89';
const ready=JSON.parse(await fs.readFile(root+'/sidecar-ready-r1.json','utf8'));
if(ready.sourceCommit!=='e3151ce89b2dfa6be5d5743965d11b486982f9e3')throw Error('错误包版本');
const task=await taskSpace(2); const page=task.page('p1');
await page.cdp('Network.enable');
await page.cdp('Network.setBlockedURLs',{urls:['https://*']});
const results=[];
async function inspect(width,state){
 const result=await page.evaluate(()=>{
  const main=document.querySelector('[data-testid="activate-page"]');
  if(!main)throw Error('缺真实激活页');
  const nodes=[];const walker=document.createTreeWalker(main,NodeFilter.SHOW_TEXT);
  while(walker.nextNode()){
   const n=walker.currentNode,p=n.parentElement;
   if(!n.textContent.trim()||!p||!p.getClientRects().length)continue;
   const s=getComputedStyle(p);if(s.visibility==='hidden'||s.display==='none')continue;
   nodes.push({text:n.textContent.trim(),font:parseFloat(s.fontSize),tag:p.tagName});
  }
  for(const n of main.querySelectorAll('input'))if(n.getClientRects().length)nodes.push({text:n.placeholder||n.getAttribute('aria-label')||'输入框',font:parseFloat(getComputedStyle(n).fontSize),tag:'INPUT'});
  return {width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,minFont:Math.min(...nodes.map(n=>n.font)),nodes,alert:main.querySelector('#activate-error')?.textContent??null};
 });
 const resultWithState={requestedWidth:width,state,...result};
 results.push(resultWithState);
 if(result.width!==width||result.scrollWidth>width||result.minFont<16)throw Error('真实视口/字号/溢出失败:'+JSON.stringify(resultWithState));
}
try{
 for(const width of [1440,360]){
  await page.goto(ready.url);
  await page.waitForSelector('#activate-code',{state:'visible'});
  await page.cdp('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:false});
  await inspect(width,'初始稳定状态');
  await page.click('loc=role:button[name="已有原激活码？"]',{label:'展开历史激活码输入'});
  await page.waitForSelector('input[type="password"]',{state:'visible'});
  await inspect(width,'展开历史激活码');
  await page.click('loc=role:button[name="已有原激活码？"]',{label:'收起历史激活码输入'});
  await page.click('loc=css:[data-testid="activate-form"] button[type="submit"]',{label:'核对空输入错误反馈'});
  await page.waitForFunction(()=>document.querySelector('#activate-error')?.textContent==='请输入激活码。');
  await inspect(width,'空提交本地错误');
  await page.screenshot({path:root+'/activate-'+width+'-empty.png'});
  await page.evaluate(()=>{
   const original=window.fetch.bind(window);
   window.__activateFontAudit={requests:0,finish:null,restore:()=>{window.fetch=original;}};
   window.fetch=(input,init)=>{
    if(String(input)==='/api/v1/activate'){
     const body=JSON.parse(String(init?.body??'{}'));
     if(body.code!=='LOCAL-SYNTHETIC-FONT-ONLY')throw Error('仅允许本地合成输入');
     window.__activateFontAudit.requests++;
     return new Promise(resolve=>{window.__activateFontAudit.finish=()=>resolve(new Response(JSON.stringify({ok:false,message:'连接暂不可用，请保留输入后重试。'}),{status:503,headers:{'content-type':'application/json'}}));});
    }
    return original(input,init);
   };
  });
  await page.fill('#activate-code','LOCAL-SYNTHETIC-FONT-ONLY');
  await page.click('loc=css:[data-testid="activate-form"] button[type="submit"]',{label:'查看受控激活等待反馈'});
  await page.waitForFunction(()=>document.querySelector('[data-testid="activate-form"] button')?.textContent==='激活中…');
  await inspect(width,'本地fetch替身等待');
  const pending=await page.evaluate(()=>({disabled:document.querySelector('[data-testid="activate-form"] button').disabled,requests:window.__activateFontAudit.requests}));
  if(!pending.disabled||pending.requests!==1)throw Error('等待防重复失败');
  await page.screenshot({path:root+'/activate-'+width+'-waiting.png'});
  await page.evaluate(()=>window.__activateFontAudit.finish());
  await page.waitForFunction(()=>document.querySelector('#activate-error')?.textContent==='连接暂不可用，请保留输入后重试。');
  await inspect(width,'本地fetch替身失败可恢复');
  const failed=await page.evaluate(()=>({value:document.querySelector('#activate-code').value,disabled:document.querySelector('[data-testid="activate-form"] button').disabled,requests:window.__activateFontAudit.requests}));
  if(failed.value!=='LOCAL-SYNTHETIC-FONT-ONLY'||failed.disabled||failed.requests!==1)throw Error('失败保留与零自动重试失败');
  await page.screenshot({path:root+'/activate-'+width+'-failure.png'});
  await page.click('loc=css:[data-testid="activate-form"] button[type="submit"]',{label:'明确重试本地合成输入'});
  await page.waitForFunction(()=>window.__activateFontAudit.requests===2);
  await page.evaluate(()=>window.__activateFontAudit.finish());
  await page.waitForFunction(()=>document.querySelector('#activate-error')?.textContent==='连接暂不可用，请保留输入后重试。');
  await inspect(width,'用户明确重试后恢复按钮');
  await page.evaluate(()=>window.__activateFontAudit.restore());
  await page.reload();
  await page.waitForSelector('#activate-code',{state:'visible'});
  await page.cdp('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:false});
  await inspect(width,'刷新后回到稳定入口');
  await page.goto('about:blank');await page.goto(ready.url);
  await page.waitForSelector('#activate-code',{state:'visible'});
  await page.cdp('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:false});
  await inspect(width,'离开后返回稳定入口');
 }
 await fs.writeFile(root+'/browser-font-r1.json',JSON.stringify({status:'隔离包实际激活UI字号与恢复通过；非真实授权UAT',sourceCommit:ready.sourceCommit,spaceId:2,page:'p1',results,limits:['实际包内sidecar，无原生壳/用户数据','空提交是真实本地校验；等待/失败/重试使用仅本页fetch替身，不调用激活服务','未输入真实码、未连接真实手机号/设备、未产生业务写入','1440/360均同round设置并断言实际innerWidth']},null,2)+'\n');
 console.log({status:'PASS',states:results.length,widths:[1440,360]});
 console.log(await page.snapshot());
}catch(error){await fs.writeFile(root+'/browser-font-r1-failure.json',JSON.stringify({error:String(error),results},null,2));throw error;}
