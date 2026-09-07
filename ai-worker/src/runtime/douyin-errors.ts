/** 抖音登录错误的唯一类身份，宿主兼容出口与 Worker 共用。 */
export class DouyinNotLoggedInError extends Error {
  constructor() {
    super("DouyinNotLoggedInError: 未检测到抖音创作者中心登录态,请先扫码登录");
    this.name = "DouyinNotLoggedInError";
  }
}
