import {expect,it} from 'vitest';
import {providerErrorDetail,redactProviderErrorDetail} from '../src/provider-error-detail';
import {workerPortInputSchemas} from '../src/internal/execution-worker';
it('拒绝结算与任务失败仅增加可选有限诊断，不放宽原状态合同',()=>{
 expect(workerPortInputSchemas.settleGenerationCall.parse({callId:'call',status:'rejected',errorDetail:'http_400: bad tool'})).toMatchObject({errorDetail:'http_400: bad tool'});
 expect(workerPortInputSchemas.commitResult.parse({outcome:'failed',errorCode:'http_400',errorMessage:'http_400: bad tool'})).toMatchObject({errorMessage:'http_400: bad tool'});
 expect(()=>workerPortInputSchemas.settleGenerationCall.parse({callId:'call',status:'rejected',errorDetail:'x'.repeat(513)})).toThrow();
 expect(()=>workerPortInputSchemas.settleGenerationCall.parse({callId:'call',status:'unknown',errorDetail:'bad tool'})).toThrow();
});
it('SDK状态前缀和JSON均只保留供应商消息码，脱敏在截断之前',()=>{
 const raw='400: '+JSON.stringify({error:{message:'invalid schema synthetic-opaque-credential',code:'invalid_request'},headers:{private:'private-fixture'}});
 expect(providerErrorDetail(400,raw,['synthetic-opaque-credential'])).toBe('http_400: invalid_request: invalid schema [REDACTED]');
 expect(redactProviderErrorDetail('x'.repeat(510)+'Bearer synthetic-opaque-credential')).not.toContain('synthetic-opaque-credential');
});
it.each([
 [{error:'insufficient balance'},'http_402: insufficient balance'],
 [{error:{type:'insufficient_quota',message:'余额不足'}},'http_402: insufficient_quota: 余额不足'],
 [{error:{code:'billing_check',type:'payment_required',message:'核对支付'}},'http_402: billing_check: payment_required: 核对支付'],
])('T1428 字符串error及error.type保留边界内分类事实：%j',(body,expected)=>{
 expect(providerErrorDetail(402,'402 '+JSON.stringify(body))).toBe(expected);
});
