import {readFileSync,promises as fsPromises} from "node:fs";
import {mkdtemp,mkdir,readFile,rm,stat} from "node:fs/promises";
import {join,resolve} from "node:path";
import {randomBytes,generateKeyPairSync,sign,createHash} from "node:crypto";
import {afterEach,describe,expect,it,vi} from "vitest";
import {refreshClientConfig,readChannelModelAuthority,fulfillActivationIncludedCredit} from "./client-config.server";
import {EncryptedModelBenefitStore,deriveModelBenefitScopeId,requestModelBenefitLink,ensureModelBenefitAuthority,type ModelBenefitDependencies} from "./model-benefit.server";
import {pinModelAuthority} from "../task-model-authority";
import {createAiCreditPortalLink} from "./ai-credit-link.server";
import {upgradeModelBenefits,deriveLegacyUpgradeIdentityHash} from './model-benefit.server';
import {decryptSecret} from '@creatoros/backend';

const ROOT=resolve(process.cwd(),"..");
const growth=JSON.parse(readFileSync(join(ROOT,"docs/build/growth-t243/growth-consumer-cross-repo-samples.json"),"utf8"));
const activity=JSON.parse(readFileSync(join(ROOT,"docs/build/growth-t243/model-benefit-cross-repo-fixture.json"),"utf8"));
const dirs:string[]=[];afterEach(async()=>{await Promise.all(dirs.splice(0).map(dir=>rm(dir,{recursive:true,force:true})))});
async function fixture(name="unassigned") {
  await mkdir(join(ROOT,"tmp/growth-t243"),{recursive:true});const dir=await mkdtemp(join(ROOT,"tmp/growth-t243/consumer-"));dirs.push(dir);
  const row=growth.cases.find((c:{name:string})=>c.name===name),am=activity.cases.find((c:{name:string})=>c.name===name);
  const env={CREATOROS_MODEL_BENEFITS_ENABLED:"1",CREATOROS_CLIENT_CONFIG_PULL_ENABLED:"1",CREATOROS_LICENSE_BASE_URL:"https://activity.invalid",CREATOROS_LICENSE_PROJECT_KEY:"creatoros",CREATOROS_GROWTH_CLIENT_CONFIG_ORIGIN:"https://growth.invalid",CREATOROS_LICENSE_PUBLIC_KEY_B64:activity.publicKeyBase64,CREATOROS_MODEL_BENEFIT_KEY_ID:activity.kid,CREATOROS_GROWTH_CONFIG_KEY_ID:growth.growthSigner.keyId,CREATOROS_GROWTH_CONFIG_PUBLIC_KEY_B64:growth.growthSigner.publicKeyBase64};
  let verdict:import('./license-file.server').LicenseVerdict={v:1,allowed:true,status:"active",code:"LOCAL-SYNTHETIC-CODE",machineId:"synthetic-original-PC",projectKey:"creatoros",licenseMode:'TIME',expiresAt:null,channelRef:row.directory.body.sourceChannelRef};
  let now=new Date(growth.now);const puts=new Map<string,string>(),store=new EncryptedModelBenefitStore(join(dir,"cache"),randomBytes(32)),calls:string[]=[];
  const fetchImpl=vi.fn(async(input:RequestInfo|URL,init?:RequestInit)=>{
    const url=new URL(String(input));calls.push(url.pathname);expect(init?.method).toBe("POST");expect(init?.redirect).toBe("manual");expect(init?.cache).toBe("no-store");expect(url.search).toBe("");
    if(url.pathname==="/api/license/model-benefit-proofs") {
      expect(JSON.parse(String(init?.body))).toEqual({contractVersion:"model-benefit-proof-v1",projectKey:"creatoros",code:verdict.code,machineId:verdict.machineId,nonce:am.proofNonce});
      return Response.json({contractVersion:"model-benefit-proof-v1",modelBenefitProof:am.modelBenefitProof},{headers:{"cache-control":"no-store"}});
    }
    expect(JSON.parse(String(init?.body))).toEqual({contractVersion:"growth-model-benefit-request-v1",modelBenefitProof:am.modelBenefitProof});
    expect(new Headers(init?.headers).get("Idempotency-Key")).toMatch(/^[\x20-\x7e]{8,128}$/);
    expect(new Headers(init?.headers).get("cookie")).toBeNull();
    const action=url.pathname.split("/").pop(),body=action==="directory"?row.directory.body:action==="credentials"?row.credentials:action==="fulfill"?row.fulfill:row.linkSession;
    return Response.json(body,{headers:{"cache-control":"private, no-store","x-correlation-id":"cor_0123456789abcdef0123456789abcdef"}});
  });
  const putManagedCredential=vi.fn(async(scope:string,service:string,token:string)=>{puts.set(`${scope}:${service}`,token)});
  const deps:ModelBenefitDependencies={env,fetchImpl,now:()=>now,nonce:()=>am.proofNonce,readVerdict:async()=>({state:"ready" as const,verdict}),modelBenefitStore:store,putManagedCredential};
  return {dir,row,am,env,deps,store,puts,calls,fetchImpl,putManagedCredential,setVerdict:(value:Partial<typeof verdict>)=>{verdict={...verdict,...value}},setNow:(value:Date)=>{now=value}};
}
function canonical(value:unknown):string{if(value===null||typeof value!=="object")return JSON.stringify(value);if(Array.isArray(value))return `[${value.map(canonical).join(",")}]`;return `{${Object.keys(value).sort().map(key=>`${JSON.stringify(key)}:${canonical((value as Record<string,unknown>)[key])}`).join(",")}}`}
describe('T1423真实正式v1升级消费端口',()=>{
 it('并发首次probe穿过异步读盘后仍不超过256个live观察，不踢已有观察',async()=>{
  const f=await fixture(),read=f.deps.readVerdict!,key=Buffer.alloc(32,7);let release!:()=>void,created=0,entered=0;
  const gate=new Promise<void>(resolve=>{release=resolve}),clock=vi.spyOn(Date,'now').mockReturnValue(Date.now()-1460000);
  try{
   const calls=Array.from({length:257},()=>{const controller=new AbortController();return upgradeModelBenefits('probe',{...f.deps,signal:controller.signal,readVerdict:async()=>{entered++;await gate;return read();},observationMasterKey:key,env:{...f.env,CREATOROS_SIDECAR_HANDSHAKE_TOKEN:'22'.repeat(32)},observation:{token:null,actor:{userId:'principal',accountId:'account',groupId:'group'},onToken:()=>{created++;controller.abort();}}});});
   for(let i=0;i<20&&entered<257;i++)await Promise.resolve();expect(entered).toBe(257);release();await Promise.allSettled(calls);
   expect(created).toBe(256);expect(f.fetchImpl).not.toHaveBeenCalled();
  }finally{release?.();clock.mockRestore()}
 });
 async function observed(){
  const f=await fixture(),key=Buffer.from(Array.from({length:32},(_,i)=>i));let token:string|null=null;
  const actor={userId:'synthetic-principal',accountId:'synthetic-account',groupId:'synthetic-group'};
  const step=(action:'probe'|'fulfill'|'sync',options:{token?:string|null;actor?:typeof actor}={})=>upgradeModelBenefits(action,{...f.deps,env:{...f.env,CREATOROS_SIDECAR_HANDSHAKE_TOKEN:'11'.repeat(32)},observationMasterKey:key,observation:{token:options.token===undefined?token:options.token,actor:options.actor??actor,onToken:value=>{token=value}}});
  return {...f,key,actor,step,token:()=>token};
 }
 it('跨请求probe A后换B不能fulfill B，token中不暴露稳定identity明文',async()=>{
  const f=await observed();expect(await f.step('probe')).toMatchObject({outcome:'ready'});expect(f.token()).toMatch(/^enc:v1:/);
  const k=createHash('sha256').update(f.key).update('creatoros-legacy-upgrade-fence-v1').digest();const payload=JSON.parse(decryptSecret(f.token()!,k));expect(payload.contractVersion).toBe('creatoros-legacy-upgrade-observation-v1');expect(Date.parse(payload.expiresAt)-Date.parse(payload.issuedAt)).toBe(730000);
  f.setVerdict({code:'DIFFERENT-SYNTHETIC-CODE'});const before=f.fetchImpl.mock.calls.length;
  expect(await f.step('fulfill')).toMatchObject({outcome:'blocked',reasonCode:'UPGRADE_IDENTITY_CHANGED'});expect(f.fetchImpl).toHaveBeenCalledTimes(before);
 });
 it('过期/丢失token probe绝不重新pin续TTL，错actor同样零请求',async()=>{
  const f=await observed();await f.step('probe');const token=f.token(),before=f.fetchImpl.mock.calls.length;
  expect(await f.step('probe',{actor:{...f.actor,accountId:'other-account'}})).toMatchObject({reasonCode:'UPGRADE_IDENTITY_CHANGED'});
  const clock=vi.spyOn(Date,'now').mockReturnValue(Date.now()+730001);
  try{expect(await f.step('probe',{token})).toMatchObject({reasonCode:'UPGRADE_IDENTITY_CHANGED'});}finally{clock.mockRestore()}
  expect(await f.step('probe',{token:'enc:v1:UNKNOWN'})).toMatchObject({reasonCode:'UPGRADE_IDENTITY_CHANGED'});expect(f.fetchImpl).toHaveBeenCalledTimes(before);
 });
 it('稳定hash规范expiry且不钉activatedAt/epoch/lastseen，原mode和期限变化拒绝',async()=>{
  const base={v:1,allowed:true,status:'active',projectKey:'creatoros',code:'SYNTHETIC',machineId:'fixture-host',licenseMode:'TIME',channelRef:null,expiresAt:'2027-01-01T00:00:00Z'};
  expect(deriveLegacyUpgradeIdentityHash(base)).toBe(deriveLegacyUpgradeIdentityHash({...base,expiresAt:'2027-01-01T00:00:00.000Z',activatedAt:'2020-01-01T00:00:00.000Z',verdictAtMs:123}));
  expect(deriveLegacyUpgradeIdentityHash(base)).not.toBe(deriveLegacyUpgradeIdentityHash({...base,licenseMode:'COUNT'}));expect(()=>deriveLegacyUpgradeIdentityHash({...base,expiresAt:undefined})).toThrow();
  const f=await observed();await f.step('probe');f.setVerdict({expiresAt:'2027-01-01T00:00:00.000Z'});expect(await f.step('sync')).toMatchObject({reasonCode:'UPGRADE_IDENTITY_CHANGED'});expect(f.putManagedCredential).not.toHaveBeenCalled();
 });
 it('fulfill实际发送前重核期限fence，同token第二fulfill不再提交',async()=>{
  const f=await observed();await f.step('probe');await f.step('fulfill');const count=f.fetchImpl.mock.calls.length;expect(await f.step('fulfill')).toMatchObject({outcome:'blocked'});expect(f.fetchImpl).toHaveBeenCalledTimes(count);
  const g=await observed();await g.step('probe');const original=g.fetchImpl.getMockImplementation()!;g.fetchImpl.mockImplementation(async(input,init)=>{const response=await original(input,init);if(String(input).endsWith('model-benefit-proofs'))g.setVerdict({expiresAt:'2027-01-01T00:00:00.000Z'});return response});
  expect(await g.step('fulfill')).toMatchObject({reasonCode:'UPGRADE_IDENTITY_CHANGED'});expect(g.calls.filter(p=>p.endsWith('/fulfill'))).toHaveLength(0);
 });
 it('vault异步写后原期限已变不能继续cache提交，不只route开头查一次',async()=>{
  const f=await observed();await f.step('probe');f.deps.putManagedCredential=async()=>{f.setVerdict({expiresAt:'2027-01-01T00:00:00.000Z'})};
  expect(await f.step('sync')).toMatchObject({outcome:'blocked',reasonCode:'UPGRADE_IDENTITY_CHANGED'});expect(await f.store.load()).toBeNull();
 });
 it.each(['credentials','vault','cache'])('短于proof的签名目录在%s等待跨截止不报配置ready',async(phase)=>{
  const f=await retimedFixture(1000),original=f.fetchImpl.getMockImplementation()!;
  if(phase==='credentials')f.fetchImpl.mockImplementation(async(input,init)=>{const response=await original(input,init);if(String(input).endsWith('/credentials'))f.advance(2000);return response;});
  if(phase==='vault')f.deps.putManagedCredential=async()=>{f.advance(2000)};
  if(phase==='cache')f.deps.modelBenefitStore={load:()=>f.store.load(),save:async value=>{await f.store.save(value);f.advance(2000)}};
  expect(await upgradeModelBenefits('sync',f.deps)).toMatchObject({outcome:'pending',reasonCode:'UPGRADE_CONFIGURATION_PENDING',configurationStatus:'pending'});
  if(phase!=='cache')expect(await f.store.load()).toBeNull();
  else expect(await readChannelModelAuthority(f.deps)).toMatchObject({authority:'local'});
 });
 it('probe只读fresh proof/原凭据，不发fulfill、不写Key或配置',async()=>{
  const f=await fixture();expect(await upgradeModelBenefits('probe',f.deps)).toMatchObject({outcome:'ready',bindingStatus:'verified',entitlementStatus:'ready',configurationStatus:'not_started'});
  expect(f.calls).toEqual(['/api/license/model-benefit-proofs','/api/client/model-benefits/credentials']);expect(f.putManagedCredential).not.toHaveBeenCalled();expect(await f.store.load()).toBeNull();
 });
 it('proof绑定拒绝精确投影，尚未发Growth，凭据未知不触发恢复绑定',async()=>{
  const f=await fixture();f.fetchImpl.mockResolvedValue(Response.json({error:{code:'MODEL_BENEFIT_BINDING_STALE',message:'do not expose'}},{status:409,headers:{'cache-control':'no-store'}}));
  expect(await upgradeModelBenefits('probe',f.deps)).toMatchObject({outcome:'restore_required',reasonCode:'UPGRADE_BINDING_RECHECK_REQUIRED',entitlementStatus:'not_started'});expect(f.fetchImpl).toHaveBeenCalledTimes(1);
 });
 it.each([['MODEL_CREDENTIAL_NOT_CONFIGURED',404,'pending','UPGRADE_ENTITLEMENT_NOT_READY'],['MODEL_PROVIDER_CREATION_UNKNOWN',409,'unknown','UPGRADE_ENTITLEMENT_UNKNOWN'],['AI_CREDIT_BOOTSTRAP_PENDING',409,'blocked','UPGRADE_EXISTING_OPERATION_PENDING']])('probe %s不伪造未开户或自动发款',async(code,status,outcome,reasonCode)=>{
  const f=await fixture(),original=f.fetchImpl.getMockImplementation()!;f.fetchImpl.mockImplementation(async(input,init)=>String(input).endsWith('/credentials')?Response.json({error:{code,message:'internal'}},{status:Number(status),headers:{'cache-control':'no-store'}}):original(input,init));
  expect(await upgradeModelBenefits('probe',f.deps)).toMatchObject({outcome,reasonCode});expect(f.calls.some(p=>p.endsWith('fulfill'))).toBe(false);expect(f.putManagedCredential).not.toHaveBeenCalled();
 });
 it('fulfill只保原权益结果，后续sync独立读写，绝不并发两次履约',async()=>{
  const f=await fixture();expect(await upgradeModelBenefits('fulfill',f.deps)).toMatchObject({entitlementStatus:'ready',configurationStatus:'not_started'});
  expect(f.calls).toEqual(['/api/license/model-benefit-proofs','/api/client/model-benefits/fulfill']);expect(f.putManagedCredential).not.toHaveBeenCalled();
  expect(await upgradeModelBenefits('sync',f.deps)).toMatchObject({entitlementStatus:'ready',configurationStatus:'ready'});expect(f.putManagedCredential).toHaveBeenCalledTimes(1);expect(f.calls.filter(p=>p.endsWith('fulfill'))).toHaveLength(1);
 });
 it('fulfill后丢响应是unknown，不能变成尚未发起或绑定恢复',async()=>{
  const f=await fixture(),original=f.fetchImpl.getMockImplementation()!;f.fetchImpl.mockImplementation(async(input,init)=>{if(String(input).endsWith('/fulfill'))throw Error('controlled lost response');return original(input,init)});
  expect(await upgradeModelBenefits('fulfill',f.deps)).toMatchObject({outcome:'unknown',entitlementStatus:'unknown',phase:'fulfillment'});expect(f.putManagedCredential).not.toHaveBeenCalled();
 });
 it('sync缺原凭据不报configured完成，不调用fulfill',async()=>{
  const f=await fixture(),original=f.fetchImpl.getMockImplementation()!;f.fetchImpl.mockImplementation(async(input,init)=>String(input).endsWith('/credentials')?Response.json({error:{code:'MODEL_CREDENTIAL_NOT_CONFIGURED',message:'internal'}},{status:404,headers:{'cache-control':'no-store'}}):original(input,init));
  expect(await upgradeModelBenefits('sync',f.deps)).toMatchObject({outcome:'pending',configurationStatus:'pending',entitlementStatus:'unknown'});expect(f.calls.some(p=>p.endsWith('fulfill'))).toBe(false);
 });
 it.each([false,123,{},[]])('历史prefix只准string|null，非法类型%j仍拒绝',async(prefix)=>{
  const f=await fixture(),original=f.fetchImpl.getMockImplementation()!;f.fetchImpl.mockImplementation(async(input,init)=>{
   if(String(input).endsWith('/credentials')){const body=structuredClone(f.row.credentials);body.credential.tokenPrefix=prefix;return Response.json(body,{headers:{'cache-control':'private, no-store'}});}return original(input,init);
  });expect(await upgradeModelBenefits('probe',f.deps)).toMatchObject({outcome:'blocked',reasonCode:'UPGRADE_AUTHORITY_UNVERIFIED'});expect(f.putManagedCredential).not.toHaveBeenCalled();
 });
});
describe('T1423实际Growth正式v1输出消费（合成authority/fake provider，非生产或恢复接口验收）',()=>{
 const vectors=JSON.parse(readFileSync(join(ROOT,'docs/verification/t1423/fixtures/growth-formal-v1-economy-r1.json'),'utf8'));
 const names:[string][]=vectors.cases.map((row:{name:string})=>[row.name]);
 it.each(names)('实际服务向量 %s 保原经济结果/unknown/Key与closed协议',async(name)=>{
  expect(vectors.provenance.handWrittenDirectoryOrCredential).toBe(false);
  const row=vectors.cases.find((value:{name:string})=>value.name===name),f=await fixture();
  const authorityKid=Object.keys(row.syntheticAuthorityPublicKeys)[0]!,growthKid=Object.keys(row.growthBundlePublicKeys)[0]!;
  f.env.CREATOROS_LICENSE_PUBLIC_KEY_B64=row.syntheticAuthorityPublicKeys[authorityKid];f.env.CREATOROS_MODEL_BENEFIT_KEY_ID=authorityKid;f.env.CREATOROS_GROWTH_CONFIG_PUBLIC_KEY_B64=row.growthBundlePublicKeys[growthKid];f.env.CREATOROS_GROWTH_CONFIG_KEY_ID=growthKid;
  f.setVerdict({channelRef:row.proofClaims.sourceChannelRef});f.deps.now=()=>new Date(row.now);f.deps.nonce=()=>row.proofClaims.nonce;
  let credentials={status:404,body:{error:{code:'MODEL_CREDENTIAL_NOT_CONFIGURED',message:'not configured'}},cacheControl:'private, no-store'},fulfillment=credentials;
  f.fetchImpl.mockImplementation(async(input,init)=>{
   const path=new URL(String(input)).pathname;f.calls.push(path);expect(init?.method).toBe('POST');expect(new URL(String(input)).search).toBe('');
   if(path.endsWith('/model-benefit-proofs')){expect(JSON.parse(String(init?.body)).nonce).toBe(row.proofClaims.nonce);return Response.json({contractVersion:'model-benefit-proof-v1',modelBenefitProof:row.modelBenefitProof},{headers:{'cache-control':'no-store'}});}
   expect(JSON.parse(String(init?.body))).toEqual({contractVersion:'growth-model-benefit-request-v1',modelBenefitProof:row.modelBenefitProof});
   if(path.endsWith('/directory'))return Response.json(row.directory,{headers:{'cache-control':'private, no-store'}});
   const response=path.endsWith('/credentials')?credentials:fulfillment;
   return Response.json(response.body,{status:response.status,headers:{'cache-control':response.cacheControl}});
  });
  // trace每项为原fixture已明确执行的独立操作；这里不伪装一次UI观察自动重放fulfill。
  for(const step of row.trace){
   const action=step.request.path.endsWith('/credentials')?'probe':step.request.path.endsWith('/fulfill')?'fulfill':'sync';
   if(action==='probe')credentials=step.response;if(action==='fulfill')fulfillment=step.response;
   const result=await upgradeModelBenefits(action,f.deps);
   if(action!=='sync'){
    if(step.response.status===200)expect(result.entitlementStatus).toBe(step.response.body.wallet.linked?'ready':'pending');
    else expect(result.outcome).toBe(step.response.status===404?'pending':'unknown');
   }
   expect(JSON.stringify(result)).not.toContain(row.modelBenefitProof);
   if(action==='fulfill'&&step.response.status===200)credentials=step.response;
  }
  expect(await upgradeModelBenefits('sync',f.deps)).toMatchObject({configurationStatus:'ready',entitlementStatus:'ready'});
  expect(new Set(f.puts.values()).size).toBe(1);expect(await f.store.load()).not.toBeNull();expect(f.calls.every(path=>path.startsWith('/api/license/')||path.startsWith('/api/client/model-benefits/'))).toBe(true);
 });
});
async function retimedFixture(directoryLifetimeMs=300000){
 const f=await fixture(),amKeys=generateKeyPairSync("ed25519"),growthKeys=generateKeyPairSync("ed25519");let clock=new Date(growth.now),offline=false;
 f.env.CREATOROS_LICENSE_PUBLIC_KEY_B64=amKeys.publicKey.export({format:"der",type:"spki"}).subarray(-32).toString("base64");f.env.CREATOROS_GROWTH_CONFIG_PUBLIC_KEY_B64=growthKeys.publicKey.export({format:"der",type:"spki"}).subarray(-32).toString("base64");
 const hash=(text:string)=>`sha256:${createHash("sha256").update(text).digest("hex")}`;
 f.fetchImpl.mockImplementation(async(input,init)=>{
  if(offline)throw Error("本地合成断网");const path=new URL(String(input)).pathname;f.calls.push(path);
  const header=JSON.parse(Buffer.from(f.am.modelBenefitProof.split(".")[0],"base64url").toString()),claims=JSON.parse(Buffer.from(f.am.modelBenefitProof.split(".")[1],"base64url").toString());
  claims.issuedAt=clock.toISOString();claims.expiresAt=new Date(clock.getTime()+300000).toISOString();claims.nonce=f.am.proofNonce;
  const unsigned=Buffer.from(canonical(header)).toString("base64url")+"."+Buffer.from(canonical(claims)).toString("base64url"),proof=unsigned+"."+sign(null,Buffer.from(unsigned),amKeys.privateKey).toString("base64url");
  if(path.endsWith("model-benefit-proofs"))return Response.json({contractVersion:"model-benefit-proof-v1",modelBenefitProof:proof},{headers:{"cache-control":"no-store"}});
  expect(JSON.parse(String(init?.body)).modelBenefitProof).toBe(proof);
  const row=structuredClone(path.endsWith("directory")?f.row.directory.body:f.row.credentials);row.proofDigest=hash(proof);row.expiresAt=path.endsWith('directory')?new Date(clock.getTime()+directoryLifetimeMs).toISOString():claims.expiresAt;
  if(path.endsWith("directory")){const semantic={...row};delete semantic.bundleDigest;delete semantic.keyId;delete semantic.signature;row.bundleDigest=hash(canonical(semantic));row.signature=sign(null,Buffer.from(canonical({...semantic,bundleDigest:row.bundleDigest,keyId:row.keyId})),growthKeys.privateKey).toString("base64url")}
  return Response.json(row,{headers:{"cache-control":"private, no-store"}});
 });
 return {...f,advance:(ms:number)=>{clock=new Date(clock.getTime()+ms);f.setNow(clock)},offline:(value:boolean)=>{offline=value}};
}
describe("Growth T243真实跨仓DTO消费者（本地合成、非真人UAT）",()=>{
 it("真null经专用proof→实际Growth签名目录→existingOnly Key→真实加密缓存→原路由scope",async()=>{
  const f=await fixture();expect(await refreshClientConfig(f.deps)).toMatchObject({outcome:"configured"});
  expect(f.calls).toEqual(["/api/license/model-benefit-proofs","/api/client/model-benefits/directory","/api/client/model-benefits/credentials"]);
  const scope=deriveModelBenefitScopeId(f.row.credentials);expect(f.puts.get(`${scope}:omnihi-main`)).toBe(f.row.credentials.credential.token);
  const raw=await readFile(join(f.dir,"cache"),"utf8");expect(raw).not.toContain(f.row.credentials.credential.token);expect(raw).not.toContain(f.am.modelBenefitProof);expect((await stat(join(f.dir,"cache"))).mode&0o777).toBe(0o600);
  const authority=await readChannelModelAuthority(f.deps);expect(authority).toMatchObject({authority:"channel",sourceKind:"model_benefit",modelScope:{kind:"unassigned"},scopeId:scope});
  const pinned=pinModelAuthority(authority);expect(pinned.scopeId).toBe(scope);expect(pinned.payload).toEqual(f.row.directory.body.payload);
 });
 it("assigned与null同原经济hash但新vault/cache scope不混，显式首次履约与普通同步分离",async()=>{
  const a=await fixture("assigned"),b=await fixture();expect(a.row.credentials.entitlementBindingHash).toBe(b.row.credentials.entitlementBindingHash);expect(deriveModelBenefitScopeId(a.row.credentials)).not.toBe(deriveModelBenefitScopeId(b.row.credentials));
  expect(await fulfillActivationIncludedCredit(b.deps)).toMatchObject({status:"ready"});expect(b.calls).toEqual(["/api/license/model-benefit-proofs","/api/client/model-benefits/fulfill"]);expect(b.putManagedCredential).not.toHaveBeenCalled();
  await refreshClientConfig(a.deps);expect(a.calls.some(path=>path.endsWith("fulfill"))).toBe(false);
 });
 it("过期、换授权/机器后旧cache不供当前任务；scope绑定不借新授权",async()=>{
  const f=await fixture();await refreshClientConfig(f.deps);f.setVerdict({code:"OTHER-SYNTHETIC-CODE"});expect(await readChannelModelAuthority(f.deps)).toMatchObject({authority:"local"});
  f.setVerdict({code:"LOCAL-SYNTHETIC-CODE"});f.setNow(new Date("2026-10-17T08:05:00.000Z"));expect(await readChannelModelAuthority(f.deps)).toMatchObject({authority:"local"});
  f.setNow(new Date(growth.now));await expect(refreshClientConfig({...f.deps,expectedScopeId:"0".repeat(64)})).rejects.toMatchObject({code:"MODEL_ROUTE_IDENTITY_CHANGED"});
 });
 it("取消proof或目录等待后不发后续请求，不落迟到Key/cache，也不声称服务器撤销",async()=>{
  for(const phase of ["proof","directory"]){const f=await fixture(),controller=new AbortController();const original=f.fetchImpl.getMockImplementation()!;
    f.fetchImpl.mockImplementation(async(input,init)=>{const result=await original(input,init);if((phase==="proof"&&String(input).includes("model-benefit-proofs"))||(phase==="directory"&&String(input).endsWith("directory")))controller.abort();return result});
    await expect(refreshClientConfig({...f.deps,signal:controller.signal})).rejects.toMatchObject({name:"AbortError"});expect(f.putManagedCredential).not.toHaveBeenCalled();expect(await f.store.load()).toBeNull();expect(f.calls.length).toBe(phase==="proof"?1:2);
  }
 });
 it("凭据请求迟到时已切授权，不能写入旧scope或覆盖当前缓存",async()=>{
  const f=await fixture(),original=f.fetchImpl.getMockImplementation()!;f.fetchImpl.mockImplementation(async(input,init)=>{const result=await original(input,init);if(String(input).endsWith("credentials"))f.setVerdict({machineId:"different-PC"});return result});
  await expect(refreshClientConfig(f.deps)).rejects.toMatchObject({code:"MODEL_ROUTE_IDENTITY_CHANGED"});expect(f.putManagedCredential).not.toHaveBeenCalled();expect(await f.store.load()).toBeNull();
 });
 it("真实加密store屏障：A已开始save时B不能先完成，收尾后只保B当前结果",async()=>{
  const a=await fixture(),b=await fixture("assigned");let entered!:()=>void,release!:()=>void;
  const reached=new Promise<void>(resolve=>{entered=resolve}),gate=new Promise<void>(resolve=>{release=resolve});let calls=0;
  const shared={load:()=>a.store.load(),save:async(record:Parameters<typeof a.store.save>[0])=>{if(++calls===1){entered();await gate}await a.store.save(record)}};
  const first=refreshClientConfig({...a.deps,modelBenefitStore:shared}).then(value=>({value,error:null}),error=>({value:null,error}));await reached;
  let bCompleted=false;const second=refreshClientConfig({...b.deps,modelBenefitStore:shared}).then(value=>{bCompleted=true;return value});
  await new Promise(resolve=>setTimeout(resolve,20));expect(bCompleted).toBe(false);release();
  expect((await first).error).toMatchObject({code:"MODEL_ROUTE_IDENTITY_CHANGED"});expect(await second).toMatchObject({outcome:"configured"});
  expect((await a.store.load())?.directory.modelScope).toEqual({kind:"channel",channelRef:"official"});
  expect(await readChannelModelAuthority({...b.deps,modelBenefitStore:shared})).toMatchObject({sourceKind:"model_benefit",modelScope:{kind:"channel",channelRef:"official"}});
 });
 it("真实vault回调屏障：已开始旧写先收尾，新写在后；中间换channel同code也拒旧提交",async()=>{
  const a=await fixture(),b=await fixture("assigned");let entered!:()=>void,release!:()=>void;
  const reached=new Promise<void>(resolve=>{entered=resolve}),gate=new Promise<void>(resolve=>{release=resolve}),writes:string[]=[];
  const first=refreshClientConfig({...a.deps,putManagedCredential:async(scope,service,token)=>{entered();await gate;await a.deps.putManagedCredential!(scope,service,token);writes.push("A")}}).then(value=>({value,error:null}),error=>({value:null,error}));await reached;
  const second=refreshClientConfig({...b.deps,putManagedCredential:async(scope,service,token)=>{await b.deps.putManagedCredential!(scope,service,token);writes.push("B")}});await new Promise(resolve=>setTimeout(resolve,20));expect(writes).toEqual([]);release();
  expect((await first).error).toMatchObject({code:"MODEL_ROUTE_IDENTITY_CHANGED"});await second;expect(writes).toEqual(["A","B"]);expect(await a.store.load()).toBeNull();expect(await b.store.load()).not.toBeNull();
  const c=await fixture(),original=c.fetchImpl.getMockImplementation()!;c.fetchImpl.mockImplementation(async(input,init)=>{const result=await original(input,init);if(String(input).endsWith("credentials"))c.setVerdict({channelRef:"official"});return result});
  await expect(refreshClientConfig(c.deps)).rejects.toMatchObject({code:"MODEL_ROUTE_IDENTITY_CHANGED"});expect(c.putManagedCredential).not.toHaveBeenCalled();
 });
 it("签名目录或Key错scope/epoch/expiry拒绝，不把304当签名续期，也不退旧票据",async()=>{
  for(const field of ["authorizationVersion","sourceChannelRef","signature","304"]){const f=await fixture(),original=f.fetchImpl.getMockImplementation()!;
   f.fetchImpl.mockImplementation(async(input,init)=>{if(String(input).endsWith("directory")){if(field==="304")return new Response(null,{status:304,headers:{"cache-control":"private, no-store"}});const value=structuredClone(f.row.directory.body);value[field]=field==="authorizationVersion"?999:field==="signature"?"invalid":"official";return Response.json(value,{headers:{"cache-control":"private, no-store"}})}return original(input,init)});
   await expect(refreshClientConfig(f.deps)).rejects.toMatchObject({name:"ClientConfigPullError"});expect(f.putManagedCredential).not.toHaveBeenCalled();expect(f.calls.some(path=>path.includes("client-config-tickets"))).toBe(false);
  }
 });
 it.each(["file-sync","directory-sync","readback"])("真实密文替换%s故障：区分替换前保旧与替换后提交不确定，fresh可恢复",async(phase)=>{
  const f=await fixture();await refreshClientConfig(f.deps);const original=(await f.store.load())!;
  const changed={...original,managedCredentials:{...original.managedCredentials,"omnihi-main":{status:"not_configured" as const,reasonCode:null}}};
  const before=await readFile(join(f.dir,"cache"));let restore=()=>{};
  if(phase==="readback"){
    const spy=vi.spyOn(f.store,"load").mockRejectedValueOnce(new Error("本地合成readback故障"));restore=()=>spy.mockRestore();
  }else{
    const probe=await fsPromises.open(join(f.dir,".sync-probe"),"wx",0o600),prototype=Object.getPrototypeOf(probe),sync=prototype.sync;await probe.close();let thrown=false;
    const spy=vi.spyOn(prototype,"sync").mockImplementation(async function(this:typeof probe){const isDirectory=(await this.stat()).isDirectory();if(!thrown&&((phase==="file-sync"&&!isDirectory)||(phase==="directory-sync"&&isDirectory))){thrown=true;throw Error("本地合成fsync故障")}return sync.call(this)});restore=()=>spy.mockRestore();
  }
  try{await expect(f.store.save(changed)).rejects.toMatchObject({code:phase==="file-sync"?"CLIENT_CONFIG_STORAGE_UNAVAILABLE":"CLIENT_CONFIG_STORAGE_UNCERTAIN",retryable:true})}finally{restore()}
  if(phase==="file-sync"){expect(await readFile(join(f.dir,"cache"))).toEqual(before);expect(await f.store.load()).toEqual(original)}
  else{expect(await readFile(join(f.dir,"cache"))).not.toEqual(before);expect(await f.store.load()).toEqual(changed)}
  await refreshClientConfig(f.deps);expect(await f.store.load()).toEqual(original);
 });
 it("可控时钟跨5分钟普通后台同步仍同Key；休眠后首操作fresh，断网失败不借过期cache再恢复",async()=>{
  const f=await retimedFixture(),has=async(scope:string)=>f.puts.has(`${scope}:omnihi-main`);
  await ensureModelBenefitAuthority(f.deps,has);const first=await readChannelModelAuthority(f.deps);expect(first.authority).toBe("channel");const keys=[...f.puts.values()];
  for(let i=0;i<3;i++){f.advance(140000);await refreshClientConfig(f.deps);expect(await readChannelModelAuthority(f.deps)).toMatchObject({authority:"channel"})}
  expect([...f.puts.values()]).toEqual(keys);expect(f.calls.some(path=>path.endsWith("fulfill"))).toBe(false);
  f.advance(360000);expect(await readChannelModelAuthority(f.deps)).toMatchObject({authority:"local"});f.offline(true);
  expect(await ensureModelBenefitAuthority(f.deps,has)).toMatchObject({authority:"local",outcome:"unreachable"});expect(await readChannelModelAuthority(f.deps)).toMatchObject({authority:"local"});
  f.offline(false);expect(await ensureModelBenefitAuthority(f.deps,has)).toMatchObject({authority:"channel"});expect([...f.puts.values()]).toEqual(keys);
 });
 it("同identity只共享一次网络快照，各actor/store仍分别写原vault；取消一位不杀其余观察者",async()=>{
  const f=await fixture(),original=f.fetchImpl.getMockImplementation()!;let entered!:()=>void,release!:()=>void;const reached=new Promise<void>(r=>{entered=r}),gate=new Promise<void>(r=>{release=r});
  f.fetchImpl.mockImplementation(async(input,init)=>{if(String(input).endsWith("model-benefit-proofs")){entered();await gate}return original(input,init)});
  const controller=new AbortController(),a=refreshClientConfig({...f.deps,signal:controller.signal}).then(value=>({value,error:null}),error=>({value:null,error}));await reached;
  const b=await fixture(),bPut=b.putManagedCredential;const second=refreshClientConfig({...f.deps,modelBenefitStore:b.store,putManagedCredential:bPut});await new Promise(r=>setTimeout(r,0));controller.abort();release();
  expect((await a).error).toMatchObject({name:"AbortError"});expect(await second).toMatchObject({outcome:"configured"});expect(f.calls).toHaveLength(3);expect(f.putManagedCredential).not.toHaveBeenCalled();expect(bPut).toHaveBeenCalledTimes(1);expect(await b.store.load()).not.toBeNull();expect(await f.store.load()).toBeNull();
 });
 it("同一网络快照两个事务观察者各自提交，不能把首位未提交的Key当第二位已保存",async()=>{
  const f=await fixture(),other=await fixture(),original=f.fetchImpl.getMockImplementation()!;let entered!:()=>void,release!:()=>void;const reached=new Promise<void>(r=>{entered=r}),gate=new Promise<void>(r=>{release=r});
  f.fetchImpl.mockImplementation(async(input,init)=>{if(String(input).endsWith("model-benefit-proofs")){entered();await gate}return original(input,init)});
  const a=refreshClientConfig(f.deps);await reached;const b=refreshClientConfig({...f.deps,modelBenefitStore:other.store,putManagedCredential:other.putManagedCredential});await new Promise(r=>setTimeout(r,0));release();await Promise.all([a,b]);
  expect(f.calls).toHaveLength(3);expect(f.putManagedCredential).toHaveBeenCalledTimes(1);expect(other.putManagedCredential).toHaveBeenCalledTimes(1);expect(await f.store.load()).not.toBeNull();expect(await other.store.load()).not.toBeNull();
 });
 it("null额度中心专用link请求不履约、不带proof URL、保原link DTO",async()=>{
  const f=await fixture(),result=await requestModelBenefitLink(f.deps,"stable-link-test-20261017");expect(await result.response.json()).toEqual(f.row.linkSession);expect(f.calls).toEqual(["/api/license/model-benefit-proofs","/api/client/model-benefits/link-session"]);expect(f.putManagedCredential).not.toHaveBeenCalled();
 });
 it("真实额度中心消费者验证Growth来源/fragment期限，null专用接缝可交原页面",async()=>{
  const f=await fixture();f.env.CREATOROS_GROWTH_CLIENT_CONFIG_ORIGIN=new URL(f.row.linkSession.verificationUrl).origin;
  const result=await createAiCreditPortalLink({...f.deps,idempotencyKey:()=>"stable-link-test-20261017"});
  const target=new URL(result.openUrl);expect(target.origin).toBe(new URL(f.row.linkSession.verificationUrl).origin);expect(target.pathname).toBe("/credits/connect");expect(target.hash).toBe(`#${f.row.linkSession.userCode}`);expect(target.search).toBe("");
  expect(result.openUrl).not.toContain(f.am.modelBenefitProof);expect(f.calls).toEqual(["/api/license/model-benefit-proofs","/api/client/model-benefits/link-session"]);
 });
});

