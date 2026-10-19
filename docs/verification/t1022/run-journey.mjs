import {execFileSync} from 'node:child_process';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../../..');
const cli=process.env.T1022_EGO_CLI||'/Users/zyongzhu/.local/bin/ego-browser';
// 只续用此任务的受控浏览器和隔离服务；没有建库、SQL种数或外部发布。
const script=String.raw`
const fs=await import('node:fs/promises');
const child=await import('node:child_process');
const t=await taskSpace(3),p=t.page('p1');
const base='http://127.0.0.1:8788';
const main='账号组验收 · 主品牌',other='账号组验收 · 副品牌',empty='账号组验收 · 无账号空组';
const mainId='grp-8d773d5d-39',project='project-d7b00638-13';
const captures=[],checks=[];
function assert(ok,message){if(!ok)throw Error(message);}
async function capture(checkpoint,check_ids,viewport){captures.push({checkpoint,check_ids,viewport,url:await p.url(),text:await p.evaluate(()=>document.body.innerText)});}
async function switchTo(name){await p.waitForFunction(()=>document.querySelector('[data-testid="account-switcher"]')?.getAttribute('data-state')==='ready');const label=await p.evaluate(()=>document.querySelector('button[aria-label^="当前账号组："]')?.getAttribute('aria-label'));assert(label,'组选择入口缺失');if(label==='当前账号组：'+name)return;await p.click('loc=role:button[name="'+label+'"]');await p.waitForFunction(()=>!!document.querySelector('[data-testid="account-switcher-menu"]'));await p.click('loc=role:menuitem[name="'+name+'"]');await p.waitForFunction(n=>document.querySelector('button[aria-label^="当前账号组："]')?.getAttribute('aria-label')==='当前账号组：'+n,name);}
async function dispatch(id,input){const r=await p.fetch('/api/v1/dispatch',{method:'POST',headers:{'Content-Type':'application/json','x-group-id':mainId},body:JSON.stringify({id,input})});assert(r.status===200,'公开操作失败 '+id+' '+r.status);return JSON.parse(r.body).data;}
for(const viewport of [{width:1366,height:900},{width:1024,height:768}]){
 await p.cdp('Emulation.setDeviceMetricsOverride',{...viewport,deviceScaleFactor:1,mobile:false});
 await p.goto(base+'/accounts');await switchTo(main);await p.goto(base+'/accounts');
 await p.waitForFunction(n=>document.querySelector('#group-name')?.value===n,main);
 const current=await dispatch('accountGroups.get',{params:{groupId:mainId}});assert(current.name===main,'隔离见证组名不一致，停止写入');
 await p.fill('#group-name',main+' · 保存回读');
 // 第二个公开客户端并发提交同名版本，构造真实版本冲突，非替换网络结果。
 await dispatch('accountGroups.update',{params:{groupId:mainId},body:{name:main,expectedVersion:current.version}});
 await p.click('loc=role:button[name="保存名称"]');await p.waitForFunction(()=>!!document.querySelector('[role="alert"]'));
 assert(await p.evaluate(n=>document.querySelector('#group-name')?.value===n,main+' · 保存回读'),'冲突后输入被丢失');
 await capture('版本冲突保留输入',['conflict'],viewport);
 await p.reload();await p.waitForFunction(n=>document.querySelector('#group-name')?.value===n,main);
 await p.fill('#group-name',main+' · 保存回读');await p.click('loc=role:button[name="保存名称"]');await p.waitForFunction(()=>document.body.innerText.includes('名称已保存。'));
 await p.reload();await p.waitForFunction(n=>document.querySelector('#group-name')?.value===n,main+' · 保存回读');
 await capture('组名保存重新读取',['write-read'],viewport);
 await p.fill('#group-name',main);await p.click('loc=role:button[name="保存名称"]');await p.waitForFunction(()=>document.body.innerText.includes('名称已保存。'));
 await p.goto(base+'/projects');await p.waitForFunction(()=>document.body.innerText.includes('账号组验收 · 多平台内容'));
 assert(!(await p.evaluate(()=>document.body.innerText)).includes('副品牌独立项目'),'主组泄漏副组项目');
 await capture('主组项目集合',['collection','selection'],viewport);
 await p.goto(base+'/projects/'+project);await p.waitForFunction(()=>!!document.querySelector('[data-page="draft-workbench"]')||document.body.innerText.includes('账号组验收 · 多平台内容'));
 await capture('主组项目详情',['detail'],viewport);
 await switchTo(other);await p.waitForFunction(()=>document.body.innerText.includes('未找到该项目'));
 assert(!(await p.evaluate(()=>!!document.querySelector('[data-page="draft-workbench"]'))),'切组后旧详情仍可见');
 await capture('切组清除旧详情',['collection','selection','detail','ownership'],viewport);
 await p.click('loc=role:link[name="回项目列表"]');await p.waitForFunction(()=>document.body.innerText.includes('副品牌独立项目'));
 assert(!(await p.evaluate(()=>document.body.innerText)).includes('账号组验收 · 多平台内容'),'副组仍有旧项目');
 await p.reload();await p.waitForFunction(()=>document.body.innerText.includes('副品牌独立项目'));await capture('返回与刷新保持副组',['ownership'],viewport);
 await switchTo(empty);await p.goto(base+'/?startDate=2026-09-28&endDate=2026-10-04');await p.waitForFunction(()=>document.body.innerText.includes('还没有进行中的项目'));
 assert(await p.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),'页面整页横向溢出');
 await capture('空组保留创建入口与真实空指标',['empty'],viewport);
 await p.click('loc=role:link[name="＋ 新建项目"]');await p.waitForFunction(()=>!!document.querySelector('[role="dialog"]'));
 await p.keyboard.press('Escape');await p.waitForFunction(()=>!document.querySelector('[role="dialog"]'));
 assert(await p.evaluate(()=>document.activeElement?.textContent?.includes('新建项目')),'关闭弹层后焦点未返回入口');
 await capture('无账号创建弹层关闭与焦点',['empty'],viewport);
 await switchTo(main);await p.goto(base+'/?startDate=2026-09-28&endDate=2026-10-04');
 await p.click('loc=role:button[name="小红书"]');await p.waitForFunction(()=>document.querySelector('[aria-label="平台筛选"] button[aria-pressed="true"]')?.textContent==='小红书');
 assert(await p.evaluate(()=>document.body.innerText.includes('账号组验收 · 多平台内容')),'平台筛选丢失共享创作项目');
 await capture('平台筛选保持共享创作上下文',['shared-context'],viewport);
}
await p.cdp('Emulation.setDeviceMetricsOverride',{width:1366,height:900,deviceScaleFactor:1,mobile:false});
await p.goto(base+'/?startDate=2026-09-28&endDate=2026-10-04');
const commit_sha=child.execFileSync('git',['rev-parse','HEAD'],{cwd:ROOT,encoding:'utf8'}).trim();
await fs.writeFile(ROOT+'/docs/verification/t1022/visible-copy-current.json',JSON.stringify({schema:'frontend-visible-copy/v1',task_id:'T-1022',commit_sha,captures},null,2)+'\n');
console.log(JSON.stringify({observed_at:new Date().toISOString(),surface:'browser',runtime:'Ego Chromium + Next.js 隔离服务',mode:'non-fixture',witnesses:[{id:mainId,role:'source-workspace'},{id:'grp-d7b00638-247',role:'other-workspace'},{id:project,role:'created-project'}],viewports:[{width:1366,height:900},{width:1024,height:768}],checks:['collection','selection','detail','ownership','empty','write-read','conflict','shared-context'],captures:captures.length,result:'pass'}));
`;
execFileSync(cli,['nodejs'],{cwd:root,input:`const ROOT=${JSON.stringify(root)};\n${script}`,stdio:['pipe','inherit','inherit'],timeout:240000});
