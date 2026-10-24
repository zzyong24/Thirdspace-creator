import {expect,it} from 'vitest';
import {safeModelFailureMessage} from './error-diagnostics';
it('T1405 普通402不能被诊断为已确认额度不足，明确余额错误仍保留安全提示',()=>{
 const spec={displayModelKey:'channel-managed' as const};
 expect(safeModelFailureMessage({status:402,message:'payment declined token=synthetic-private'},spec)).not.toContain('额度不足');
 expect(safeModelFailureMessage({status:402,message:'payment declined token=synthetic-private'},spec)).not.toContain('synthetic-private');
 expect(safeModelFailureMessage({status:402,code:'AI_CREDIT_EXHAUSTED'},spec)).toContain('额度不足');
 expect(safeModelFailureMessage({status:429,message:'too many requests'},spec)).not.toContain('额度不足');
});
