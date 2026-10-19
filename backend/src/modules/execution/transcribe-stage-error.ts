/** 只翻译取消/期限异常；上游原错误正文可能含凭据，不直接投影到作品卡片。 */
export function transcribePreparationError(error:unknown,signal:AbortSignal,deadlineAt:number|null):unknown{
 if(!(error instanceof Error)||!['AbortError','TimeoutError'].includes(error.name))return error;
 const expired=deadlineAt!==null&&Date.now()>=deadlineAt;
 const timeout=expired||error.name==='TimeoutError';
 const message=expired?'原转录任务的总等待时间已用完，请重试':timeout?'素材准备超时，请检查网络或登录状态后重试':'素材准备已中止，请检查任务状态后重试';
 // 旧transcript-runner只投影error.name，保留其契约也能显示可操作原因。
 return Object.assign(new Error(message),{name:message,code:timeout?'TRANSCRIBE_PREPARATION_TIMEOUT':signal.aborted?'TRANSCRIBE_PREPARATION_CANCELLED':'TRANSCRIBE_PREPARATION_ABORTED'});
}
