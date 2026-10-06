import {expect,it,vi} from 'vitest';
import {transcribePreparationError} from './transcribe-stage-error';
it('原deadline耗尽呈现期限原因，绝不输出上游敏感正文',()=>{
 const error=Object.assign(new Error('private upstream token'),{name:'AbortError'}),controller=new AbortController();controller.abort();
 expect(transcribePreparationError(error,controller.signal,Date.now()-1)).toMatchObject({code:'TRANSCRIBE_PREPARATION_TIMEOUT',name:'原转录任务的总等待时间已用完，请重试'});
});
it('子请求TimeoutError映射素材超时，正常错误保持原身份',()=>{
 const controller=new AbortController(),timeout=Object.assign(new Error('private'),{name:'TimeoutError'}),normal=new Error('source missing');
 expect(transcribePreparationError(timeout,controller.signal,null)).toMatchObject({code:'TRANSCRIBE_PREPARATION_TIMEOUT',message:'素材准备超时，请检查网络或登录状态后重试'});
 expect(transcribePreparationError(normal,controller.signal,null)).toBe(normal);
});
