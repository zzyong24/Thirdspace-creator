import {expect,it,vi} from 'vitest';
import {createDb} from '@creatoros/backend';
import type {RequestContext} from '@creatoros/contract';
import {createPlatformAccountService} from './platform-account.service';
import {createAccountGroupService} from './account-group.service';
import {createPlatformAccountTransport} from './platform-account.transport';
import {ENDPOINTS} from '@creatoros/contract';
const ctx:RequestContext={userId:'plan-u',requestId:'plan-r',source:'user'};
async function fixture(evidence?:(ctx:RequestContext,account:{id:string})=>Promise<boolean>){
 const {db}=await createDb();let seq=0;const deps={db,now:()=> '2026-10-10T00:00:00.000Z',nextId:(p:string)=>`${p}-${++seq}`};
 const proof=vi.fn(evidence);const svc=createPlatformAccountService({...deps,bindingCapabilities:async()=>[{platform:'xiaohongshu',collect:{available:true,reason:'装配可用'},bind:{available:true,reason:'可绑定',method:'qr'},publish:{available:false,reason:'未装配'},draft:{available:false,reason:'未装配'},manual:{available:true,reason:'可登记'}}],...(evidence?{collectionPlanEvidence:proof}:{})});
 const a=await svc.createAccount(ctx,{platform:'xiaohongshu',accountHandle:'实际测试号'});const member=await createAccountGroupService(deps).forAccount(ctx,a.id);
 return {svc,a,proof,scoped:{...ctx,groupId:member.groupId,accountId:null}};
}
it('公开transport返回同组真实资格，不返回凭据或当前登录断言',async()=>{
 const {svc,a,scoped}=await fixture(async()=>true);
 const res=await createPlatformAccountTransport(()=>svc).request(ENDPOINTS.getAccountCollectionPlanReadiness,{params:{accountId:a.id},query:undefined,body:undefined},scoped);
 expect(res).toEqual({data:{accountId:a.id,platform:'xiaohongshu',status:'active',collectAvailable:true,planEvidence:'verified'},meta:{requestId:'plan-r'}});
});
it('跨组/跨用户/无组拒绝且不调用证据port',async()=>{
 const {svc,a,proof,scoped}=await fixture(async()=>true);
 for(const bad of [{...scoped,groupId:'another'},{...scoped,userId:'other'},ctx])await expect(svc.getCollectionPlanReadiness(bad,a.id)).rejects.toThrow();
 expect(proof).not.toHaveBeenCalled();
});
it('缺少证明、未装配与读失败不冒充成功或当前过期',async()=>{
 const missing=await fixture(async()=>false);expect(await missing.svc.getCollectionPlanReadiness(missing.scoped,missing.a.id)).toMatchObject({planEvidence:'missing'});
 const unknown=await fixture();expect(await unknown.svc.getCollectionPlanReadiness(unknown.scoped,unknown.a.id)).toMatchObject({planEvidence:'unknown'});
 const broken=await fixture(async()=>{throw new Error('真实读取错误')});await expect(broken.svc.getCollectionPlanReadiness(broken.scoped,broken.a.id)).rejects.toThrow('真实读取错误');
});
it('归档仍可查状态，不读取证明、不新增计划',async()=>{
 const {svc,a,proof,scoped}=await fixture(async()=>true);await svc.archiveAccount(scoped,a.id);
 expect(await svc.getCollectionPlanReadiness(scoped,a.id)).toMatchObject({status:'archived',planEvidence:'unknown'});expect(proof).not.toHaveBeenCalled();
});

it('同组选中A读取B，证明port只收到已核验B上下文，跨组仍不调用',async()=>{
 const {svc,a,proof,scoped}=await fixture(async()=>true);
 const selected=await svc.createAccount(scoped,{platform:'douyin',accountHandle:'同组A'});
 proof.mockImplementation(async(c,account)=>{
   if(c.accountId!==account.id)throw new Error('当前账号与请求账号不一致');
   expect(c.membershipVersion).toBe(1);
   return true;
 });
 expect(await svc.getCollectionPlanReadiness({...scoped,accountId:selected.id,membershipVersion:99},a.id)).toMatchObject({planEvidence:'verified'});
 expect(proof).toHaveBeenCalledOnce();
 await expect(svc.getCollectionPlanReadiness({...scoped,groupId:'foreign',accountId:selected.id},a.id)).rejects.toThrow();
 expect(proof).toHaveBeenCalledOnce();
});
