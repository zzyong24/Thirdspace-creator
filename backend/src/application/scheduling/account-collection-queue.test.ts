import {expect,it} from 'vitest';
import {createAccountCollectionQueue} from './account-collection-queue';
const context=(userId:string,accountId:string)=>({userId,accountId,requestId:'queue-test',source:'user' as const});
it('不同属主并行，同账号等待取消不会让后继越过仍运行的前驱',async()=>{
 const queue=createAccountCollectionQueue(),abort=new AbortController(),seen:string[]=[];
 let release!:()=>void;const gate=new Promise<void>(r=>{release=r;});
 const a=queue(context('u','a'),async()=>{seen.push('a');await gate;});
 const skipped=queue(context('u','a'),async()=>{seen.push('skipped');},abort.signal);
 const after=queue(context('u','a'),async()=>{seen.push('after');});
 await queue(context('u','b'),async()=>{seen.push('b');});
 await queue(context('other-user','a'),async()=>{seen.push('other-owner');});
 abort.abort();await expect(skipped).rejects.toThrow();
 expect(seen).toEqual(['a','b','other-owner']);release();await Promise.all([a,after]);
 expect(seen).toEqual(['a','b','other-owner','after']);
});
it('缺失账号不得并入空账号队列',()=>{
 expect(()=>createAccountCollectionQueue()({...context('u','a'),accountId:undefined},async()=>{})).toThrow();
});

it('同账号前驱失败仍继续后继真实采集',async()=>{
 const queue=createAccountCollectionQueue(),ctx=context('u','a'),seen:string[]=[];
 const first=queue(ctx,async()=>{throw new Error('前驱采集失败');});
 const next=queue(ctx,async()=>{seen.push('next');});
 await expect(first).rejects.toThrow('前驱采集失败');await next;expect(seen).toEqual(['next']);
});

it('已开始采集收到取消时，必须等其真实退出才释放返回值和后继',async()=>{
 const queue=createAccountCollectionQueue(),ctx=context('u','a'),abort=new AbortController();
 let release!:()=>void,started=false,settled=false,nextStarted=false;
 const gate=new Promise<void>(resolve=>{release=resolve;});
 const running=queue(ctx,async()=>{started=true;await gate;abort.signal.throwIfAborted();},abort.signal).then(()=>{settled=true;},()=>{settled=true;});
 const next=queue(ctx,async()=>{nextStarted=true;});
 try{
  await Promise.resolve();expect(started).toBe(true);abort.abort();
  await Promise.resolve();await Promise.resolve();
  expect(settled).toBe(false);expect(nextStarted).toBe(false);
 }finally{release();await Promise.all([running,next]);}
 expect(settled).toBe(true);expect(nextStarted).toBe(true);
});

it('账号组级作业（内容雷达同步无单一账号）按账号组串行，不再因缺账号整单失败（月明 2026-11-10 内容雷达每次 AccountRequiredError）',async()=>{
 const queue=createAccountCollectionQueue(),seen:string[]=[];
 const group={userId:'u',accountId:null,groupId:'g1',requestId:'queue-test',source:'ingestion' as const};
 let release!:()=>void;const gate=new Promise<void>(r=>{release=r;});
 const first=queue(group,async()=>{seen.push('g1-first');await gate;});
 const second=queue(group,async()=>{seen.push('g1-second');});
 // 同 id 的账号队列与账号组队列互不阻塞。
 await queue({...group,accountId:'g1',groupId:null},async()=>{seen.push('account-g1');});
 expect(seen).toEqual(['g1-first','account-g1']);
 release();await Promise.all([first,second]);
 expect(seen).toEqual(['g1-first','account-g1','g1-second']);
});
