import { afterAll, beforeAll, expect, it } from 'vitest';
import { createDb, type Db } from '@creatoros/backend';
import { createHostBrowserProfileLifecycle } from './host-browser-profile-lifecycle';
let db:Db,close:()=>Promise<void>;
beforeAll(async()=>{const f=await createDb();db=f.db;close=()=>f.client.close();});
afterAll(async()=>close?.());
const lifecycle=(key:string)=>createHostBrowserProfileLifecycle(db,{resolveProfile:async()=>({userId:'u',authDir:`/test/${key}`,profileKey:key.repeat(64)}),waitTimeoutMs:500,pollIntervalMs:10});
it('并发采集等待当前真实停止，不把短暂占用立即记为失败',async()=>{
 const host=lifecycle('a');const first=await host.acquire('/test/a');let admitted=false;
 const pending=host.acquire('/test/a').then(x=>{admitted=true;return x;});
 void pending.catch(()=>{});
 await new Promise(r=>setTimeout(r,30));expect(admitted).toBe(false);
 await first.onStopped();const next=await pending;expect(admitted).toBe(true);await next.onStopped();
});
it('排队可以取消，不能释放原持有者，后续操作仍能恢复',async()=>{
 const host=lifecycle('b');const first=await host.acquire('/test/b');const controller=new AbortController();
 const pending=host.acquire('/test/b',controller.signal);const rejected=expect(pending).rejects.toMatchObject({name:'AbortError'});
 setTimeout(()=>controller.abort(new Error('用户取消')),20);await rejected;
 await first.onStopped();const next=await host.acquire('/test/b');await next.onStopped();
});
it('实际持有者一直运行则有界结束，不用时间推断停止',async()=>{
 const host=lifecycle('c');const first=await host.acquire('/test/c');
 await expect(host.acquire('/test/c')).rejects.toMatchObject({code:'BROWSER_PROFILE_BUSY'});
 await first.onStopped();const next=await host.acquire('/test/c');await next.onStopped();
});
it('采集公共浏览器生命周期：关闭失败保持占用，真实关闭后下一次采集继续',async()=>{
 const {guardedLaunch}=await import('@creatoros/ai-worker/browser/chromium-guard');
 const host=lifecycle('d');let stopFails=true;
 const resource=await host.acquire('/test/d');
 const browser=await guardedLaunch(resource.authDir,async()=>({close:async()=>{if(stopFails)throw new Error('关闭失败');}}),{onStopped:resource.onStopped},{listProfileProcesses:async()=>[],removeFile:async()=>{}});
 await expect(browser.close()).rejects.toThrow('关闭失败');
 await expect(host.acquire('/test/d')).rejects.toMatchObject({code:'BROWSER_PROFILE_BUSY'});
 stopFails=false;await browser.close();
 const next=await host.acquire('/test/d');await next.onStopped();
});
it('另一宿主的租约也仅在原owner真实释放后排队继续',async()=>{
 const host=lifecycle('e'),other=lifecycle('e');const first=await host.acquire('/test/e');
 const nextPromise=other.acquire('/test/e');setTimeout(()=>void first.onStopped(),20);
 const next=await nextPromise;await next.onStopped();
});
