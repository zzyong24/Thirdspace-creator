import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
const io=vi.hoisted(()=>({fetch:vi.fn(),invoke:vi.fn(),fresh:vi.fn(),group:'group-a',account:'platform-filter'}));
vi.mock('@/lib/http-transport',async original=>({...await original<typeof import('@/lib/http-transport')>(),fetchCreatorApi:io.fetch,readCurrentGroupId:()=>io.group,readCurrentAccountId:()=>io.account}));
vi.mock('@tauri-apps/api/core',()=>({invoke:io.invoke}));
vi.mock('@/features/copilot/assistant-engine',()=>({refreshModelRoutingAfterUpgrade:io.fresh}));
const token='enc:v1:'+btoa('public-synthetic-owner-token'),scope={groupId:'group-a',accountId:null};
const reply=(action:string,patch:Record<string,unknown>={},withToken=true)=>Response.json({contractVersion:'creatoros-legacy-model-upgrade-v1',action,phase:action==='probe'?'credentials':action==='fulfill'?'fulfillment':'configuration',outcome:'ready',reasonCode:'UPGRADE_READY',bindingStatus:'verified',entitlementStatus:'ready',configurationStatus:action==='sync'?'ready':'not_started',retryable:false,...patch},{headers:withToken?{'x-creatoros-upgrade-observation':token}:{}});
const missing=()=>reply('probe',{outcome:'pending',reasonCode:'UPGRADE_ENTITLEMENT_NOT_READY',entitlementStatus:'unknown',retryable:true});
const binding=()=>reply('probe',{phase:'proof',outcome:'restore_required',reasonCode:'UPGRADE_BINDING_RECHECK_REQUIRED',bindingStatus:'unverified',entitlementStatus:'not_started'});
const unknown=(action='probe')=>reply(action,{outcome:'unknown',reasonCode:'UPGRADE_ENTITLEMENT_UNKNOWN',entitlementStatus:'unknown',retryable:true});
const service=(withToken=true)=>reply('probe',{phase:'proof',outcome:'unknown',reasonCode:'UPGRADE_SERVICE_UNAVAILABLE',bindingStatus:'unverified',entitlementStatus:'not_started',retryable:true},withToken);
const native=(patch:Record<string,unknown>={})=>({contractVersion:'creatoros-license-restore-result-v1',status:'ready',reasonCode:'RESTORE_READY',bindingStatus:'verified',persistence:'confirmed',retryable:false,...patch});
const actions=()=>io.fetch.mock.calls.map(call=>new Headers(call[1]?.headers).get('x-creatoros-upgrade-action'));
const flush=async()=>{for(let i=0;i<30;i++)await Promise.resolve();};
beforeEach(()=>{vi.resetModules();io.fetch.mockReset();io.invoke.mockReset();io.fresh.mockReset().mockResolvedValue(undefined);io.group='group-a';io.account='platform-filter';Object.defineProperty(window,'__TAURI_INTERNALS__',{value:{},configurable:true});});
afterEach(()=>{vi.useRealTimers();delete (window as unknown as Record<string,unknown>).__TAURI_INTERNALS__;});
describe('T1423无感协调器（本地mock，不调用真实IPC/模型/钱包）',()=>{
 it('无需设置按钮，已有钱包只probe/sync/fresh GET，广播成功且不写来源',async()=>{
  const m=await import('./automatic-license-upgrade'),synced=vi.fn();window.addEventListener('creatoros:client-config-synced',synced);
  io.fetch.mockResolvedValueOnce(reply('probe')).mockResolvedValueOnce(reply('sync'));
  await m.ensureAutomaticLicenseUpgrade(scope);expect(actions()).toEqual(['probe','sync']);expect(io.invoke).not.toHaveBeenCalled();expect(io.fresh).toHaveBeenCalledTimes(1);expect(m.readAutomaticLicenseUpgrade()).toMatchObject({scopeKey:'group:group-a',status:'ready',entitlementReady:true,configurationReady:true,successRevision:1});expect(synced).toHaveBeenCalledTimes(1);
  for(const call of io.fetch.mock.calls){expect(new Headers(call[1].headers).get('x-creatoros-upgrade-mode')).toBe('automatic');expect(call[1].body).toBeUndefined();}
  expect(new Headers(io.fetch.mock.calls[1][1].headers).get('x-creatoros-upgrade-observation')).toBe(token);window.removeEventListener('creatoros:client-config-synced',synced);
 });
 it('首次404不假定未开户，但同原观察只fulfill一次',async()=>{
  const m=await import('./automatic-license-upgrade');io.fetch.mockResolvedValueOnce(missing()).mockResolvedValueOnce(reply('fulfill')).mockResolvedValueOnce(reply('sync'));await m.ensureAutomaticLicenseUpgrade(scope);await m.ensureAutomaticLicenseUpgrade(scope);expect(actions()).toEqual(['probe','fulfill','sync']);
 });
 it('缺绑定只native一次且仅opaque，checked后freshproof再同步',async()=>{
  const m=await import('./automatic-license-upgrade');io.fetch.mockResolvedValueOnce(binding()).mockResolvedValueOnce(reply('probe')).mockResolvedValueOnce(reply('sync'));io.invoke.mockResolvedValue(native());await m.ensureAutomaticLicenseUpgrade(scope);expect(io.invoke.mock.calls).toEqual([['license_restore_saved',{observationToken:token}]]);expect(actions()).toEqual(['probe','probe','sync']);
 });
 it.each(['RESTORE_CONTINUE_REQUIRED','RESTORE_STORAGE_UNCONFIRMED'])('native unknown %s即使freshproof ready仍禁sync/整体成功',async(reasonCode)=>{
  const m=await import('./automatic-license-upgrade');io.fetch.mockResolvedValueOnce(binding()).mockResolvedValueOnce(reply('probe'));io.invoke.mockResolvedValue(native({status:'unknown',reasonCode,bindingStatus:reasonCode==='RESTORE_STORAGE_UNCONFIRMED'?'verified':'unverified',persistence:reasonCode==='RESTORE_STORAGE_UNCONFIRMED'?'unknown':'unchanged',retryable:true}));await m.ensureAutomaticLicenseUpgrade(scope);await m.ensureAutomaticLicenseUpgrade(scope);expect(actions()).toEqual(['probe','probe']);expect(io.invoke).toHaveBeenCalledTimes(1);expect(io.fresh).not.toHaveBeenCalled();expect(m.readAutomaticLicenseUpgrade()).toMatchObject({status:'pending',configurationReady:false,successRevision:0});
 });
 it('native unknown后只读probe跨父截止，仍保binding未知门而非普通配置fallback',async()=>{
  vi.useFakeTimers();const m=await import('./automatic-license-upgrade');io.fetch.mockResolvedValueOnce(binding()).mockImplementationOnce(()=>new Promise(()=>{}));io.invoke.mockResolvedValue(native({status:'unknown',reasonCode:'RESTORE_STORAGE_UNCONFIRMED',persistence:'unknown',retryable:true}));const work=m.ensureAutomaticLicenseUpgrade(scope);await flush();await vi.advanceTimersByTimeAsync(730000);await work;expect(actions()).toEqual(['probe','probe']);expect(m.readAutomaticLicenseUpgrade()).toMatchObject({status:'pending',phase:'binding',reasonCode:'RESTORE_STORAGE_UNCONFIRMED',successRevision:0});
 });
 it('首响应丢失/其他realm无token pending，不重复无头probe或占native guard',async()=>{
  const m=await import('./automatic-license-upgrade');io.fetch.mockResolvedValue(service(false));await m.ensureAutomaticLicenseUpgrade(scope);await m.ensureAutomaticLicenseUpgrade(scope);expect(io.fetch).toHaveBeenCalledTimes(1);expect(io.invoke).not.toHaveBeenCalled();expect(m.readAutomaticLicenseUpgrade().status).toBe('pending');
 });
 it('初次409经济unknown只读核对仍404也不能fulfill',async()=>{
  const m=await import('./automatic-license-upgrade');io.fetch.mockResolvedValueOnce(unknown()).mockResolvedValueOnce(missing());await m.ensureAutomaticLicenseUpgrade(scope);expect(actions()).toEqual(['probe','probe']);expect(m.readAutomaticLicenseUpgrade().status).toBe('pending');
 });
 it('fulfill丢响应只probe原结果，仍未知停止且重复ensure不重发',async()=>{
  const m=await import('./automatic-license-upgrade');io.fetch.mockResolvedValueOnce(missing()).mockResolvedValueOnce(unknown('fulfill')).mockResolvedValueOnce(missing());await m.ensureAutomaticLicenseUpgrade(scope);await m.ensureAutomaticLicenseUpgrade(scope);expect(actions()).toEqual(['probe','fulfill','probe']);expect(m.readAutomaticLicenseUpgrade().successRevision).toBe(0);
 });
 it('实际fetch丢响应不把已发fulfill变成未开始，仍只读原结果',async()=>{
  const m=await import('./automatic-license-upgrade');io.fetch.mockResolvedValueOnce(missing()).mockRejectedValueOnce(Error('controlled lost response')).mockResolvedValueOnce(missing());await m.ensureAutomaticLicenseUpgrade(scope);await m.ensureAutomaticLicenseUpgrade(scope);expect(actions()).toEqual(['probe','fulfill','probe']);expect(m.readAutomaticLicenseUpgrade()).toMatchObject({status:'pending',successRevision:0});
 });
 it('经济unknown只读后已linked才可sync',async()=>{
  const m=await import('./automatic-license-upgrade');io.fetch.mockResolvedValueOnce(unknown()).mockResolvedValueOnce(reply('probe')).mockResolvedValueOnce(reply('sync'));await m.ensureAutomaticLicenseUpgrade(scope);expect(actions()).toEqual(['probe','probe','sync']);expect(m.readAutomaticLicenseUpgrade().status).toBe('ready');
 });
 it('配置partial有限续读只sync；fresh GET失败不得报ready',async()=>{
  vi.useFakeTimers();const m=await import('./automatic-license-upgrade');io.fetch.mockResolvedValueOnce(reply('probe')).mockResolvedValueOnce(reply('sync',{outcome:'pending',reasonCode:'UPGRADE_CONFIGURATION_PENDING',configurationStatus:'pending',retryable:true})).mockResolvedValueOnce(reply('sync'));io.fresh.mockRejectedValue(Error('controlled GET failure'));
  const work=m.ensureAutomaticLicenseUpgrade(scope);await flush();await vi.advanceTimersByTimeAsync(1000);await work;expect(actions()).toEqual(['probe','sync','sync']);expect(m.readAutomaticLicenseUpgrade()).toMatchObject({status:'pending',entitlementReady:true,configurationReady:false,successRevision:0});
 });
 it('双ensure/显示退订/重挂共原promise，不取消在途native',async()=>{
  const m=await import('./automatic-license-upgrade');let finish!:(v:unknown)=>void;io.fetch.mockResolvedValueOnce(binding()).mockResolvedValueOnce(reply('probe')).mockResolvedValueOnce(reply('sync'));io.invoke.mockImplementation(()=>new Promise(r=>{finish=r}));
  const listener=vi.fn(),unsub=m.subscribeAutomaticLicenseUpgrade(listener),first=m.ensureAutomaticLicenseUpgrade(scope);await flush();expect(io.invoke).toHaveBeenCalledTimes(1);unsub();const second=m.ensureAutomaticLicenseUpgrade(scope);expect(second).toBe(first);finish(native());await first;expect(m.readAutomaticLicenseUpgrade().status).toBe('ready');expect(io.invoke).toHaveBeenCalledTimes(1);
 });
 it('切scope后native迟到不写新scope；原guard收尾前新scope不invoke',async()=>{
  const m=await import('./automatic-license-upgrade');let finish!:(v:unknown)=>void;io.fetch.mockResolvedValue(binding());io.invoke.mockImplementation(()=>new Promise(r=>{finish=r}));const old=m.ensureAutomaticLicenseUpgrade(scope);await flush();io.group='group-b';m.invalidateAutomaticLicenseUpgradeScope(scope);const next=m.ensureAutomaticLicenseUpgrade({groupId:'group-b',accountId:null});await next;expect(io.invoke).toHaveBeenCalledTimes(1);const before=io.fetch.mock.calls.length;finish(native());await old;expect(io.fetch).toHaveBeenCalledTimes(before);expect(m.readAutomaticLicenseUpgrade()).toMatchObject({scopeKey:'group:group-b',status:'pending',successRevision:0});
 });
 it('切回已失效owner只显示本scope待核对，不借另一scope状态或重新取token',async()=>{
  const m=await import('./automatic-license-upgrade');io.fetch.mockImplementation(async(_url,init)=>new Headers(init.headers).get('x-creatoros-upgrade-action')==='probe'?reply('probe'):reply('sync'));await m.ensureAutomaticLicenseUpgrade(scope);io.group='group-b';m.invalidateAutomaticLicenseUpgradeScope(scope);const other={groupId:'group-b',accountId:null};await m.ensureAutomaticLicenseUpgrade(other);const count=io.fetch.mock.calls.length;io.group='group-a';m.invalidateAutomaticLicenseUpgradeScope(other);await m.ensureAutomaticLicenseUpgrade(scope);expect(io.fetch).toHaveBeenCalledTimes(count);expect(m.readAutomaticLicenseUpgrade()).toMatchObject({scopeKey:'group:group-a',status:'pending',configurationReady:false});
 });
 it('最初730000父截止覆盖进入native，超时仍不重复底层IPC',async()=>{
  vi.useFakeTimers();const m=await import('./automatic-license-upgrade');let response!:(v:Response)=>void,finish!:(v:unknown)=>void;io.fetch.mockImplementationOnce(()=>new Promise(r=>{response=r}));io.invoke.mockImplementation(()=>new Promise(r=>{finish=r}));const work=m.ensureAutomaticLicenseUpgrade(scope);await vi.advanceTimersByTimeAsync(600000);response(binding());await flush();await vi.advanceTimersByTimeAsync(130000);await work;expect(m.readAutomaticLicenseUpgrade().status).toBe('pending');await m.ensureAutomaticLicenseUpgrade(scope);expect(io.invoke).toHaveBeenCalledTimes(1);finish(native());await flush();expect(actions()).toEqual(['probe']);
 });
 it('配置迟到729秒只剩1秒，有限退避不续父deadline',async()=>{
  vi.useFakeTimers();const m=await import('./automatic-license-upgrade');let response!:(v:Response)=>void;io.fetch.mockResolvedValueOnce(reply('probe')).mockImplementationOnce(()=>new Promise(r=>{response=r}));const work=m.ensureAutomaticLicenseUpgrade(scope);await flush();await vi.advanceTimersByTimeAsync(729000);response(reply('sync',{outcome:'pending',reasonCode:'UPGRADE_CONFIGURATION_PENDING',configurationStatus:'pending',retryable:true}));await flush();await vi.advanceTimersByTimeAsync(1000);await work;expect(actions()).toEqual(['probe','sync']);expect(m.readAutomaticLicenseUpgrade()).toMatchObject({status:'pending',entitlementReady:true,successRevision:0});
 });
 it('native已存但runtime拒绝，不继续经济链',async()=>{
  const m=await import('./automatic-license-upgrade');io.fetch.mockResolvedValue(binding());io.invoke.mockResolvedValue(native({status:'blocked',reasonCode:'RESTORE_RESPONSE_UNVERIFIED'}));await m.ensureAutomaticLicenseUpgrade(scope);expect(actions()).toEqual(['probe']);expect(io.fresh).not.toHaveBeenCalled();expect(m.readAutomaticLicenseUpgrade().status).toBe('blocked');
 });
 it('token/身份失效不静默换token，旧epoch结果不进入sync',async()=>{
  const m=await import('./automatic-license-upgrade');io.fetch.mockResolvedValueOnce(missing()).mockResolvedValueOnce(reply('fulfill',{outcome:'blocked',reasonCode:'UPGRADE_IDENTITY_CHANGED',bindingStatus:'unverified',entitlementStatus:'unknown'}));await m.ensureAutomaticLicenseUpgrade(scope);expect(actions()).toEqual(['probe','fulfill']);expect(io.fresh).not.toHaveBeenCalled();expect(m.readAutomaticLicenseUpgrade().status).toBe('blocked');
 });
 it('有token的暂时proof失败沿同观察有限退避只读，不重新无头申请',async()=>{
  vi.useFakeTimers();const m=await import('./automatic-license-upgrade');io.fetch.mockResolvedValueOnce(service()).mockResolvedValueOnce(reply('probe')).mockResolvedValueOnce(reply('sync'));const work=m.ensureAutomaticLicenseUpgrade(scope);await flush();await vi.advanceTimersByTimeAsync(1000);await work;expect(actions()).toEqual(['probe','probe','sync']);expect(new Headers(io.fetch.mock.calls[1][1].headers).get('x-creatoros-upgrade-observation')).toBe(token);
 });
 it('非desktop零副作用且SSR默认对象稳定，group规范忽略平台筛选',async()=>{
  delete (window as unknown as Record<string,unknown>).__TAURI_INTERNALS__;const m=await import('./automatic-license-upgrade');await m.ensureAutomaticLicenseUpgrade(scope);expect(io.fetch).not.toHaveBeenCalled();expect(io.invoke).not.toHaveBeenCalled();expect(m.AUTOMATIC_UPGRADE_SERVER_STATE).toBe(m.AUTOMATIC_UPGRADE_SERVER_STATE);expect(m.automaticUpgradeScopeKey({groupId:'group-a',accountId:'ignored'})).toBe('group:group-a');
 });
});
