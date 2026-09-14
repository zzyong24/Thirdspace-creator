import {it,expect} from 'vitest';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createRequire} from 'node:module';
import {createDesktopHostProcessRecovery,readHostProcessSnapshot,type HostProcessRecord} from './host-browser-process-recovery';

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
