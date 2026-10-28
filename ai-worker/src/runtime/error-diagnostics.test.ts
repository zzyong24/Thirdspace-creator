import {expect,it} from 'vitest';
import {safeModelFailureMessage} from './error-diagnostics';
it('T1428 支付领域码保留固定说明，泛402不假定余额不足，自配不冒充官方',()=>{
 const error={code:'CHANNEL_MODEL_PAYMENT_REQUIRED',status:402,message:'private-provider private-model token=synthetic-private'};
 expect(safeModelFailureMessage(error,{displayModelKey:'channel-managed'})).toBe('官方模型服务返回支付或权益核验拒绝（HTTP 402）。请在设置查看 AI 额度与消耗，核对后继续原任务。');
 expect(safeModelFailureMessage({status:402,message:'payment required'})).not.toContain('官方');
});
it('T1426 普通402不能被诊断为已确认额度不足，明确余额错误仍保留安全提示',()=>{
 const spec={displayModelKey:'channel-managed' as const};
 expect(safeModelFailureMessage({status:402,message:'payment declined token=synthetic-private'},spec)).not.toContain('额度不足');
 expect(safeModelFailureMessage({status:402,message:'payment declined token=synthetic-private'},spec)).not.toContain('synthetic-private');
 expect(safeModelFailureMessage({status:402,code:'AI_CREDIT_EXHAUSTED'},spec)).toContain('额度不足');
 expect(safeModelFailureMessage({status:429,message:'too many requests'},spec)).not.toContain('额度不足');
});
