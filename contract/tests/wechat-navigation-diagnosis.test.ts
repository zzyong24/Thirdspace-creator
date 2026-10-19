import {describe,expect,it,vi} from 'vitest';
import {REQUEST_OPERATION_IDS} from '../src/observability';
import {ENDPOINTS,getCliOperationPolicy,WORKSPACE_OPERATION_SCOPES,wechatNavigationDiagnosisResource} from '../src';
describe('T1364唯一canonical诊断契约',()=>{
 it('唯一新operation在安全观测TS/JSON穷尽库存各登记一次',async()=>{
  const id='accounts.wechatNavigation.diagnose';const {default:registry}=await vi.importActual<{default:{requestOperations:string[]}}>('../src/observability-registry.json');
  expect(REQUEST_OPERATION_IDS.filter(value=>value===id)).toEqual([id]);expect(registry.requestOperations.filter((value:string)=>value===id)).toEqual([id]);
 });
 it('strict params/body，固定route，group scope，write/gateway，不给任意浏览器输入',()=>{
  const endpoint=ENDPOINTS.diagnoseWechatNavigation;expect(endpoint).toMatchObject({id:'accounts.wechatNavigation.diagnose',method:'POST',path:'/accounts/:accountId/wechat-navigation-diagnosis'});
  expect(endpoint.params!.parse({accountId:'owned'})).toEqual({accountId:'owned'});expect(endpoint.params!.safeParse({accountId:'owned',profile:'/tmp/fake'}).success).toBe(false);
  expect(endpoint.body!.parse({})).toEqual({});for(const field of ['url','profile','selector','js','path','sink','expectedIdentity','timeoutMs','signal','trustedInvocationId'])expect(endpoint.body!.safeParse({[field]:'untrusted'}).success).toBe(false);
  expect(endpoint.query).toBeUndefined();expect(WORKSPACE_OPERATION_SCOPES[endpoint.id]).toBe('group');expect(getCliOperationPolicy(endpoint.id)).toMatchObject({effect:'write',confirmation:'apply',idempotency:'gateway',asyncTask:false});
 });
 it('公共索引拒绝路径/平台正文和任意宽结果',()=>{
  const valid={diagnosticRunId:'run',status:'completed',reasonCode:null,startedAt:'2026-10-19T00:00:00Z',deadlineAt:'2026-10-19T00:40:50Z',completedAt:'2026-10-19T00:02:00Z',scopeProofHash:'a'.repeat(64),identityMatched:true,sampleCount:2,screenshots:[],stop:{browserOpened:true,contextCloseStarted:true,physicalStopConfirmed:true,physicalStoppedAt:'2026-10-19T00:02:00Z',hostLeaseReleaseConfirmed:true,hostLeaseReleasedAt:'2026-10-19T00:02:00Z',stopPending:false}};
  expect(wechatNavigationDiagnosisResource.safeParse(valid).success).toBe(true);expect(wechatNavigationDiagnosisResource.safeParse({...valid,privatePath:'/tmp/private'}).success).toBe(false);expect(wechatNavigationDiagnosisResource.safeParse({...valid,sampleCount:33}).success).toBe(false);expect(wechatNavigationDiagnosisResource.safeParse({...valid,screenshots:[{phase:'identity_verified',status:'captured',artifactId:'opaque',sha256:'a'.repeat(64),menuCandidates:['private text']}]}).success).toBe(false);
 });
});