it('全部观察者取消立即释放原网络航班，新操作可恢复且旧请求不落Key',async()=>{
 const f=await fixture(),a=new AbortController(),b=new AbortController(),original=f.fetchImpl.getMockImplementation()!;
 let release!:()=>void,reached!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve}),atFetch=new Promise<void>(resolve=>{reached=resolve});let first=true;
 f.fetchImpl.mockImplementation(async(input,init)=>{if(first){first=false;reached();await gate;}return original(input,init);});
 const left=refreshClientConfig({...f.deps,signal:a.signal}),right=refreshClientConfig({...f.deps,signal:b.signal});
 const outcomes=Promise.allSettled([left,right]);await atFetch;a.abort();b.abort();expect((await outcomes).every(value=>value.status==='rejected')).toBe(true);
 const restored=refreshClientConfig(f.deps);release();expect(await restored).toMatchObject({outcome:'configured'});expect(f.putManagedCredential).toHaveBeenCalledTimes(1);
});
it('有效cache的vault检查迟到且已切授权，ensure拒绝原Key不提交或借另一scope',async()=>{
 const f=await fixture();await refreshClientConfig(f.deps);let release!:()=>void,reached!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve}),atVault=new Promise<void>(resolve=>{reached=resolve});
 const pending=ensureModelBenefitAuthority(f.deps,async()=>{reached();await gate;return true;});await atVault;f.setVerdict({channelRef:'other-valid-channel'});release();
 await expect(pending).rejects.toMatchObject({code:'MODEL_ROUTE_IDENTITY_CHANGED'});expect(f.calls).toHaveLength(3);expect(f.putManagedCredential).toHaveBeenCalledTimes(1);
});


