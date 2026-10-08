import { afterAll, beforeAll, expect, it, vi } from 'vitest';
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
 await expectBusy(()=>host.acquire('/test/c'));
 await first.onStopped();const next=await host.acquire('/test/c');await next.onStopped();
});
it('采集公共浏览器生命周期：关闭失败保持占用，真实关闭后下一次采集继续',async()=>{
 const {guardedLaunch}=await import('@creatoros/ai-worker/browser/chromium-guard');
 const host=lifecycle('d');let stopFails=true;
 const resource=await host.acquire('/test/d');
 const browser=await guardedLaunch(resource.authDir,async()=>({close:async()=>{if(stopFails)throw new Error('关闭失败');}}),{onStopped:resource.onStopped},{listProfileProcesses:async()=>[],removeFile:async()=>{}});
 await expect(browser.close()).rejects.toThrow('关闭失败');
 await expectBusy(()=>host.acquire('/test/d'));
 stopFails=false;await browser.close();
 const next=await host.acquire('/test/d');await next.onStopped();
});
it('另一宿主的租约也仅在原owner真实释放后排队继续',async()=>{
 const host=lifecycle('e'),other=lifecycle('e');const first=await host.acquire('/test/e');
 const nextPromise=other.acquire('/test/e');setTimeout(()=>void first.onStopped(),20);
 const next=await nextPromise;await next.onStopped();
});
it('跨启动旧宿主停止证明允许续跑，当前宿主仍持有时不回收',async()=>{
 const key='f',first=lifecycle(key);await first.acquire('/test/f');
 const checks:string[]=[];
 const next=createHostBrowserProfileLifecycle(db,{resolveProfile:async()=>({userId:'u',authDir:'/test/f',profileKey:key.repeat(64)}),hostInstanceId:'new-host',waitTimeoutMs:30,pollIntervalMs:5,recovery:{createHostInstanceId:async()=> 'new-host',isPreviousHostStopped:async i=>{checks.push(i.hostInstanceId);return {stopped:true,reason:'test-stopped'};}}});
 const recovered=await next.acquire('/test/f');expect(checks).toHaveLength(1);
 await expectBusy(()=>next.acquire('/test/f'));expect(checks).toHaveLength(1);
 await recovered.onStopped();
});
it('跨启动无法证明停止仍保留原租约及原owner释放能力',async()=>{
 const key='9',first=lifecycle(key),held=await first.acquire('/test/9');
 const next=createHostBrowserProfileLifecycle(db,{resolveProfile:async()=>({userId:'u',authDir:'/test/9',profileKey:key.repeat(64)}),hostInstanceId:'unknown-host',waitTimeoutMs:30,pollIntervalMs:5,recovery:{createHostInstanceId:async()=> 'unknown-host',isPreviousHostStopped:async()=>({stopped:false,reason:'process-query-unavailable'})}});
 await expectBusy(()=>next.acquire('/test/9'));await held.onStopped();
 const recovered=await next.acquire('/test/9');await recovered.onStopped();
});
it('绑定提交回执持有目录直到DB完成，release后其他使用者才能进入',async()=>{
 const host=lifecycle('7');const reservation=await host.reserveProfiles(['/test/7']);let admitted=false;
 const pending=host.acquire('/test/7').then(r=>{admitted=true;return r;});await new Promise(r=>setTimeout(r,25));expect(admitted).toBe(false);
 await reservation.release();await reservation.release();const next=await pending;expect(admitted).toBe(true);await next.onStopped();
});

/** 只推进策略墙钟，不模拟真实宿主停止；DB协议和原owner释放仍实跑。 */
async function expectBusy(run:()=>Promise<unknown>){
 const realNow=Date.now.bind(Date);let offset=0;
 const clock=vi.spyOn(Date,'now').mockImplementation(()=>realNow()+offset);
 const waiting=run();const move=setTimeout(()=>{offset=120_001;},20);
 try{await expect(waiting).rejects.toMatchObject({code:'BROWSER_PROFILE_BUSY'});}finally{clearTimeout(move);clock.mockRestore();}
}
