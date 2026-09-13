import { beforeAll, describe, expect, it } from "vitest";
import { createDb, OwnershipError } from "@creatoros/backend";
import { ENDPOINTS, type RequestContext } from "@creatoros/contract";
import { createPlatformAccountService } from "../platform-account";
import { createOnboardingState } from "./onboarding-state";
import { createSettingsTransport } from "./settings.transport";
import type { SettingsService } from "./settings.service";

const owner: RequestContext = {userId:"onboarding-owner",requestId:"onboard",source:"user"};
describe("引导持久状态的真实数据库与契约", () => {
 let service: ReturnType<typeof createOnboardingState>;
 let reopenService: () => ReturnType<typeof createOnboardingState>;
 let a: RequestContext; let b: RequestContext;
 beforeAll(async()=>{
  const {db}=await createDb(); let seq=0;
  const accounts=createPlatformAccountService({db,now:()=>new Date().toISOString(),nextId:p=>`${p}-onboarding-${++seq}`});
  const first=await accounts.createAccount(owner,{platform:"douyin",accountHandle:"first"});
  const second=await accounts.createAccount(owner,{platform:"douyin",accountHandle:"second"});
  a={...owner,accountId:first.id}; b={...owner,accountId:second.id};
  reopenService=()=>createOnboardingState(db,(ctx,id)=>accounts.getAccount(ctx,id));
  service=reopenService();
 });
 it("默认折叠且无完成记录；重复读取和新服务实例保留确认与关闭",async()=>{
  expect(await service.get(a,a.accountId!)).toMatchObject({origin:null,hidden:false,collapsed:true,completedSteps:[],updatedAt:null});
  await service.patch(a,a.accountId!,{origin:"existing",hidden:true,completedSteps:["import-account","review-imported-projects"]});
  service=reopenService();
  expect(await service.get(a,a.accountId!)).toMatchObject({hidden:true,origin:"existing",completedSteps:expect.arrayContaining(["import-account","review-imported-projects"])});
  expect(await service.get(b,b.accountId!)).toMatchObject({hidden:false,origin:null,completedSteps:[]});
 });
 it("并发PATCH累加完成，不覆盖未传入偏好；重开不清除完成",async()=>{
  await Promise.all([service.patch(a,a.accountId!,{completedSteps:["first-project"]}),service.patch(a,a.accountId!,{completedSteps:["positioning-profile"]})]);
  const reopen=await service.patch(a,a.accountId!,{hidden:false,collapsed:false,completedSteps:[]});
  expect(reopen.completedSteps).toEqual(expect.arrayContaining(["first-project","positioning-profile","review-imported-projects","import-account"]));
  expect(reopen).toMatchObject({hidden:false,collapsed:false,origin:"existing"});
 });
 it("拒绝跨用户、跨当前账号、空账号；错误请求不污染其他账号",async()=>{
  await expect(service.get({...a,userId:"other"},a.accountId!)).rejects.toBeInstanceOf(OwnershipError);
  await expect(service.patch(a,b.accountId!,{hidden:true})).rejects.toBeInstanceOf(OwnershipError);
  await expect(service.patch(owner,"",{hidden:true})).rejects.toThrow();
  expect((await service.get(b,b.accountId!)).hidden).toBe(false);
 });
 it("服务与契约均拒绝伪造完成值和额外字段",async()=>{
  const endpoint=ENDPOINTS.patchOnboarding;
  expect(endpoint.body!.safeParse({completedSteps:["invented"]}).success).toBe(false);
  expect(endpoint.body!.safeParse({completedSteps:false}).success).toBe(false);
  expect(endpoint.body!.safeParse({userId:"other"}).success).toBe(false);
  await expect(service.patch(a,a.accountId!,{completedSteps:["invented"]} as never)).rejects.toThrow();
 });
 it("真实transport路由GET/PATCH，响应按资源schema校验",async()=>{
  const transport=createSettingsTransport(()=>({}) as SettingsService,undefined,service);
  const got=await transport.request(ENDPOINTS.patchOnboarding,{params:{accountId:b.accountId!},query:undefined,body:{completedSteps:["confirm-origin"],origin:"fresh"}},b) as {data:unknown};
  expect(ENDPOINTS.getOnboarding.response.safeParse(got.data).success).toBe(true);
  const read=await transport.request(ENDPOINTS.getOnboarding,{params:{accountId:b.accountId!},query:undefined,body:undefined},b) as {data:unknown};
  expect(read.data).toMatchObject({origin:"fresh",completedSteps:["confirm-origin"]});
 });
});