it("普通任务fresh观察总120秒，后台同flight不续截止且可继续，未落迟到Key",async()=>{
 const f=await retimedFixture();let release!:(response:Response)=>void;let reached!:()=>void;const entered=new Promise<void>(resolve=>{reached=resolve});
 const original=f.fetchImpl.getMockImplementation()!;let first=true;
 f.fetchImpl.mockImplementation(async(input,init)=>{const response=await original(input,init);if(first){first=false;reached();await new Promise<Response>(resolve=>{release=()=>resolve(response)});}return response});
 const background=refreshClientConfig(f.deps);await entered;
 vi.useFakeTimers();try{
  let result:unknown="pending";
  const ordinary=ensureModelBenefitAuthority(f.deps,async scope=>f.puts.has(`${scope}:omnihi-main`)).then(value=>{result=value},error=>{result=error});
  // real IO读取完缓存后才推进观察计时；短微任务不依赖fake FS。
  for(let i=0;i<20;i++)await Promise.resolve();
  await vi.advanceTimersByTimeAsync(120000);
  expect(result).toMatchObject({code:"MODEL_BENEFIT_REFRESH_PENDING"});expect(f.putManagedCredential).not.toHaveBeenCalled();
  release(new Response());await background;await ordinary;expect(f.putManagedCredential).toHaveBeenCalledTimes(1);
 }finally{vi.useRealTimers();release?.(new Response());await background.catch(()=>undefined)}
});

