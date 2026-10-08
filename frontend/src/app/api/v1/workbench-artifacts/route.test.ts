import {beforeEach,expect,it,vi} from "vitest";

const mocks=vi.hoisted(()=>({trusted:true,resolve:vi.fn(),list:vi.fn(),reconcile:vi.fn()}));
vi.mock("@/lib/loopback-guard.server",()=>({isTrustedLocalRequest:()=>mocks.trusted,loopbackForbidden:()=>Response.json({error:"forbidden"},{status:403})}));
vi.mock("@/lib/request-context.server",()=>({readRequestAccountId:(req:Request)=>req.headers.get("x-account-id"),resolveRequestContext:mocks.resolve,
 isAuthError:(error:{name?:string})=>error?.name==="AuthenticationError",isOwnershipError:(error:{name?:string})=>error?.name==="OwnershipError"}));
vi.mock("@/app/api/v1/auth/_session",()=>({readSessionCookie:()=>"session"}));
vi.mock("@/server/persistence-client",()=>({getWorkbenchPreviewRuntime:async()=>({listConversation:mocks.list}),getWorkbenchArtifactRecoveryRuntime:async()=>({reconcile:mocks.reconcile})}));
import {GET,POST} from "./route";

beforeEach(()=>{vi.clearAllMocks();mocks.trusted=true;mocks.resolve.mockResolvedValue({userId:"user",accountId:"account"});mocks.list.mockResolvedValue({items:[],lineages:[]});mocks.reconcile.mockResolvedValue({artifactId:"wa",status:"committed",lastErrorCode:null});});
const request=(method="GET",body?:unknown)=>new Request("http://localhost:3000/api/v1/workbench-artifacts?conversationId=conv-1&limit=50",{method,headers:{origin:"http://localhost:3000","x-account-id":"account","content-type":"application/json"},...(body===undefined?{}:{body:JSON.stringify(body)})});

it("列表只把认证账号和会话传给正式只读服务",async()=>{
 expect((await GET(request())).status).toBe(200);expect(mocks.list).toHaveBeenCalledWith({userId:"user",accountId:"account"},"conv-1",{limit:50});
});

it("重新核对复用原 operationId，非法来源和参数不会入队",async()=>{
 const response=await POST(request("POST",{conversationId:"conv-1",operationId:"op-original"}));expect(response.status).toBe(200);
 expect(mocks.reconcile).toHaveBeenCalledWith({userId:"user",accountId:"account"},"conv-1","op-original");
 mocks.trusted=false;expect((await POST(request("POST",{conversationId:"conv-1",operationId:"op-original"}))).status).toBe(403);
 mocks.trusted=true;expect((await POST(request("POST",{conversationId:"../bad",operationId:"op"}))).status).toBe(400);
 expect(mocks.reconcile).toHaveBeenCalledTimes(1);
});
