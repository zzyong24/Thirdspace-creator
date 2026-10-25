import {CHANNEL_MODEL_PAYMENT_REQUIRED_MESSAGE} from '@creatoros/contract/provider-error-detail';

/** SEMANTIC_BOUNDARY_ALLOW: 仅识别引擎协议错误码并输出安全提示，不判断创作语义或保留原始异常。 */
export function modelEngineUnavailableMessage(code: string): string | undefined {
  if (code === 'CHANNEL_MODEL_PAYMENT_REQUIRED') return CHANNEL_MODEL_PAYMENT_REQUIRED_MESSAGE;
  if (code === 'AI_CREDIT_EXHAUSTED') return 'AI 额度不足，请在设置中核对额度或充值；处理后继续原任务，不必重新发送消息';
  if (code === 'CODEX_LOGIN_REQUIRED') return 'AI 引擎未登录，请先在设置中登录 Codex 后继续原任务';
  if (['CODEX_RUNTIME_UNAVAILABLE','CODEX_STATUS_UNAVAILABLE','CODEX_VERSION_UNSUPPORTED','CODEX_PLATFORM_UNSUPPORTED'].includes(code))
    return 'Codex 引擎暂不可用，请在设置中检查引擎状态后继续原任务';
  if (['CODEX_CAPABILITY_UNAVAILABLE','CODEX_CAPABILITY_UNVERIFIED','CODEX_IMAGE_CAPABILITY_UNAVAILABLE','CODEX_IMAGE_MODEL_UNAVAILABLE'].includes(code))
    return '当前 Codex 引擎无法使用所需能力，请在设置中检查模型能力后继续原任务';
  return undefined;
}

export function findModelEngineUnavailable(error: unknown): {code: string; message: string} | undefined {
  const seen=new Set<unknown>();
  let current=error;
  for(let depth=0;depth<6&&current&&typeof current==='object'&&!seen.has(current);depth++){
    seen.add(current);
    const record=current as {code?:unknown;errorCode?:unknown;details?:{domainCode?:unknown};message?:unknown;cause?:unknown};
    const codes=[record.details?.domainCode,record.code,record.errorCode];
    if(typeof record.message==='string')codes.push(...[...record.message.matchAll(/\bCODEX_[A-Z_]+\b/g)].map(match=>match[0]));
    for(const code of codes){
      if(typeof code!=='string')continue;
      const message=modelEngineUnavailableMessage(code);
      if(message)return {code,message};
    }
    current=record.cause;
  }
  return undefined;
}