it("已有未过期cache及原actor Key立即复用，普通操作零官方请求",async()=>{
 const f=await retimedFixture();await refreshClientConfig(f.deps);const count=f.calls.length;
 expect(await ensureModelBenefitAuthority(f.deps,async scope=>f.puts.has(`${scope}:omnihi-main`))).toMatchObject({authority:"channel"});expect(f.calls).toHaveLength(count);
});

it("T1375 malformed官方目录保持协议拒绝，不折为audio可用性回退",async()=>{
 const f=await fixture(),original=f.fetchImpl.getMockImplementation()!;
 f.fetchImpl.mockImplementation(async(input,init)=>String(input).endsWith('/directory')?Response.json({invalid:"synthetic-malformed-directory"}):original(input,init));
 await expect(ensureModelBenefitAuthority(f.deps,async()=>false)).rejects.toThrow();
 expect(f.putManagedCredential).not.toHaveBeenCalled();
});

it("T1375 fresh security_error对象不折为临时不可用，后续合法验签仍可恢复",async()=>{
 const f=await fixture(),backing=f.store;let corrupt=false;
 f.deps.modelBenefitStore={load:async()=>{const value=await backing.load();return corrupt&&value?{...value,directory:{...value.directory,signature:'synthetic-invalid-signature'}}:value;},save:async value=>{await backing.save(value);corrupt=true;}};
 await expect(ensureModelBenefitAuthority(f.deps,async()=>true)).resolves.toMatchObject({authority:'local',outcome:'security_error'});
 corrupt=false;f.deps.modelBenefitStore=backing;
 await expect(ensureModelBenefitAuthority(f.deps,async()=>true)).resolves.toMatchObject({authority:'channel',outcome:'configured'});
});


