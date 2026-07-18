/**
 * [T-332 S4] 未选号错误的用户文案翻译(SPEC §4.2:AccountRequiredError 前端翻译成
 * 选号/绑定引导,不是红色技术报错)。
 *
 * 判定消费 S3 的结构化链路:backend AccountRequiredError → dispatch 428(code 进
 * envelope)→ HttpTransportError.code → `isAccountRequiredError`(http-transport,
 * 按 code/name 判,跨 bundle 稳定)。本模块只负责「判定 → 中文引导文案」这一层,
 * 供各 island 的 catch 分支复用,避免每处各写一遍。
 */

import { describeUserError } from "@/lib/ai-error-humanize";
import { isAccountRequiredError } from "@/lib/http-transport";

/** 未选号写操作的统一引导文案(§4.2:引导,不是报错)。 */
export const ACCOUNT_REQUIRED_MESSAGE =
  "请先选择账号:在左下角的账号切换器里绑定/选择一个抖音号,再进行此操作。";

/**
 * 把 client 写路径的错误翻译成用户可读文案:
 *  - AccountRequiredError → 选号引导(固定文案);
 *  - 其它 → describeUserError 收口成人话(AI 码 / 结构化码 → 人话,识别不出回退
 *    fallback),**绝不**裸吐后端 message / 技术码。
 */
export function translateClientError(err: unknown, fallback: string): string {
  if (isAccountRequiredError(err)) return ACCOUNT_REQUIRED_MESSAGE;
  return describeUserError(err, fallback);
}
