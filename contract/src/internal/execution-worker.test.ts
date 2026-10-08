import { expect, it } from 'vitest';
import { hostMessageSchema, workerMessageSchema, workerCallRequestId } from './execution-worker';
const execution={executionTaskId:'synthetic',attempt:1,fenceToken:'owned'};
const envelope={version:1,requestId:'one'};
it('旧私有运行和回复协议仍可解析，新协议仅追加协商字段与消费确认',()=>{
  expect(hostMessageSchema.parse({...envelope,type:'run',execution,deadlineAt:null})).not.toHaveProperty('receiptProtocol');
  expect(hostMessageSchema.parse({...envelope,type:'reply',ok:true,data:{}})).not.toHaveProperty('callSeq');
  expect(workerMessageSchema.parse({...envelope,type:'call',execution,port:'heartbeat',data:{}})).not.toHaveProperty('callSeq');
  expect(workerMessageSchema.parse({...envelope,type:'consumed',execution,throughSeq:0,consumedRanges:[{fromSeq:2,toSeq:100}]})).toHaveProperty('consumedRanges');
});
it.each([0,-1,1.5,Number.MAX_SAFE_INTEGER+1])('私有调用序列拒绝非有效正整数 %s',callSeq=>{
  expect(workerMessageSchema.safeParse({...envelope,type:'call',execution,port:'heartbeat',data:{},callSeq}).success).toBe(false);
});
it('消费确认拒绝倒置区间和未知协议，保留 continuous 的 null deadline',()=>{
  expect(workerMessageSchema.safeParse({...envelope,type:'consumed',execution,throughSeq:0,consumedRanges:[{fromSeq:4,toSeq:3}]}).success).toBe(false);
  expect(hostMessageSchema.safeParse({...envelope,type:'run',execution,deadlineAt:null,receiptProtocol:'unknown'}).success).toBe(false);
  expect(hostMessageSchema.parse({...envelope,type:'run',execution,deadlineAt:null,receiptProtocol:'consumed-v1'})).toHaveProperty('deadlineAt',null);
});
it('请求身份绑定任务、attempt、fence 和调用序列，改序列不能冒用旧 ID',()=>{
  expect(workerCallRequestId(execution,1)).not.toBe(workerCallRequestId(execution,2));
  expect(workerCallRequestId(execution,1)).not.toBe(workerCallRequestId({...execution,fenceToken:'stale'},1));
  expect(workerCallRequestId(execution,1)).toBe(workerCallRequestId({...execution},1));
});
