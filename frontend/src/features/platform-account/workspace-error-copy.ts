import {describeUserError} from '@/lib/ai-error-humanize';
/** SEMANTIC_BOUNDARY_ALLOW: 仅拆固定transport错误封装，复用诊断文案防泄漏规则，不判断业务或创作内容。 */
export function workspaceErrorCopy(error:unknown,fallback:string):string{
 const raw=error instanceof Error?error.message:typeof error==='string'?error:'';
 const wrapped=raw.match(/^HttpTransport: \d+ for [^:]+: ([\s\S]+)$/);
 return describeUserError(wrapped?new Error(wrapped[1]):error,fallback);
}
