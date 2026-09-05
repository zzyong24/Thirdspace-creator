import {expect,it,vi} from "vitest";
const f=vi.hoisted(()=>({session:null as null|{ctx:{userId:string;accountId:string;requestId:string;source:"user"}},request:vi.fn(async(..._args:unknown[])=>({data:[],meta:{requestId:"real",total:0,page:1,pageSize:20}}))}));
vi.mock("@/server/persistence-client",()=>({compositeTransport:{request:f.request}}));
vi.mock("@/lib/session.server",()=>({resolveSession:async()=>f.session}));
import {client} from "./contract-client.server";
it("兼容client每次使用实际请求身份与账号，不固定在默认用户",async()=>{
 f.session={ctx:{userId:"user-a",accountId:"account-a",requestId:"a",source:"user"}};
 await client.listProjects({params:undefined,query:{page:1,pageSize:20},body:undefined});
 expect(f.request.mock.calls.at(-1)?.[2]).toEqual(f.session.ctx);
 f.session={ctx:{userId:"user-b",accountId:"account-b",requestId:"b",source:"user"}};
 await client.listProjects({params:undefined,query:{page:1,pageSize:20},body:undefined});
 expect(f.request.mock.calls.at(-1)?.[2]).toEqual(f.session.ctx);
 f.session=null;const before=f.request.mock.calls.length;
 await expect(client.listProjects({params:undefined,query:{page:1,pageSize:20},body:undefined})).rejects.toMatchObject({name:"AuthenticationError"});
 expect(f.request).toHaveBeenCalledTimes(before);
});