describe('T1423 automatic 单owner与原截止',()=>{
 async function autoFixture(){
  const f=await fixture(),key=randomBytes(32),boot=randomBytes(32).toString('hex'),actor={userId:'automatic-principal',accountId:'automatic-account',groupId:'automatic-group'},tokens:string[]=[];
  const step=(action:'probe'|'fulfill'|'sync',options:{token?:string|null;automatic?:boolean;actor?:typeof actor}={})=>upgradeModelBenefits(action,{...f.deps,env:{...f.env,CREATOROS_SIDECAR_HANDSHAKE_TOKEN:boot},observationMasterKey:key,observation:{token:options.token??null,actor:options.actor??actor,automatic:options.automatic??true,onToken:value=>tokens.push(value)}});
  return {...f,key,boot,actor,tokens,step};
 }
 it('同boot重复无token probe只有首响应持token，后来请求无下游',async()=>{
  const f=await autoFixture();expect(await f.step('probe')).toMatchObject({outcome:'ready'});const count=f.calls.length;
  expect(await f.step('probe')).toMatchObject({phase:'proof',outcome:'unknown',reasonCode:'UPGRADE_SERVICE_UNAVAILABLE',bindingStatus:'unverified',entitlementStatus:'not_started'});
  expect(f.tokens).toHaveLength(1);expect(f.calls).toHaveLength(count);
 });
 it('两个首次probe穿过异步读盘后仍仅一个owner发下游',async()=>{
  const f=await autoFixture(),results=await Promise.all([f.step('probe'),f.step('probe')]);
  expect(results.filter(r=>r.outcome==='ready')).toHaveLength(1);expect(results.filter(r=>r.reasonCode==='UPGRADE_SERVICE_UNAVAILABLE')).toHaveLength(1);
  expect(f.tokens).toHaveLength(1);expect(f.calls.filter(p=>p.endsWith('model-benefit-proofs'))).toHaveLength(1);
 });
 it('过期保automatic墓碑，无token probe不续TTL或新造观察',async()=>{
  const f=await autoFixture();await f.step('probe');const count=f.calls.length,clock=vi.spyOn(Date,'now').mockReturnValue(Date.now()+730001);
  try{expect(await f.step('probe')).toMatchObject({outcome:'unknown',reasonCode:'UPGRADE_SERVICE_UNAVAILABLE'});expect(await f.step('sync',{token:f.tokens[0]})).toMatchObject({reasonCode:'UPGRADE_IDENTITY_CHANGED'});}finally{clock.mockRestore()}
  expect(f.tokens).toHaveLength(1);expect(f.calls).toHaveLength(count);
 });
 it('manual token不能混入automatic；automatic无token fulfill不能申请观察',async()=>{
  const f=await autoFixture();await f.step('probe',{automatic:false});const token=f.tokens[0],count=f.calls.length;
  expect(await f.step('fulfill',{token})).toMatchObject({reasonCode:'UPGRADE_IDENTITY_CHANGED'});expect(await f.step('fulfill')).toMatchObject({reasonCode:'UPGRADE_IDENTITY_CHANGED'});
  expect(f.calls).toHaveLength(count);expect(f.tokens).toHaveLength(1);
 });
 it('原许可变化使automatic token失效，换回A也不复活原token或新观察',async()=>{
  const f=await autoFixture();await f.step('probe');const token=f.tokens[0],count=f.calls.length;f.setVerdict({code:'DIFFERENT-AUTOMATIC-CODE'});
  expect(await f.step('sync',{token})).toMatchObject({reasonCode:'UPGRADE_IDENTITY_CHANGED'});f.setVerdict({code:'LOCAL-SYNTHETIC-CODE'});
  expect(await f.step('probe')).toMatchObject({reasonCode:'UPGRADE_SERVICE_UNAVAILABLE'});expect(await f.step('sync',{token})).toMatchObject({reasonCode:'UPGRADE_IDENTITY_CHANGED'});
  expect(f.calls).toHaveLength(count);expect(f.tokens).toHaveLength(1);
 });
 it('automatic原owner可续同token，但同token履约最多发送一次',async()=>{
  const f=await autoFixture();await f.step('probe');const token=f.tokens[0];expect(await f.step('fulfill',{token})).toMatchObject({entitlementStatus:'ready'});
  expect(await f.step('fulfill',{token})).toMatchObject({reasonCode:'UPGRADE_IDENTITY_CHANGED'});expect(f.calls.filter(p=>p.endsWith('/fulfill'))).toHaveLength(1);
  expect(await f.step('sync',{token})).toMatchObject({configurationStatus:'ready'});
 });
 it('automatic在途时普通read/fulfill/link在generation递增前延期，owner仍可完成',async()=>{
  const f=await autoFixture(),original=f.fetchImpl.getMockImplementation()!;let entered!:()=>void,release!:()=>void;
  const started=new Promise<void>(resolve=>{entered=resolve}),gate=new Promise<void>(resolve=>{release=resolve});let held=false;
  f.fetchImpl.mockImplementation(async(input,init)=>{if(String(input).endsWith('model-benefit-proofs')&&!held){held=true;entered();await gate;}return original(input,init)});
  const owner=f.step('probe');await started;
  try{
   await expect(refreshClientConfig(f.deps)).rejects.toMatchObject({code:'MODEL_BENEFIT_REFRESH_PENDING',retryable:true});
   expect(await fulfillActivationIncludedCredit(f.deps)).toMatchObject({status:'pending'});
   await expect(requestModelBenefitLink(f.deps)).rejects.toMatchObject({code:'MODEL_BENEFIT_REFRESH_PENDING'});
  }finally{release()}
  expect(await owner).toMatchObject({outcome:'ready'});expect(f.calls.filter(p=>p.endsWith('model-benefit-proofs'))).toHaveLength(1);expect(f.calls.filter(p=>p.endsWith('/fulfill'))).toHaveLength(0);
 });
 it('附token后下游真实signal按原entry剩余时间截止，不新开120秒',async()=>{
  const f=await autoFixture();await f.step('probe');const token=f.tokens[0],clock=vi.spyOn(Date,'now').mockReturnValue(Date.now()+729950);let aborted=false;
  f.fetchImpl.mockImplementation(async(_input,init)=>new Promise<Response>((_resolve,reject)=>{const signal=init?.signal;const stop=()=>{aborted=true;reject(new DOMException('原观察已到期','AbortError'))};if(signal?.aborted)stop();else signal?.addEventListener('abort',stop,{once:true})}));
  try{const result=await Promise.race([f.step('sync',{token}).then(()=>null,error=>error),new Promise(resolve=>setTimeout(()=>resolve('not-clamped'),250))]);expect(result).toMatchObject({name:'AbortError'});expect(aborted).toBe(true);}finally{clock.mockRestore()}
 });
 it('automatic索引满256不驱逐墓碑或因token过期开放替代写',async()=>{
  vi.resetModules();const isolated=await import('./model-benefit.server'),f=await fixture(),key=randomBytes(32),boot=randomBytes(32).toString('hex');let created=0;
  const make=(i:number)=>{const controller=new AbortController();return isolated.upgradeModelBenefits('probe',{...f.deps,signal:controller.signal,observationMasterKey:key,env:{...f.env,CREATOROS_SIDECAR_HANDSHAKE_TOKEN:boot},observation:{automatic:true,token:null,actor:{userId:'cap-'+i,accountId:null,groupId:null},onToken:()=>{created++;controller.abort()}}});};
  await Promise.allSettled(Array.from({length:257},(_,i)=>make(i)));expect(created).toBe(256);expect(f.fetchImpl).not.toHaveBeenCalled();
  const clock=vi.spyOn(Date,'now').mockReturnValue(Date.now()+1460000);try{expect(await make(257)).toMatchObject({reasonCode:'UPGRADE_SERVICE_UNAVAILABLE'});expect(await make(0)).toMatchObject({reasonCode:'UPGRADE_SERVICE_UNAVAILABLE'});}finally{clock.mockRestore()}
  expect(created).toBe(256);
 });
});
