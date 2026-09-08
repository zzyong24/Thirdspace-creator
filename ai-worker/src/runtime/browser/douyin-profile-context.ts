import {mkdir} from 'node:fs/promises';
import {guardedLaunch,chromiumSandboxOpts,type GuardedLaunchOptions} from './chromium-guard';
import {launchWithBrowser} from './browser-launch';

/** 调用者必须已持有同一规范账号目录的跨进程租约；不会自行取得用户授权。 */
export function openDouyinProfileContext(authDir:string,headless:boolean,options:Pick<GuardedLaunchOptions,'signal'|'onStopped'>={}){
 return guardedLaunch(authDir,async()=>{
  const {chromium}=await import('@playwright/test');
  options.signal?.throwIfAborted();
  await mkdir(authDir,{recursive:true});
  options.signal?.throwIfAborted();
  return launchWithBrowser(selection=>chromium.launchPersistentContext(authDir,{
   headless,...selection,...chromiumSandboxOpts(),viewport:{width:1440,height:900},acceptDownloads:true,
   args:['--disable-blink-features=AutomationControlled','--no-proxy-server'],
  }));
 },{...options,label:'抖音浏览器窗口'});
}
