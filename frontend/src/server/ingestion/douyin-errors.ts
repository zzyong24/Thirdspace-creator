import "server-only";

// [T-326 B-04] douyin-cdp 的错误类抽到这个**零依赖叶子模块**:
//   persistence-client 里有同步的 `err instanceof DouyinNotLoggedInError` 判别点
//   (runner 注入的 isNotLoggedInError 谓词是同步函数,不能 await 动态 import),
//   而 douyin-cdp 本体已改为运行时懒加载(动态 import 移到调用点,不再进任何路由的
//   静态编译图)。错误类身份必须全局唯一(instanceof 语义),所以两边都从这里拿:
//   douyin-cdp.ts re-export 保持既有 import 路径全部兼容。

/** 未登录抖音创作者中心 —— 调用方据此提示用户先「登录抖音」(弹窗扫码),区别于真正抓取失败。 */
export class DouyinNotLoggedInError extends Error {
  constructor() {
    super("DouyinNotLoggedInError: 未检测到抖音创作者中心登录态,请先扫码登录");
    this.name = "DouyinNotLoggedInError";
  }
}

/** 页面命中验证码/人机校验。新内容雷达严格路径必须把它标为 blocked，不能折叠成合法空数组。 */
export class DouyinCaptchaError extends Error {
  constructor() {
    super("DouyinCaptchaError: 抖音页面要求完成验证码或人机校验");
    this.name = "DouyinCaptchaError";
  }
}
