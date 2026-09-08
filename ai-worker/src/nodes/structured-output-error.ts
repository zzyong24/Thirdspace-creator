import { CompletionPolicyRuntimeError } from "../prompt/completion-policy";

/** 已收到模型响应，局部解析或输出验证耗尽；不代表供应商回执未知。 */
export class StructuredOutputError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "StructuredOutputError";
  }
}

/** 只识别已声明的本地输出错误，不按供应商消息猜测。调用方优先检查 GenerationFailure。 */
export function findStructuredOutputError(error:unknown): Error | undefined {
 const seen=new Set<unknown>();
 let current=error;
 while(current && typeof current==="object" && !seen.has(current)){
  if(current instanceof StructuredOutputError || current instanceof CompletionPolicyRuntimeError)return current;
  seen.add(current);
  current=(current as {cause?:unknown}).cause;
 }
 return undefined;
}
