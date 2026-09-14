import {formatErrorDiagnostic,safeModelFailureMessage} from './error-diagnostics';
import type {ModelSpec} from './provider-factory';
/** 仅用于诊断供应商流异常；不保留请求、响应正文、凭据或改变重试判定。 */
export function piProviderDiagnostic(spec:ModelSpec,message:string,facts:{statusCode?:number;output:boolean}){
 const redacted=spec.token?message.replaceAll(spec.token,'[REDACTED]'):message;
 const safe=safeModelFailureMessage(new Error(redacted),spec);
 return `[ai-model-stream] output=${facts.output} ${formatErrorDiagnostic(Object.assign(new Error(safe),{statusCode:facts.statusCode}))}`;
}
