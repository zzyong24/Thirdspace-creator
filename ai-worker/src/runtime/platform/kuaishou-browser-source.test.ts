import {expect,it,vi} from 'vitest';
import {mkdtemp,stat,rm} from 'node:fs/promises';
import path from 'node:path';import os from 'node:os';
const h=vi.hoisted(()=>({options:null as any,context:null as any}));
// 仅替换Chromium执行端口；测真实source如何把取消和停止证明交给guard，不冒充扫码。
vi.mock('../browser/chromium-guard',()=>({chromiumSandboxOpts:()=>({}),guardedLaunch:vi.fn(async(_dir:any,_launch:any,options:any)=>{h.options=options;if(h.context)return h.context;await options.onStopped?.();throw Error('fixture launch stopped');})}));
import {loginKuaishouCreator} from './kuaishou-browser-source';
it('T1069 取消与真实停止证明传给原guard，启动前失败不在guard外创建目录',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'creator-source-')),directory=path.join(root,'profile'),controller=new AbortController(),onStopped=vi.fn(async()=>{});controller.abort(Error('user cancelled'));
 try{await expect((loginKuaishouCreator as any)(directory,{signal:controller.signal,onStopped})).rejects.toThrow('fixture launch stopped');expect(h.options.signal).toBe(controller.signal);expect(onStopped).toHaveBeenCalledOnce();expect(await stat(directory).catch(()=>null)).toBeNull();}finally{await rm(root,{recursive:true,force:true});}
});

it('T1069 浏览器关闭失败保留原停止重试，不假报释放成功',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'creator-close-')),directory=path.join(root,'profile'),onStopped=vi.fn(async()=>{});let retry!:()=>Promise<void>;
 const close=vi.fn().mockRejectedValueOnce(Error('fixture close unconfirmed')).mockImplementation(async()=>onStopped());const onStopUnconfirmed=vi.fn((value:()=>Promise<void>)=>{retry=value;});
 h.context={on:()=>{},off:()=>{},pages:()=>[{goto:async()=>{throw Error('fixture navigation failed');}}],close};
 try{await expect((loginKuaishouCreator as any)(directory,{onStopped,onStopUnconfirmed})).rejects.toThrow('fixture close unconfirmed');expect(onStopped).not.toHaveBeenCalled();expect(onStopUnconfirmed).toHaveBeenCalledOnce();await retry();expect(close).toHaveBeenCalledTimes(2);expect(onStopped).toHaveBeenCalledOnce();}finally{h.context=null;await rm(root,{recursive:true,force:true});}
});
