import {readFileSync,promises as fsPromises} from "node:fs";
import {mkdtemp,mkdir,readFile,rm,stat} from "node:fs/promises";
import {join,resolve} from "node:path";
import {randomBytes,generateKeyPairSync,sign,createHash} from "node:crypto";
import {afterEach,describe,expect,it,vi} from "vitest";
import {refreshClientConfig,readChannelModelAuthority,fulfillActivationIncludedCredit} from "./client-config.server";
import {EncryptedModelBenefitStore,deriveModelBenefitScopeId,requestModelBenefitLink,ensureModelBenefitAuthority,type ModelBenefitDependencies} from "./model-benefit.server";
import {pinModelAuthority} from "../task-model-authority";
import {createAiCreditPortalLink} from "./ai-credit-link.server";

const ROOT=resolve(process.cwd(),"..");
const growth=JSON.parse(readFileSync(join(ROOT,"docs/build/growth-t243/growth-consumer-cross-repo-samples.json"),"utf8"));
const activity=JSON.parse(readFileSync(join(ROOT,"docs/build/growth-t243/model-benefit-cross-repo-fixture.json"),"utf8"));
const dirs:string[]=[];afterEach(async()=>{await Promise.all(dirs.splice(0).map(dir=>rm(dir,{recursive:true,force:true})))});
async function fixture(name="unassigned") {
  await mkdir(join(ROOT,"tmp/growth-t243"),{recursive:true});const dir=await mkdtemp(join(ROOT,"tmp/growth-t243/consumer-"));dirs.push(dir);
  const row=growth.cases.find((c:{name:string})=>c.name===name),am=activity.cases.find((c:{name:string})=>c.name===name);
  const env={CREATOROS_MODEL_BENEFITS_ENABLED:"1",CREATOROS_CLIENT_CONFIG_PULL_ENABLED:"1",CREATOROS_LICENSE_BASE_URL:"https://activity.invalid",CREATOROS_LICENSE_PROJECT_KEY:"creatoros",CREATOROS_GROWTH_CLIENT_CONFIG_ORIGIN:"https://growth.invalid",CREATOROS_LICENSE_PUBLIC_KEY_B64:activity.publicKeyBase64,CREATOROS_MODEL_BENEFIT_KEY_ID:activity.kid,CREATOROS_GROWTH_CONFIG_KEY_ID:growth.growthSigner.keyId,CREATOROS_GROWTH_CONFIG_PUBLIC_KEY_B64:growth.growthSigner.publicKeyBase64};
  let verdict={v:1,allowed:true,status:"active",code:"LOCAL-SYNTHETIC-CODE",machineId:"synthetic-original-PC",projectKey:"creatoros",channelRef:row.directory.body.sourceChannelRef};
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
async function retimedFixture(){
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
  const row=structuredClone(path.endsWith("directory")?f.row.directory.body:f.row.credentials);row.proofDigest=hash(proof);row.expiresAt=claims.expiresAt;
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
