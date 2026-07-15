/**
 * [T-332 S4] 未选号错误的用户文案翻译(SPEC §4.2:AccountRequiredError 前端翻译成
 * 选号/绑定引导,不是红色技术报错)。
 *
 * 判定消费 S3 的结构化链路:backend AccountRequiredError → dispatch 428(code 进
 * envelope)→ HttpTransportError.code → `isAccountRequiredError`(http-transport,
 * 按 code/name 判,跨 bundle 稳定)。本模块只负责「判定 → 中文引导文案」这一层,
 * 供各 island 的 catch 分支复用,避免每处各写一遍。
 */

import { isAccountRequiredError } from "@/lib/http-transport";

/** 未选号写操作的统一引导文案(§4.2:引导,不是报错)。 */
export const ACCOUNT_REQUIRED_MESSAGE =
  "请先选择账号:在左下角的账号切换器里绑定/选择一个抖音号,再进行此操作。";

/**
 * 把 client 写路径的错误翻译成用户可读文案:
 *  - AccountRequiredError → 选号引导(固定文案);
 *  - 其它 → 透传后端 message(可判定信息别丢),空 message 回退 fallback。
 */
export function translateClientError(err: unknown, fallback: string): string {
  if (isAccountRequiredError(err)) return ACCOUNT_REQUIRED_MESSAGE;
  return err instanceof Error && err.message ? err.message : fallback;
}
