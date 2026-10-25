/** WebView 只消费安全投影；许可、proof、钱包及Key均留在可信服务边界。 */
export const UPGRADE_CONTRACT = 'creatoros-legacy-model-upgrade-v1';
export const NATIVE_RESTORE_CONTRACT = 'creatoros-license-restore-result-v1';
export const UPGRADE_OBSERVATION_HEADER='x-creatoros-upgrade-observation';
export function parseUpgradeObservationToken(value:unknown):string{
  if(typeof value!=='string'||value.length>4096||!/^enc:v1:[A-Za-z0-9+/]+={0,2}$/.test(value))return invalid();
  return value;
}
export type UpgradeAction = 'probe' | 'fulfill' | 'sync';
const reasons = ['UPGRADE_READY','UPGRADE_BINDING_RECHECK_REQUIRED','UPGRADE_LICENSE_INELIGIBLE','UPGRADE_LICENSE_REVOKED','UPGRADE_IDENTITY_CHANGED','UPGRADE_AUTHORITY_UNVERIFIED','UPGRADE_ENTITLEMENT_NOT_READY','UPGRADE_WALLET_NOT_LINKED','UPGRADE_ENTITLEMENT_UNKNOWN','UPGRADE_EXISTING_OPERATION_PENDING','UPGRADE_CONFIGURATION_PENDING','UPGRADE_SERVICE_UNAVAILABLE'] as const;
export type UpgradeReason = typeof reasons[number];
export type LegacyUpgradeResult = {
  contractVersion: typeof UPGRADE_CONTRACT; action: UpgradeAction;
  phase: 'proof' | 'credentials' | 'fulfillment' | 'configuration';
  outcome: 'ready' | 'restore_required' | 'pending' | 'blocked' | 'unknown';
  reasonCode: UpgradeReason; bindingStatus: 'verified' | 'unverified';
  entitlementStatus: 'not_started' | 'ready' | 'pending' | 'unknown' | 'not_eligible';
  configurationStatus: 'not_started' | 'ready' | 'pending'; retryable: boolean;
};
const serverReasons = ['RESTORE_REQUEST_INVALID','RESTORE_BODY_TOO_LARGE','RESTORE_METHOD_NOT_ALLOWED','RESTORE_LICENSE_NOT_FOUND','RESTORE_PROJECT_DISABLED','RESTORE_LICENSE_REVOKED','RESTORE_NOT_PREVIOUSLY_ACTIVATED','RESTORE_UNSUPPORTED_LICENSE','RESTORE_LICENSE_EXPIRED','RESTORE_COUNT_DEPLETED','RESTORE_SCOPE_MISMATCH','RESTORE_ACTIVE_BINDING_CONFLICT','RESTORE_TARGET_BOUND_ELSEWHERE','RESTORE_BINDING_NOT_RECOVERABLE','RESTORE_STATE_CHANGED','RESTORE_HISTORY_INCOMPLETE','RESTORE_BINDING_UNAVAILABLE','RESTORE_SIGNING_UNAVAILABLE','RESTORE_UNAVAILABLE'] as const;
const localReasons = ['RESTORE_READY','RESTORE_IN_PROGRESS','RESTORE_CONTINUE_REQUIRED','RESTORE_LOCAL_LICENSE_UNAVAILABLE','RESTORE_IDENTITY_CHANGED','RESTORE_RESPONSE_UNVERIFIED','RESTORE_STORAGE_UNCONFIRMED','RESTORE_SERVICE_UNSUPPORTED'] as const;
export type NativeRestoreResult = {
  contractVersion: typeof NATIVE_RESTORE_CONTRACT;
  status: 'ready' | 'pending' | 'blocked' | 'unknown';
  reasonCode: typeof serverReasons[number] | typeof localReasons[number];
  bindingStatus: 'verified' | 'unverified'; persistence: 'confirmed' | 'unchanged' | 'unknown'; retryable: boolean;
};
export function isUpgradeAction(value: unknown): value is UpgradeAction { return value === 'probe' || value === 'fulfill' || value === 'sync'; }
function invalid(): never { throw new Error('升级结果无法安全核对，请继续核对原权益'); }
function exact(value: unknown, keys: string[]): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
}
export function parseNativeRestoreResult(value: unknown): NativeRestoreResult {
  if (!exact(value,['contractVersion','status','reasonCode','bindingStatus','persistence','retryable']) || value.contractVersion !== NATIVE_RESTORE_CONTRACT || typeof value.reasonCode !== 'string') return invalid();
  const {status,reasonCode:r,bindingStatus:b,persistence:p,retryable:t} = value;
  const transient = ['RESTORE_STATE_CHANGED','RESTORE_BINDING_UNAVAILABLE','RESTORE_SIGNING_UNAVAILABLE','RESTORE_UNAVAILABLE'].includes(r);
  const denied = (serverReasons as readonly string[]).includes(r);
  const preflight = ['RESTORE_LOCAL_LICENSE_UNAVAILABLE','RESTORE_IDENTITY_CHANGED','RESTORE_SERVICE_UNSUPPORTED','RESTORE_RESPONSE_UNVERIFIED'].includes(r);
  const valid = status === 'ready' && r === 'RESTORE_READY' && b === 'verified' && p === 'confirmed' && t === false
    || status === 'pending' && r === 'RESTORE_IN_PROGRESS' && b === 'unverified' && p === 'unchanged' && t === true
    || status === 'blocked' && b === 'unverified' && p === 'unchanged' && (preflight && t === false || denied && t === transient)
    || status === 'blocked' && r === 'RESTORE_STORAGE_UNCONFIRMED' && b === 'verified' && p === 'unchanged' && t === true
    || status === 'blocked' && r === 'RESTORE_RESPONSE_UNVERIFIED' && b === 'verified' && p === 'confirmed' && t === false
    || status === 'blocked' && r === 'RESTORE_CONTINUE_REQUIRED' && b === 'unverified' && p === 'unchanged' && t === true
    || status === 'unknown' && ['RESTORE_CONTINUE_REQUIRED','RESTORE_RESPONSE_UNVERIFIED'].includes(r) && b === 'unverified' && p === 'unchanged' && t === true
    || status === 'unknown' && r === 'RESTORE_STORAGE_UNCONFIRMED' && b === 'verified' && p === 'unknown' && t === true;
  if (!valid) return invalid();
  return value as NativeRestoreResult;
}
export function parseLegacyUpgradeResult(value: unknown, action: UpgradeAction): LegacyUpgradeResult {
  if (!exact(value,['contractVersion','action','phase','outcome','reasonCode','bindingStatus','entitlementStatus','configurationStatus','retryable']) || value.contractVersion !== UPGRADE_CONTRACT || value.action !== action || !isUpgradeAction(value.action) || !(reasons as readonly unknown[]).includes(value.reasonCode)) return invalid();
  const {phase,outcome:o,reasonCode:r,bindingStatus:b,entitlementStatus:e,configurationStatus:c,retryable:t} = value;
  const policy = r === 'UPGRADE_LICENSE_INELIGIBLE' || r === 'UPGRADE_LICENSE_REVOKED';
  const security = r === 'UPGRADE_IDENTITY_CHANGED' || r === 'UPGRADE_AUTHORITY_UNVERIFIED';
  let valid = false;
  if (phase === 'proof') valid = b === 'unverified' && c === 'not_started' && (
    o === 'restore_required' && r === 'UPGRADE_BINDING_RECHECK_REQUIRED' && e === 'not_started' && t === false
    || o === 'blocked' && policy && e === 'not_eligible' && t === false
    || o === 'blocked' && security && e === 'not_started' && t === false
    || o === 'unknown' && r === 'UPGRADE_SERVICE_UNAVAILABLE' && e === 'not_started' && t === true);
  else if (action === 'probe' && phase === 'credentials') valid = b === 'verified' && c === 'not_started' && (
    o === 'ready' && r === 'UPGRADE_READY' && e === 'ready' && t === false
    || o === 'pending' && r === 'UPGRADE_WALLET_NOT_LINKED' && e === 'pending' && t === true
    || o === 'pending' && r === 'UPGRADE_ENTITLEMENT_NOT_READY' && e === 'unknown' && t === true
    || o === 'unknown' && r === 'UPGRADE_ENTITLEMENT_UNKNOWN' && e === 'unknown' && t === true
    || o === 'blocked' && r === 'UPGRADE_EXISTING_OPERATION_PENDING' && e === 'pending' && t === true);
  else if (action === 'fulfill' && phase === 'fulfillment') valid = c === 'not_started' && (
    b === 'verified' && (o === 'ready' && r === 'UPGRADE_READY' && e === 'ready' && t === false
    || o === 'pending' && ['UPGRADE_WALLET_NOT_LINKED','UPGRADE_ENTITLEMENT_NOT_READY'].includes(String(r)) && e === 'pending' && t === true
    || o === 'unknown' && ['UPGRADE_ENTITLEMENT_UNKNOWN','UPGRADE_SERVICE_UNAVAILABLE'].includes(String(r)) && e === 'unknown' && t === true
    || o === 'blocked' && r === 'UPGRADE_EXISTING_OPERATION_PENDING' && e === 'pending' && t === true
    || o === 'blocked' && policy && e === 'not_eligible' && t === false)
    || b === 'unverified' && o === 'blocked' && security && e === 'unknown' && t === false);
  else if (action === 'sync' && phase === 'configuration') valid = (
    b === 'verified' && (o === 'ready' && r === 'UPGRADE_READY' && e === 'ready' && c === 'ready' && t === false
    || o === 'pending' && r === 'UPGRADE_CONFIGURATION_PENDING' && ['ready','pending','unknown'].includes(String(e)) && c === 'pending' && t === true)
    || b === 'unverified' && o === 'blocked' && security && e === 'unknown' && c === 'pending' && t === false);
  if (!valid) return invalid();
  return value as LegacyUpgradeResult;
}
