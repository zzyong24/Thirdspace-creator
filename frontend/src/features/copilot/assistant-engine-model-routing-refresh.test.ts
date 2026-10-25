import {beforeEach,it,expect,vi} from 'vitest';
const io=vi.hoisted(()=>({getModelRouting:vi.fn()}));
vi.mock('@/lib/contract-client',()=>({client:io}));
const resource=(revision=1)=>({schemaVersion:1,revision,choices:null,legacyExecutionEngine:'pi',effectiveChoices:{text:'self',vision:'self',image:'self',video:'self',audio:'local',embed:'self'},capabilities:[]});
beforeEach(()=>{vi.resetModules();io.getModelRouting.mockReset();localStorage.clear();});
it('升级屏障不能join旧GET冒成功，旧读后发一条新GET并返回真结果',async()=>{
 let release!:(v:unknown)=>void;
 io.getModelRouting.mockImplementationOnce(()=>new Promise(r=>{release=r})).mockResolvedValue(resource(2));
 const module=await import('./assistant-engine'),old=module.loadModelRouting(true);
 const fresh=module.refreshModelRoutingAfterUpgrade(new AbortController().signal);
 expect(io.getModelRouting).toHaveBeenCalledTimes(1);release(resource());await old;await fresh;
 expect(io.getModelRouting).toHaveBeenCalledTimes(2);expect(module.readModelRoutingPreference().resource?.revision).toBe(2);
});
it('新GET失败明确reject，不吞失败或写偏好',async()=>{
 io.getModelRouting.mockRejectedValue(Error('controlled GET failure'));
 const module=await import('./assistant-engine');await expect(module.refreshModelRoutingAfterUpgrade(new AbortController().signal)).rejects.toThrow();
 expect(module.readModelRoutingPreference().error).toBeTruthy();
});
it('父取消结束旧GET观察，不启动新GET；旧读可收尾',async()=>{
 let release!:(v:unknown)=>void;io.getModelRouting.mockImplementation(()=>new Promise(r=>{release=r}));
 const module=await import('./assistant-engine'),old=module.loadModelRouting(true),controller=new AbortController();
 const pending=module.refreshModelRoutingAfterUpgrade(controller.signal);controller.abort();
 await expect(pending).rejects.toMatchObject({name:'AbortError'});release(resource());await old;
 expect(io.getModelRouting).toHaveBeenCalledTimes(1);
});
