import {codexCapabilityReasonSchema} from '@creatoros/contract/execution-worker';
/** 只解释实际受控协议原因，不根据正文猜测能力，不暴露上游异常。 */
export function codexCapabilityExplanation(reason:unknown):string|null{
 const parsed=codexCapabilityReasonSchema.safeParse(reason);if(!parsed.success)return null;
 if(parsed.data==='CODEX_LOGIN_REQUIRED')return '请先登录本地 Codex，然后重新检查';
 if(parsed.data==='CODEX_IMAGE_CAPABILITY_UNAVAILABLE'||parsed.data==='CODEX_IMAGE_MODEL_UNAVAILABLE')return '当前 Codex 尚未提供所需图片能力，请检查 Codex 登录或可用能力';
 if(parsed.data==='CODEX_VERSION_UNSUPPORTED'||parsed.data==='CODEX_RUNTIME_UNAVAILABLE'||parsed.data==='CODEX_PLATFORM_UNSUPPORTED')return '本地 Codex 运行环境暂不可用，请检查安装状态';
 return '本地 Codex 能力暂未核验通过，请稍后重新检查';
}
