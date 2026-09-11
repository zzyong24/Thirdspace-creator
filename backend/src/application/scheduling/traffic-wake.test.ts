import {describe,it,expect,vi} from 'vitest';
import {recoverTrafficQueues} from './traffic-wake';
const ctx={userId:'u',accountId:null,requestId:'r',source:'ingestion' as const};
describe('流量持久队列补偿唤醒',()=>{
 it('上一轮完成空窗留下pending，下一次轮询按原账号唤醒',async()=>{
  const start=vi.fn(async()=>{});
  const ports={listJobs:vi.fn(async()=>({rows:[{id:'j',accountId:'a'}],total:1})),listRuns:vi.fn(async()=>({rows:[{status:'running'}]})),hasPending:vi.fn(async()=>true),start,shouldStop:()=>false};
  await recoverTrafficQueues(ctx,ports);expect(start).not.toHaveBeenCalled();
  ports.listRuns.mockResolvedValue({rows:[{status:'succeeded'}]});
  await recoverTrafficQueues(ctx,ports);expect(start).toHaveBeenCalledWith({...ctx,accountId:'a'});
 });
 it.each(['failed','needs_reconnect','cancelled'])('不自动重启%s原任务',async status=>{
  const start=vi.fn(async()=>{});await recoverTrafficQueues(ctx,{listJobs:async()=>({rows:[{id:'j',accountId:'a'}],total:1}),listRuns:async()=>({rows:[{status}]}),hasPending:async()=>true,start,shouldStop:()=>false});expect(start).not.toHaveBeenCalled();
 });
 it('首次入队后进程在trigger前退出，重启从持久job唤醒',async()=>{
  const start=vi.fn(async()=>{});await recoverTrafficQueues(ctx,{listJobs:async()=>({rows:[{id:'j',accountId:'a'}],total:1}),listRuns:async()=>({rows:[]}),hasPending:async()=>true,start,shouldStop:()=>false});expect(start).toHaveBeenCalledOnce();
 });
});
