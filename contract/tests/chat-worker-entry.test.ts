import { expect,it } from "vitest";
import { chatCommitReceiptSchema,chatToolApprovalReceiptSchema,workerPortInputSchemas } from "../src/internal/execution-worker";
it("聊天授权只接受已结算模型与工具调用ID，不接受Worker输入或授权断言",()=>{
 const ids={modelCallId:"model",toolCallId:"tool"};
 expect(workerPortInputSchemas.checkChatToolApproval.parse(ids)).toEqual(ids);
 for(const extra of [{input:{query:"伪造"}},{approved:true},{userId:"other"}])expect(workerPortInputSchemas.checkChatToolApproval.safeParse({...ids,...extra}).success).toBe(false);
});
it("拒绝必须携带原因，待确认与不可用不会被解析成允许",()=>{
 for(const status of ["not-applicable","user-approval","unavailable"])expect(chatToolApprovalReceiptSchema.parse({status})).toEqual({status});
 expect(chatToolApprovalReceiptSchema.safeParse({status:"denied"}).success).toBe(false);
 expect(chatToolApprovalReceiptSchema.parse({status:"denied",reason:"已拒绝"})).toEqual({status:"denied",reason:"已拒绝"});
});
it("聊天提交回执必须同时标识消息和结果且成功与部分完成分开",()=>{
 const receipt={resultId:"r",aiTaskId:"a",messageId:"m",outcome:"partial"};
 expect(chatCommitReceiptSchema.parse(receipt)).toEqual(receipt);
 expect(chatCommitReceiptSchema.safeParse({...receipt,messageId:""}).success).toBe(false);
 expect(chatCommitReceiptSchema.safeParse({...receipt,outcome:"failed"}).success).toBe(false);
});
