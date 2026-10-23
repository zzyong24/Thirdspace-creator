import {describe,it,expect} from 'vitest';
import {parseNativeRestoreResult,parseLegacyUpgradeResult} from './legacy-license-upgrade';

const native={contractVersion:'creatoros-license-restore-result-v1',status:'ready',reasonCode:'RESTORE_READY',bindingStatus:'verified',persistence:'confirmed',retryable:false};
const projection={contractVersion:'creatoros-legacy-model-upgrade-v1',action:'probe',phase:'credentials',outcome:'ready',reasonCode:'UPGRADE_READY',bindingStatus:'verified',entitlementStatus:'ready',configurationStatus:'not_started',retryable:false};
describe('T1402 closed安全投影',()=>{
 it('只接受准确成功元组，原生runtime拒绝允许已真实保存',()=>{
  expect(parseNativeRestoreResult(native)).toEqual(native);
  expect(parseNativeRestoreResult({...native,status:'blocked',reasonCode:'RESTORE_RESPONSE_UNVERIFIED'})).toMatchObject({status:'blocked',persistence:'confirmed'});
  expect(parseLegacyUpgradeResult(projection,'probe')).toEqual(projection);
 });
 it.each([{bindingStatus:'unverified'},{persistence:'unchanged'},{retryable:true},{code:'SYNTHETIC_SECRET'},{reasonCode:'UPSTREAM_CUSTOM_ACTION'},{status:'pending'}])('原生矛盾/扩展元组拒绝 %j',patch=>{
  expect(()=>parseNativeRestoreResult({...native,...patch})).toThrow();
 });
 it.each([{bindingStatus:'unverified'},{configurationStatus:'ready'},{phase:'configuration'},{action:'fulfill'},{retryable:true},{reasonCode:'UPSTREAM_CUSTOM_ACTION'},{credential:'secret'}])('TS矛盾/扩展元组拒绝 %j',patch=>{
  expect(()=>parseLegacyUpgradeResult({...projection,...patch},'probe')).toThrow();
 });
 it('404不冒充从未开户，绑定拒绝不冒ready',()=>{
  expect(parseLegacyUpgradeResult({...projection,outcome:'pending',reasonCode:'UPGRADE_ENTITLEMENT_NOT_READY',entitlementStatus:'unknown',retryable:true},'probe')).toMatchObject({entitlementStatus:'unknown'});
  expect(parseLegacyUpgradeResult({...projection,phase:'proof',outcome:'restore_required',reasonCode:'UPGRADE_BINDING_RECHECK_REQUIRED',bindingStatus:'unverified',entitlementStatus:'not_started'},'probe')).toMatchObject({outcome:'restore_required'});
 });
});
