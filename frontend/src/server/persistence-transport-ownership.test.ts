import {expect,it,vi} from "vitest";
import type {Endpoint} from "@creatoros/contract";
import {UnsupportedOperationError} from "@creatoros/backend";
const mock=vi.hoisted(()=>({request:vi.fn(async()=>({data:{id:"invented"},meta:{requestId:"mock"}}))}));
vi.mock("@/server/mock-backend/mock-transport",()=>({mockTransport:mock}));
import {compositeTransport} from "./persistence-client";
it("未登记实际属主的操作明确拒绝，不调用模拟transport返回假成功",async()=>{
 const endpoint={id:"t915.unregistered",isList:false} as Endpoint;
 await expect(compositeTransport.request(endpoint,{params:undefined,query:undefined,body:undefined}, {userId:"actual-user",requestId:"test",source:"user"})).rejects.toBeInstanceOf(UnsupportedOperationError);
 expect(mock.request).not.toHaveBeenCalled();
});
