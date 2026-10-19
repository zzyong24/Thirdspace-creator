import "server-only";
import {createCipheriv,createDecipheriv,createHash,createPublicKey,randomBytes,verify} from "node:crypto";
import {chmod,mkdir,open,readFile,rename,unlink} from "node:fs/promises";
import {dirname,join} from "node:path";
import {isDeepStrictEqual} from "node:util";
import {resolveMasterKey} from "@creatoros/backend";
import {resolveChannelCapabilityRoute} from "@creatoros/backend/modules/ai-runtime";
import {executionTimeoutMs} from "@creatoros/contract/timeout-policy";
import {resolveActivationConfig} from "./activation-config";
import {readLicenseVerdictDetailed,resolveLicenseFilePath} from "./license-file.server";
import {assertVerdictProductIdentity} from "./product-identity.server";
import {ClientConfigPullError,type ActivationIncludedCreditResult,type ChannelModelAuthority,type ChannelModelJson,type ClientConfigProjection} from "./client-config.server";

const POLICY="creatoros-formal-model-20261017-v1",PROOF="model-benefit-proof-v1";
const PURPOSE="creatoros-model-benefit-cache-v1",MAX_BYTES=300_000;
const DIGEST=/^sha256:[a-f0-9]{64}$/;
// 桌面sidecar为唯一宿主进程。新命令撤销旧观察者提交资格；已开始的磁盘/服务写必须
// 收尾后才让下一提交进入，不能释放锁后让旧rename/Key写追过新结果。
let observationGeneration=0;
let commitTail:Promise<void>=Promise.resolve();
async function commitInOrder<T>(run:()=>Promise<T>):Promise<T>{
  const previous=commitTail;let release!:()=>void;commitTail=new Promise<void>(resolve=>{release=resolve});
  await previous;try{return await run()}finally{release()}
}
export type ModelBenefitScope={readonly kind:"channel";readonly channelRef:string}|{readonly kind:"unassigned"};
type Authority={policyId:typeof POLICY;projectKey:"creatoros";sourceChannelRef:string|null;modelScope:ModelBenefitScope;entitlementBindingHash:string;authorizationVersion:number;proofDigest:string;expiresAt:string};
type ProofClaims=Omit<Authority,"proofDigest">&{machineBindingDigest:string;nonce:string;issuedAt:string;jti:string;type:string;contractVersion:string;issuer:string;audience:string;purpose:string};
type Directory=Authority&{contractVersion:string;configurationSourceChannelRef:"official";configurationSource:{packageRef:string;revision:number;configDigest:string};payload:ChannelModelJson;payloadDigest:string;bundleDigest:string;keyId:string;signature:string};
type CredentialStates=Readonly<Record<string,{status:"ready"|"not_configured"|"unverified"|"unavailable";reasonCode:string|null;accountStatus?:"ready"|"not_configured"|"unverified"}>>;
export type ModelBenefitCache={schema:typeof PURPOSE;licenseDigest:string;directory:Directory;managedCredentials:CredentialStates};
export interface ModelBenefitStore{load():Promise<ModelBenefitCache|null>;save(record:ModelBenefitCache):Promise<void>}
export type ModelBenefitDependencies={
  env?:Record<string,string|undefined>;now?:()=>Date;nonce?:()=>string;fetchImpl?:typeof fetch;
  readVerdict?:typeof readLicenseVerdictDetailed;signal?:AbortSignal;expectedScopeId?:string;
  modelBenefitStore?:ModelBenefitStore;putManagedCredential?:(scopeId:string,serviceId:string,token:string)=>Promise<void>;
};
function fail(code:string,message:string,retryable=false):never{throw new ClientConfigPullError(code,message,retryable)}
function exact(value:unknown,keys:readonly string[]):value is Record<string,unknown>{
  return !!value&&typeof value==="object"&&!Array.isArray(value)&&Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
}
function canonical(value:unknown):string{
  if(value===null||typeof value==="boolean"||typeof value==="string")return JSON.stringify(value);
  if(typeof value==="number"&&Number.isFinite(value))return JSON.stringify(value);
  if(Array.isArray(value))return `[${value.map(canonical).join(",")}]`;
  if(value&&typeof value==="object")return `{${Object.keys(value).sort().map(key=>`${JSON.stringify(key)}:${canonical((value as Record<string,unknown>)[key])}`).join(",")}}`;
  return fail("CLIENT_CONFIG_INVALID","官方模型响应格式无法验证");
}
const digest=(value:string)=>`sha256:${createHash("sha256").update(value).digest("hex")}`;
function utc(value:unknown):number{
  if(typeof value!=="string"||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)||!Number.isFinite(Date.parse(value))||new Date(value).toISOString()!==value)fail("CLIENT_CONFIG_INVALID","官方模型有效期无法验证");
  return Date.parse(value);
}
function live(signal?:AbortSignal){if(signal?.aborted)throw new DOMException("已停止等待，原权益仍可重新核对","AbortError")}
function origin(raw:string|undefined):URL{
  let url:URL;try{url=new URL(raw??"")}catch{return fail("CLIENT_CONFIG_PENDING","官方模型服务尚未配置",true)}
  if(url.protocol!=="https:"||url.username||url.password||url.port||url.pathname!=="/"||url.search||url.hash)fail("CLIENT_CONFIG_PENDING","官方模型服务地址无法验证");
  return url;
}
function publicKey(raw:string|undefined){
  const bytes=Buffer.from(raw??"","base64");if(bytes.length!==32||bytes.toString("base64")!==raw)fail("CLIENT_CONFIG_SIGNATURE_INVALID","官方模型校验材料尚未就绪");
  return createPublicKey({key:Buffer.concat([Buffer.from("302a300506032b6570032100","hex"),bytes]),format:"der",type:"spki"});
}
function decoded(segment:string):unknown{
  if(!/^[A-Za-z0-9_-]+$/.test(segment))fail("CLIENT_CONFIG_AUTHORITY_INVALID","授权证明无法验证");
  const bytes=Buffer.from(segment,"base64url"),text=bytes.toString("utf8");let value:unknown;
  try{value=JSON.parse(text)}catch{return fail("CLIENT_CONFIG_AUTHORITY_INVALID","授权证明无法验证")}
  if(bytes.toString("base64url")!==segment||!Buffer.from(text).equals(bytes)||canonical(value)!==text)fail("CLIENT_CONFIG_AUTHORITY_INVALID","授权证明编码无法验证");
  return value;
}
const AUTHORITY_KEYS=["policyId","projectKey","sourceChannelRef","modelScope","entitlementBindingHash","authorizationVersion","proofDigest","expiresAt"] as const;
function assertAuthority(row:Record<string,unknown>){
  const scope=row.modelScope,channel=row.sourceChannelRef;
  const validChannel=typeof channel==="string"&&channel.length>0&&channel.length<=128&&channel===channel.trim()&&!/[\u0000-\u001f\u007f-\u009f*]/.test(channel);
  if(row.policyId!==POLICY||row.projectKey!=="creatoros"||typeof row.entitlementBindingHash!=="string"||!DIGEST.test(row.entitlementBindingHash)||
    !Number.isSafeInteger(row.authorizationVersion)||(row.authorizationVersion as number)<1||
    !(channel===null?exact(scope,["kind"])&&scope.kind==="unassigned":validChannel&&exact(scope,["kind","channelRef"])&&scope.kind==="channel"&&scope.channelRef===channel))fail("CLIENT_CONFIG_IDENTITY_MISMATCH","官方模型授权范围无法验证");
}
function verifyProof(token:unknown,nonce:string,env:Record<string,string|undefined>,now:Date):ProofClaims{
  if(typeof token!=="string"||token.length>16384)fail("CLIENT_CONFIG_AUTHORITY_INVALID","授权证明无法验证");
  const parts=token.split(".");if(parts.length!==3)fail("CLIENT_CONFIG_AUTHORITY_INVALID","授权证明无法验证");
  const header=decoded(parts[0]!),claims=decoded(parts[1]!);
  if(!exact(header,["alg","kid","typ"])||header.alg!=="EdDSA"||header.typ!=="TS-MODEL-BENEFIT-PROOF"||header.kid!==(env.CREATOROS_MODEL_BENEFIT_KEY_ID??"am-license-2026-01")||
    !exact(claims,["type","contractVersion","issuer","audience","purpose","policyId","projectKey","sourceChannelRef","modelScope","entitlementBindingHash","authorizationVersion","machineBindingDigest","nonce","jti","issuedAt","expiresAt"])||
    claims.type!=="model-benefit-proof"||claims.contractVersion!==PROOF||claims.issuer!=="activation-manager"||claims.audience!=="growth.model-benefit"||claims.purpose!=="model-benefit"||claims.nonce!==nonce||
    typeof claims.machineBindingDigest!=="string"||!DIGEST.test(claims.machineBindingDigest)||typeof claims.jti!=="string"||!/^[0-7][0-9A-HJKMNP-TV-Z]{25}$/.test(claims.jti))fail("CLIENT_CONFIG_AUTHORITY_INVALID","授权证明无法验证");
  assertAuthority(claims);
  const issued=utc(claims.issuedAt),expires=utc(claims.expiresAt),signature=Buffer.from(parts[2]!,"base64url");
  if(signature.length!==64||signature.toString("base64url")!==parts[2]||!verify(null,Buffer.from(`${parts[0]}.${parts[1]}`),publicKey(env.CREATOROS_LICENSE_PUBLIC_KEY_B64),signature)||
    issued>now.getTime()+30000||expires<=issued||expires-issued>300000||expires<=now.getTime())fail("CLIENT_CONFIG_AUTHORITY_INVALID","授权证明已过期或无法验证，请重新核对",true);
  return claims as unknown as ProofClaims;
}
async function jsonResponse(response:Response){
  if(response.status>=300&&response.status<400)fail("CLIENT_CONFIG_INVALID","官方模型响应需要重新核验",true);
  if(!/(?:^|,)\s*(?:private,\s*)?no-store(?:\s*,|$)/i.test(response.headers.get("cache-control")??"")||!(response.headers.get("content-type")??"").toLowerCase().startsWith("application/json"))fail("CLIENT_CONFIG_INVALID","官方模型响应无法验证");
  const declared=response.headers.get("content-length");
  if(declared!==null&&(!/^\d+$/.test(declared)||Number(declared)>MAX_BYTES))fail("CLIENT_CONFIG_INVALID","官方模型响应过大");
  const chunks:Buffer[]=[];let total=0;const reader=response.body?.getReader();
  if(reader)try{for(;;){const part=await reader.read();if(part.done)break;total+=part.value.length;if(total>MAX_BYTES)fail("CLIENT_CONFIG_INVALID","官方模型响应过大");chunks.push(Buffer.from(part.value))}}finally{await reader.cancel().catch(()=>undefined)}
  const bytes=Buffer.concat(chunks);
  let value:unknown;try{value=JSON.parse(bytes.toString("utf8"))}catch{return fail("CLIENT_CONFIG_INVALID","官方模型响应无法验证")}
  if(response.status<200||response.status>=300){
    if(!exact(value,["error"])||!exact(value.error,["code","message"])||typeof value.error.code!=="string")fail("CLIENT_CONFIG_INVALID","官方模型错误响应无法验证");
    fail(value.error.code,response.status===409?"原权益仍在确认中，可稍后恢复或先使用自配模型":response.status===404?"官方模型账户尚未就绪，请恢复已含额度或先使用自配模型":"官方模型核验暂未完成，请重新核对或先使用自配模型",response.status>=500||[404,409,410].includes(response.status));
  }
  return value;
}
async function fetchObserved(deps:ModelBenefitDependencies,url:URL,init:RequestInit){
  live(deps.signal);let response:Response;
  try{response=await (deps.fetchImpl??fetch)(url.toString(),{...init,redirect:"manual",cache:"no-store",signal:deps.signal?AbortSignal.any([deps.signal,AbortSignal.timeout(executionTimeoutMs(120000))]):AbortSignal.timeout(executionTimeoutMs(120000))})}
  catch(error){live(deps.signal);if((error as {name?:string})?.name==="AbortError")throw error;return fail("CLIENT_CONFIG_NETWORK_UNAVAILABLE","官方模型确认尚未完成，可重试原权益或使用自配模型",true)}
  live(deps.signal);return response;
}
async function currentLicense(deps:ModelBenefitDependencies){
  const env=deps.env??process.env,result=await (deps.readVerdict??readLicenseVerdictDetailed)(),v=result.verdict;
  if(env.CREATOROS_CLIENT_CONFIG_PULL_ENABLED!=="1"||result.state!=="ready"||!v?.allowed||!v.code||!v.machineId||v.projectKey!=="creatoros")fail("CLIENT_CONFIG_LICENSE_UNAVAILABLE","当前没有可用的正式模型授权");
  assertVerdictProductIdentity(v.projectKey,env);
  return {verdict:v,licenseDigest:digest(canonical(["creatoros-model-benefit-license-v1",v.projectKey,v.code,v.machineId,v.channelRef??null]))};
}
export function deriveModelBenefitScopeId(row:Pick<Authority,"projectKey"|"entitlementBindingHash"|"modelScope"|"authorizationVersion">){
  return createHash("sha256").update(canonical(["creatoros-model-benefit-scope-v1",row.projectKey,row.entitlementBindingHash,row.modelScope,row.authorizationVersion,"creatoros.desktop"])).digest("hex");
}
async function access(deps:ModelBenefitDependencies){
  const generation=++observationGeneration;
  const env=deps.env??process.env,{verdict,licenseDigest}=await currentLicense(deps),nonce=(deps.nonce??(()=>randomBytes(18).toString("base64url")))();
  if(generation!==observationGeneration)fail("MODEL_ROUTE_IDENTITY_CHANGED","已有新的模型核验操作，请查看当前结果",true);
  if(!/^[A-Za-z0-9._:-]{16,128}$/.test(nonce))fail("CLIENT_CONFIG_AUTHORITY_INVALID","授权核验标识无效");
  const response=await fetchObserved(deps,new URL("/api/license/model-benefit-proofs",origin(resolveActivationConfig(env).baseUrl)),{method:"POST",headers:{Accept:"application/json","Content-Type":"application/json"},body:JSON.stringify({contractVersion:PROOF,projectKey:verdict.projectKey,code:verdict.code,machineId:verdict.machineId,nonce})});
  const raw=await jsonResponse(response);if(!exact(raw,["contractVersion","modelBenefitProof"])||raw.contractVersion!==PROOF)fail("CLIENT_CONFIG_AUTHORITY_INVALID","授权证明响应无法验证");
  if(generation!==observationGeneration)fail("MODEL_ROUTE_IDENTITY_CHANGED","已有新的模型核验操作，请查看当前结果",true);
  const claims=verifyProof(raw.modelBenefitProof,nonce,env,(deps.now??(()=>new Date()))());
  if(claims.sourceChannelRef!==(verdict.channelRef??null))fail("CLIENT_CONFIG_IDENTITY_MISMATCH","当前授权渠道已变化，请重新核对");
  const scopeId=deriveModelBenefitScopeId(claims);
  if(deps.expectedScopeId!==undefined&&deps.expectedScopeId!==scopeId)fail("MODEL_ROUTE_IDENTITY_CHANGED","模型授权范围已变化，请重试当前任务");
  return {env,claims,proof:raw.modelBenefitProof as string,scopeId,licenseDigest,generation,growthOrigin:origin(env.CREATOROS_GROWTH_CLIENT_CONFIG_ORIGIN)};
}
async function assertCurrent(deps:ModelBenefitDependencies,identity:Awaited<ReturnType<typeof access>>){
  live(deps.signal);const current=await currentLicense(deps);
  if(identity.generation!==observationGeneration||current.licenseDigest!==identity.licenseDigest)fail("MODEL_ROUTE_IDENTITY_CHANGED","授权或当前核验操作已变化，请查看当前结果");
  live(deps.signal);if(utc(identity.claims.expiresAt)<=(deps.now??(()=>new Date()))().getTime())fail("CLIENT_CONFIG_ACCESS_EXPIRED","本次核验已过期，请重新核对",true);
}
async function post(deps:ModelBenefitDependencies,identity:Awaited<ReturnType<typeof access>>,action:string,idempotencyKey?:string){
  await assertCurrent(deps,identity);
  return fetchObserved(deps,new URL(`/api/client/model-benefits/${action}`,identity.growthOrigin),{method:"POST",headers:{Accept:"application/json","Content-Type":"application/json","Idempotency-Key":idempotencyKey??randomBytes(18).toString("base64url")},body:JSON.stringify({contractVersion:"growth-model-benefit-request-v1",modelBenefitProof:identity.proof})});
}
function verifyIdentity(row:Record<string,unknown>,identity:Awaited<ReturnType<typeof access>>,now:Date){
  assertAuthority(row);
  for(const key of ["policyId","projectKey","sourceChannelRef","modelScope","entitlementBindingHash","authorizationVersion"] as const)if(canonical(row[key])!==canonical(identity.claims[key]))fail("CLIENT_CONFIG_IDENTITY_MISMATCH","官方模型返回了另一授权的配置");
  if(row.proofDigest!==digest(identity.proof)||utc(row.expiresAt)>utc(identity.claims.expiresAt)||utc(row.expiresAt)<=now.getTime())fail("CLIENT_CONFIG_ACCESS_EXPIRED","本次官方模型核验已过期，请重新核对",true);
}
// SEMANTIC_BOUNDARY_ALLOW: 只禁止公共目录携带私有凭据，不判断模型创作含义。
function noSecrets(value:unknown):boolean{
  if(!value||typeof value!=="object")return true;
  if(Array.isArray(value))return value.every(noSecrets);
  return Object.entries(value).every(([key,child])=>!new Set(["token","apikey","api_key","password","authorization","secret","modelbenefitproof"]).has(key.toLowerCase())&&noSecrets(child));
}
function validateDirectory(raw:unknown,env:Record<string,string|undefined>,now:Date):Directory{
  if(!exact(raw,["contractVersion",...AUTHORITY_KEYS,"configurationSourceChannelRef","configurationSource","payload","payloadDigest","bundleDigest","keyId","signature"])||raw.contractVersion!=="growth-model-benefit-directory-v1"||raw.configurationSourceChannelRef!=="official"||
    !exact(raw.configurationSource,["packageRef","revision","configDigest"])||typeof raw.configurationSource.packageRef!=="string"||!raw.configurationSource.packageRef.length||!Number.isSafeInteger(raw.configurationSource.revision)||(raw.configurationSource.revision as number)<1||typeof raw.configurationSource.configDigest!=="string"||!DIGEST.test(raw.configurationSource.configDigest)||
    !raw.payload||typeof raw.payload!=="object"||Array.isArray(raw.payload)||!noSecrets(raw.payload)||typeof raw.payloadDigest!=="string"||raw.payloadDigest!==digest(canonical(raw.payload))||typeof raw.bundleDigest!=="string"||!DIGEST.test(raw.bundleDigest)||
    raw.keyId!==env.CREATOROS_GROWTH_CONFIG_KEY_ID||typeof raw.signature!=="string"||!resolveChannelCapabilityRoute(raw.payload as ChannelModelJson,"default"))fail("CLIENT_CONFIG_INVALID","官方模型目录无法验证");
  assertAuthority(raw);if(typeof raw.proofDigest!=="string"||!DIGEST.test(raw.proofDigest)||utc(raw.expiresAt)<=now.getTime())fail("CLIENT_CONFIG_ACCESS_EXPIRED","官方模型目录已过期，请重新同步",true);
  const semantic={...raw};delete semantic.bundleDigest;delete semantic.keyId;delete semantic.signature;
  const signature=Buffer.from(raw.signature,"base64url");
  if(raw.bundleDigest!==digest(canonical(semantic))||signature.length!==64||signature.toString("base64url")!==raw.signature||!verify(null,Buffer.from(canonical({...semantic,bundleDigest:raw.bundleDigest,keyId:raw.keyId})),publicKey(env.CREATOROS_GROWTH_CONFIG_PUBLIC_KEY_B64),signature))fail("CLIENT_CONFIG_SIGNATURE_INVALID","官方模型目录签名无法验证");
  return raw as unknown as Directory;
}
function credential(raw:unknown,identity:Awaited<ReturnType<typeof access>>,now:Date){
  if(!exact(raw,["contractVersion",...AUTHORITY_KEYS,"serviceId","credential","includedCredit","wallet"])||raw.contractVersion!=="growth-model-benefit-credential-v1"||raw.serviceId!=="omnihi-main"||
    !exact(raw.credential,["type","token","tokenPrefix"])||raw.credential.type!=="api_key"||typeof raw.credential.token!=="string"||!raw.credential.token.trim()||typeof raw.credential.tokenPrefix!=="string"||
    !exact(raw.includedCredit,["amount","currency"])||raw.includedCredit.currency!=="CNY"||!["string","number"].includes(typeof raw.includedCredit.amount)||!Number.isFinite(Number(raw.includedCredit.amount))||Number(raw.includedCredit.amount)<0||
    !exact(raw.wallet,["linked","availableUnits","referenceId"])||!(raw.wallet.linked===true&&typeof raw.wallet.availableUnits==="number"&&Number.isSafeInteger(raw.wallet.availableUnits)&&raw.wallet.availableUnits>=0&&typeof raw.wallet.referenceId==="string"&&/^AICA-[A-Za-z0-9_-]{6,96}$/.test(raw.wallet.referenceId)||raw.wallet.linked===false&&raw.wallet.availableUnits===null&&raw.wallet.referenceId===null))fail("CLIENT_CONFIG_INVALID","官方模型凭据无法验证");
  verifyIdentity(raw,identity,now);
  return {token:raw.credential.token as string,linked:raw.wallet.linked===true};
}
export class EncryptedModelBenefitStore implements ModelBenefitStore{
  constructor(private readonly path:string,private readonly key:Buffer){}
  async load():Promise<ModelBenefitCache|null>{
    let value:string;try{value=await readFile(this.path,"utf8")}catch(error){if((error as NodeJS.ErrnoException).code==="ENOENT")return null;throw error}
    try{const bytes=Buffer.from(value,"base64"),decipher=createDecipheriv("aes-256-gcm",this.key,bytes.subarray(0,12));decipher.setAAD(Buffer.from(PURPOSE));decipher.setAuthTag(bytes.subarray(12,28));const data=JSON.parse(Buffer.concat([decipher.update(bytes.subarray(28)),decipher.final()]).toString("utf8"));if(!exact(data,["schema","licenseDigest","directory","managedCredentials"])||data.schema!==PURPOSE||typeof data.licenseDigest!=="string"||!DIGEST.test(data.licenseDigest))throw Error("invalid cache");return data as ModelBenefitCache}catch{return fail("CLIENT_CONFIG_STORAGE_UNAVAILABLE","官方模型缓存无法读取，请重新核对",true)}
  }
  async save(record:ModelBenefitCache){
    const iv=randomBytes(12),cipher=createCipheriv("aes-256-gcm",this.key,iv);cipher.setAAD(Buffer.from(PURPOSE));const encrypted=Buffer.concat([cipher.update(JSON.stringify(record)),cipher.final()]),value=Buffer.concat([iv,cipher.getAuthTag(),encrypted]).toString("base64");
    await mkdir(dirname(this.path),{recursive:true,mode:0o700});const temp=`${this.path}.${randomBytes(8).toString("hex")}.tmp`;
    let replaced=false;
    try{const file=await open(temp,"wx",0o600);try{await file.writeFile(value);await file.sync()}finally{await file.close()}await rename(temp,this.path);replaced=true;await chmod(this.path,0o600);if(process.platform!=="win32"){const directory=await open(dirname(this.path),"r");try{await directory.sync()}finally{await directory.close()}}if(!isDeepStrictEqual(await this.load(),record))throw Error("cache readback mismatch")}
    catch{await unlink(temp).catch(()=>undefined);if(replaced){
      // 原子替换已发生不能谎称旧文件仍在，也不回滚覆盖可能的另一合法提交。
      // 认证重读只判断现文件可读；本次仍报告持久确认不确定，下一次fresh同步可恢复。
      await this.load().catch(()=>null);
      fail("CLIENT_CONFIG_STORAGE_UNCERTAIN","本机保存结果还需核对，请重新同步；已有密钥与个人选择保持",true);
    }fail("CLIENT_CONFIG_STORAGE_UNAVAILABLE","本机保存未完成，原配置保留，请稍后重试",true)}
  }
}
function store(deps:ModelBenefitDependencies,licenseDigest:string):ModelBenefitStore{
  if(deps.modelBenefitStore)return deps.modelBenefitStore;
  const env=deps.env??process.env,path=resolveLicenseFilePath(env),master=resolveMasterKey(env);
  if(!path||master.degraded||master.key.length!==32)fail("CLIENT_CONFIG_STORAGE_UNAVAILABLE","本机官方模型存储尚未就绪",true);
  return new EncryptedModelBenefitStore(join(dirname(path),".model-benefit-config",`${licenseDigest.slice(7)}.cache`),createHash("sha256").update(master.key).update(PURPOSE).digest());
}
type ModelBenefitReadSnapshot={identity:Awaited<ReturnType<typeof access>>;directory:Directory;pendingToken:string|undefined;linked:boolean;managedCredentials:CredentialStates};
type ModelBenefitReadFlight={controller:AbortController;promise:Promise<ModelBenefitReadSnapshot>;observers:number;settled:boolean};
const modelBenefitReadFlights=new Map<string,ModelBenefitReadFlight>();
async function fetchModelBenefitReadSnapshot(deps:ModelBenefitDependencies):Promise<ModelBenefitReadSnapshot>{
  const identity=await access(deps),response=await post(deps,identity,"directory"),raw=await jsonResponse(response),now=(deps.now??(()=>new Date()))();
  const directory=validateDirectory(raw,identity.env,now);verifyIdentity(raw as Record<string,unknown>,identity,now);
  let managedCredentials:CredentialStates={"omnihi-main":{status:"not_configured",reasonCode:"MODEL_CREDENTIAL_NOT_CONFIGURED"}};
  let pendingToken:string|undefined,linked=false;
  try{const result=credential(await jsonResponse(await post(deps,identity,"credentials")),identity,(deps.now??(()=>new Date()))());pendingToken=result.token;linked=result.linked}
  catch(error){live(deps.signal);if(!(error instanceof ClientConfigPullError)||!["MODEL_CREDENTIAL_NOT_CONFIGURED","MODEL_CREDENTIAL_PROVISIONING","AI_CREDIT_BOOTSTRAP_PENDING","CLIENT_CONFIG_NETWORK_UNAVAILABLE"].includes(error.code))throw error;managedCredentials={"omnihi-main":{status:error.code==="MODEL_CREDENTIAL_NOT_CONFIGURED"?"not_configured":"unverified",reasonCode:error.code}}}
  return {identity,directory,pendingToken,linked,managedCredentials};
}
async function observeModelBenefitRead<T>(deps:ModelBenefitDependencies,consume:(snapshot:ModelBenefitReadSnapshot)=>Promise<T>):Promise<T>{
  live(deps.signal);const current=await currentLicense(deps),key=current.licenseDigest;live(deps.signal);
  let flight=modelBenefitReadFlights.get(key);
  if(!flight){
    const controller=new AbortController(),signal=AbortSignal.any([controller.signal,AbortSignal.timeout(executionTimeoutMs(370000))]);
    const promise=fetchModelBenefitReadSnapshot({...deps,signal,expectedScopeId:undefined,putManagedCredential:undefined});
    const created:ModelBenefitReadFlight={controller,promise,observers:0,settled:false};
    flight=created;modelBenefitReadFlights.set(key,created);
    const settled=()=>{created.settled=true;if(created.observers===0&&modelBenefitReadFlights.get(key)===created)modelBenefitReadFlights.delete(key)};
    void promise.then(settled,settled);
  }
  const active=flight;active.observers++;let released=false;
  const release=()=>{if(released)return;released=true;active.observers--;if(active.observers===0){active.controller.abort();if(modelBenefitReadFlights.get(key)===active)modelBenefitReadFlights.delete(key)}};
  let abort!:()=>void;const canceled=new Promise<never>((_,reject)=>{abort=()=>{release();reject(new DOMException("已停止等待，原权益仍可重新核对","AbortError"))};deps.signal?.addEventListener("abort",abort,{once:true});if(deps.signal?.aborted)abort()});
  const work=active.promise.then(async(snapshot)=>{live(deps.signal);if(snapshot.identity.licenseDigest!==current.licenseDigest||deps.expectedScopeId!==undefined&&deps.expectedScopeId!==snapshot.identity.scopeId)fail("MODEL_ROUTE_IDENTITY_CHANGED","当前模型授权已变化，请重新尝试");await assertCurrent(deps,snapshot.identity);return consume(snapshot)});
  try{return await Promise.race([work,canceled])}finally{deps.signal?.removeEventListener("abort",abort);release()}
}
export async function refreshModelBenefits(deps:ModelBenefitDependencies={}):Promise<ClientConfigProjection>{
  return observeModelBenefitRead(deps,async({identity,directory,pendingToken,linked,managedCredentials:initialStates})=>{
    const managedCredentials:CredentialStates=pendingToken?{"omnihi-main":{status:deps.putManagedCredential?"ready":"unverified",reasonCode:deps.putManagedCredential?null:"MODEL_CREDENTIAL_NOT_STORED",accountStatus:linked?"ready":"not_configured"}}:initialStates;
    await commitInOrder(async()=>{
      await assertCurrent(deps,identity);
      if(pendingToken&&deps.putManagedCredential)await deps.putManagedCredential(identity.scopeId,"omnihi-main",pendingToken);
      await assertCurrent(deps,identity);
      await store(deps,identity.licenseDigest).save({schema:PURPOSE,licenseDigest:identity.licenseDigest,directory,managedCredentials});
      await assertCurrent(deps,identity);
    });
    return {authority:"channel",outcome:"configured",action:"官方模型已同步，个人模型选择保持不变",retryable:false};
  });
}
/** 仅在原owner锁前调用；事务内只消费已准备snapshot，不在此引入DB/自HTTP。 */
export async function ensureModelBenefitAuthority(deps:ModelBenefitDependencies,hasCredential:(scopeId:string)=>Promise<boolean>):Promise<ChannelModelAuthority>{
  live(deps.signal);const controller=new AbortController();
  const signal=deps.signal?AbortSignal.any([deps.signal,controller.signal]):controller.signal;
  let timer:ReturnType<typeof setTimeout>|undefined;
  // 只限定本次普通操作的观察等待；共享后台flight的原截止不随加入者延长。
  const expired=new Promise<never>((_,reject)=>{timer=setTimeout(()=>{
    reject(new ClientConfigPullError("MODEL_BENEFIT_REFRESH_PENDING","官方模型暂未核对完成，输入已保留。请核对原任务后再继续，或切换自配模型。",true));
    controller.abort();
  },executionTimeoutMs(120000));});
  try{return await Promise.race([ensureModelBenefitAuthorityWithinBudget({...deps,signal},hasCredential),expired])}
  finally{if(timer!==undefined)clearTimeout(timer)}
}
async function ensureModelBenefitAuthorityWithinBudget(deps:ModelBenefitDependencies,hasCredential:(scopeId:string)=>Promise<boolean>):Promise<ChannelModelAuthority>{
  live(deps.signal);const observed=await currentLicense(deps),cached=await readModelBenefitAuthority(deps);
  if(cached.authority==="channel"&&deps.expectedScopeId!==undefined&&cached.scopeId!==deps.expectedScopeId)fail("MODEL_ROUTE_IDENTITY_CHANGED","原模型授权范围已变化，请重试当前任务");
  if(cached.authority==="channel"&&await hasCredential(cached.scopeId)){live(deps.signal);if((await currentLicense(deps)).licenseDigest!==observed.licenseDigest)fail("MODEL_ROUTE_IDENTITY_CHANGED","当前模型授权已变化，请重试当前操作");return cached}
  try{await refreshModelBenefits(deps);const authority=await readModelBenefitAuthority(deps);if(authority.authority==="local"&&authority.outcome==="security_error")return authority;if(authority.authority==="channel"&&await hasCredential(authority.scopeId)){live(deps.signal);if((await currentLicense(deps)).licenseDigest!==observed.licenseDigest)fail("MODEL_ROUTE_IDENTITY_CHANGED","当前模型授权已变化，请重试当前操作");return authority}return {authority:"local",outcome:"unreachable",payload:null}}
  catch(error){live(deps.signal);
    // SEMANTIC_BOUNDARY_ALLOW: 仅协议明确的临时不可用可交原安全退路；非法证明/目录/身份保持拒绝。
    if(error instanceof ClientConfigPullError&&["MODEL_CREDENTIAL_NOT_CONFIGURED","MODEL_CREDENTIAL_PROVISIONING","AI_CREDIT_BOOTSTRAP_PENDING","CLIENT_CONFIG_NETWORK_UNAVAILABLE","MODEL_BENEFIT_REFRESH_PENDING"].includes(error.code))return {authority:"local",outcome:"unreachable",payload:null};
    throw error}
}
export async function fulfillModelBenefits(deps:ModelBenefitDependencies={}):Promise<ActivationIncludedCreditResult>{
  try{const identity=await access(deps);const result=credential(await jsonResponse(await post(deps,identity,"fulfill")),identity,(deps.now??(()=>new Date()))());await assertCurrent(deps,identity);return result.linked?{status:"ready",action:"当前授权已含模型额度已就绪，已有余额保持不变",retryable:false}:{status:"pending",action:"原模型账户仍在恢复中，可重新核对或先使用自配模型",retryable:true}}
  catch(error){live(deps.signal);if(error instanceof ClientConfigPullError)return {status:error.retryable?"pending":"unavailable",action:error.message,retryable:error.retryable};throw error}
}
export async function readModelBenefitAuthority(deps:ModelBenefitDependencies={}):Promise<ChannelModelAuthority>{
  live(deps.signal);
  try{const env=deps.env??process.env,identity=await currentLicense(deps),record=await store(deps,identity.licenseDigest).load();if(!record||record.licenseDigest!==identity.licenseDigest)return {authority:"local",outcome:"unreachable",payload:null};
    const directory=validateDirectory(record.directory,env,(deps.now??(()=>new Date()))());if(directory.sourceChannelRef!==(identity.verdict.channelRef??null))return {authority:"local",outcome:"security_error",payload:null};
    if((await currentLicense(deps)).licenseDigest!==identity.licenseDigest)return {authority:"local",outcome:"security_error",payload:null};live(deps.signal);
    return {authority:"channel",sourceKind:"model_benefit",modelScope:directory.modelScope,outcome:"configured",scopeId:deriveModelBenefitScopeId(directory),payload:directory.payload,bundleDigest:directory.bundleDigest,managedCredentials:record.managedCredentials};
  }catch{live(deps.signal);return {authority:"local",outcome:"security_error",payload:null}}
}
export async function requestModelBenefitLink(deps:ModelBenefitDependencies={},idempotencyKey?:string){
  const identity=await access(deps),response=await post(deps,identity,"link-session",idempotencyKey);await assertCurrent(deps,identity);return {response,growthOrigin:identity.growthOrigin};
}
