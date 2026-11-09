import {it,expect} from 'vitest';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createRequire} from 'node:module';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {createDesktopHostProcessRecovery,readHostProcessSnapshot,type HostProcessRecord} from './host-browser-process-recovery';

it.skipIf(!['darwin','linux'].includes(process.platform))('T1444 真实OS核对被Next标题覆盖的其它Node网站，不将其当产品宿主',async()=>{
 const child=spawn(process.execPath,['-e',"process.title='next-server (v16.2.9)';process.send('ready');setInterval(()=>{},1000)"],{stdio:['ignore','ignore','ignore','ipc']});
 try{
  await once(child,'message');
  const row=(await readHostProcessSnapshot()).find(row=>row.pid===child.pid);
  expect(row?.executable).toMatch(/^next-server/);
  expect(row?.executablePath).toBeTruthy();
  const self:HostProcessRecord={pid:2147480000,started:'isolated',executable:'/isolated/creatoros-server',command:'isolated'};
  const recovery=createDesktopHostProcessRecovery({pid:self.pid,desktop:true,snapshot:async()=>[self,row!]});
  expect(await recovery.isPreviousHostStopped({hostInstanceId:'stopped-old-host',authDir:'/tmp/t1444-unused-profile'})).toMatchObject({stopped:true});
 }finally{const exited=once(child,'exit');child.kill();await exited;}
},120000);

it.skipIf(process.platform!=='darwin')('真实临时Chromium完整档案参数可识别，正常关闭后该档案不再占用（宿主列表隔离）',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'creatoros-t985-profile-'));
 const profile=join(directory,'中文 有空格');
 const {chromium}=createRequire(new URL('../../../../ai-worker/package.json',import.meta.url))('@playwright/test');
 let context:any;
 const self:HostProcessRecord={pid:2147480000,started:'isolated',executable:'/isolated/creatoros-server',command:'isolated'};
 // 只纳入本测试创建的临时档案进程；不会操作用户浏览器或把隔离宿主冒充安装版验收。
 const recovery=createDesktopHostProcessRecovery({pid:self.pid,desktop:true,platform:'darwin',snapshot:async()=>[self,...(await readHostProcessSnapshot()).filter(row=>row.command?.includes(directory))]});
 try{
  context=await chromium.launchPersistentContext(profile,{channel:'chrome',headless:true});
  await expect.poll(async()=>recovery.isPreviousHostStopped({hostInstanceId:'isolated-old',authDir:profile}),{timeout:5000}).toMatchObject({stopped:false,reason:'profile-browser-running'});
  await context.close();context=undefined;
  await expect.poll(async()=>recovery.isPreviousHostStopped({hostInstanceId:'isolated-old',authDir:profile}),{timeout:5000}).toMatchObject({stopped:true});
 }finally{await context?.close();await rm(directory,{recursive:true,force:true});}
},20000);

it.skipIf(process.platform!=='darwin')('T1444 真实Chrome末尾档案加页面：保护含空格目标并排除不同档案',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'t1444-chrome-args-')),profile=join(directory,'中文 有空格');
 const child=spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',['--headless=new','--no-sandbox','--disable-gpu',`--user-data-dir=${profile}`,'about:blank'],{stdio:'ignore'});
 const exited=once(child,'exit');
 try{
  let row:HostProcessRecord|undefined;
  await expect.poll(async()=>{row=(await readHostProcessSnapshot()).find(r=>r.pid===child.pid);return row?.command?.includes(`--user-data-dir=${profile} about:blank`);},{timeout:5000}).toBe(true);
  const self:HostProcessRecord={pid:2147480000,started:'isolated',executable:'/isolated/creatoros-server',command:'isolated'};
  const recovery=createDesktopHostProcessRecovery({pid:self.pid,desktop:true,platform:'darwin',snapshot:async()=>[self,row!]});
  expect(await recovery.isPreviousHostStopped({hostInstanceId:'stopped-old-host',authDir:profile})).toMatchObject({stopped:false});
  expect(await recovery.isPreviousHostStopped({hostInstanceId:'stopped-old-host',authDir:join(directory,'other-profile')})).toMatchObject({stopped:true});
 }finally{if(child.exitCode===null)child.kill();await exited;await rm(directory,{recursive:true,force:true});}
},20000);
