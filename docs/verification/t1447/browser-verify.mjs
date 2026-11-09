import {execFileSync} from 'node:child_process';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../../..');
const script=String.raw`
const fs=await import('node:fs/promises');
const t=await taskSpace(3),p=t.page('p1');
const evidence=ROOT+'/docs/verification/t1447';
const runtime=JSON.parse(await fs.readFile(evidence+'/browser-runtime.json','utf8'));
const entities=JSON.parse(await fs.readFile(evidence+'/browser-entities.json','utf8'));
const captures=[],checks=[];
const assert=(ok,message)=>{if(!ok)throw Error(message);};
async function capture(checkpoint,ids,viewport){captures.push({checkpoint,check_ids:ids,viewport,url:await p.url(),text:await p.evaluate(()=>document.body.innerText)});}
async function choose(name){await p.click('loc=css:[data-slot="studio-account-layout"] aside button:has-text("'+name+'")');await p.waitForFunction(n=>[...document.querySelectorAll('[data-slot="studio-account-layout"] aside button')].some(b=>b.textContent.includes(n)&&b.getAttribute('aria-pressed')==='true'),name);}
for(const viewport of [{width:1440,height:900},{width:390,height:844}]){
 await p.cdp('Emulation.setDeviceMetricsOverride',{...viewport,deviceScaleFactor:1,mobile:false});
 await p.goto(runtime.origin+'/accounts');await p.waitForSelector('table[aria-label="各平台能力"]');
 await choose(entities.g.name);await p.waitForFunction(()=>document.querySelector('table')?.innerText.includes('身份未验证 · 状态验收抖音甲'));
 const table=await p.evaluate(()=>document.querySelector('table[aria-label="各平台能力"]').innerText);
 assert(table.includes('状态验收抖音乙')&&table.includes('登录待验证')&&!table.includes('最近验证有效'),'真实登记账号或同平台多账号显示错误');
 await capture('当前组与两个未验证成员',['collection','selection','detail'],viewport);
 const workspace=await p.evaluate(()=>document.querySelector('button[aria-label^="当前账号组："]')?.getAttribute('aria-label'));
 await choose(entities.h.name);await p.waitForFunction(()=>document.querySelector('[data-testid="account-empty-state"]'));
 assert(!(await p.evaluate(()=>document.querySelector('table').innerText)).includes('状态验收抖音'),'空组残留另一组账号');
 assert(await p.evaluate(()=>[...document.querySelectorAll('button')].some(b=>b.textContent==='进入此账号组')||[...document.querySelectorAll('a')].some(a=>a.textContent.includes('开始定位'))),'空组没有下一步');
 assert(await p.evaluate(()=>document.querySelector('button[aria-label^="当前账号组："]')?.getAttribute('aria-label'))===workspace,'查看另一组意外切换工作区');
 await capture('切换空组清旧账号并保留下一步',['selection','detail','empty-action'],viewport);
 await choose(entities.g.name);await p.waitForFunction(()=>document.querySelector('table')?.innerText.includes('身份未验证 · 状态验收抖音甲'));
 await p.evaluate(()=>{window.__bindingFetch=window.fetch;window.__bindingMode='hold';window.__bindingCalls=0;window.fetch=async(...args)=>{let body;try{body=JSON.parse(args[1]?.body??'{}');}catch{}if(body?.id==='accountGroups.bindingStatus'){window.__bindingCalls++;if(window.__bindingMode==='error')return new Response(JSON.stringify({error:{message:'状态读取暂时不可用'}}),{status:503,headers:{'content-type':'application/json'}});if(window.__bindingMode==='hold')await new Promise(resolve=>{window.__bindingRelease=resolve;});}return window.__bindingFetch(...args);};});
 await p.click('loc=role:button[name="刷新绑定状态"]');await p.waitForFunction(()=>document.querySelector('table')?.innerText.includes('登录状态读取中'));
 await capture('只读刷新加载中',['refresh'],viewport);
 await p.click('loc=role:button[name="刷新绑定状态"]');await p.click('loc=role:button[name="刷新绑定状态"]');
 assert(await p.evaluate(()=>window.__bindingCalls===1),'重复刷新产生并发请求');
 await p.evaluate(()=>{window.__bindingMode='normal';window.__bindingRelease();});
 await p.waitForFunction(()=>document.querySelector('table')?.innerText.includes('身份未验证 · 状态验收抖音甲'));
 await p.evaluate(()=>{window.__bindingMode='error';});
 await p.click('loc=role:button[name="刷新绑定状态"]');await p.waitForFunction(()=>document.querySelector('table')?.innerText.includes('登录状态未确认'));
 await capture('真实读取故障保留账号与重试',['failure-recovery'],viewport);
 await p.evaluate(()=>{window.__bindingMode='normal';});await p.click('loc=role:button[name="刷新绑定状态"]');
 await p.waitForFunction(()=>document.querySelector('table')?.innerText.includes('身份未验证 · 状态验收抖音甲'));
 await p.evaluate(()=>{window.fetch=window.__bindingFetch;delete window.__bindingFetch;});
 await p.reload();await p.waitForFunction(()=>document.querySelector('table')?.innerText.includes('身份未验证 · 状态验收抖音甲'));
 assert(await p.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),'整页水平溢出');
 await capture('刷新后真实状态与原入口仍可用',['refresh','failure-recovery'],viewport);
 await p.hover('table[aria-label="各平台能力"]',{label:'查看平台绑定状态'});
 await p.screenshot({path:evidence+'/browser-'+viewport.width+'.png'});
 checks.push({viewport,result:'pass'});
}
const child=await import('node:child_process');const commit_sha=child.execFileSync('git',['rev-parse','HEAD'],{cwd:ROOT,encoding:'utf8'}).trim();
await fs.writeFile(evidence+'/visible-copy.json',JSON.stringify({schema:'frontend-visible-copy/v1',task_id:'T-1447',commit_sha,captures},null,2));
await fs.writeFile(evidence+'/browser-result.json',JSON.stringify({observed_at:new Date().toISOString(),result:'pass',surface:'browser',runtime:'Ego Chromium + Next.js 真实隔离服务',mode:'non-fixture',witnesses:[{id:entities.g.id,role:'members-workspace'},{id:entities.h.id,role:'empty-workspace'},{id:entities.a.id,role:'unverified-account'}],viewports:checks,captures:captures.length},null,2));
console.log(JSON.stringify({result:'pass',captures:captures.length,viewports:checks}));
`;
execFileSync('ego-browser',['nodejs'],{cwd:root,input:'const ROOT='+JSON.stringify(root)+';\n'+script,stdio:['pipe','inherit','inherit'],timeout:240000});
