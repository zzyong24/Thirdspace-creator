// T-147 P5 桌面激活授权 —— 运行时「是否跑在桌面壳里」判别。
//
// 背景(子代理核实):现无任何**运行时**桌面信号 —— `CREATOROS_DESKTOP` 原本只在 build 期
//   存在(next.config.ts 决定 output:standalone);sidecar 与 web-prod 部署都是 NODE_ENV=production,
//   单靠 NODE_ENV 区分不了。故 P5b 让 Rust lib.rs 在 spawn sidecar 时**额外注入运行时** env
//   `CREATOROS_DESKTOP=1`,node 侧读它。
//
// 这是激活门「只桌面拦、web/dev 跳」的唯一判据 —— web/dev 永远 false → 门不触发 → 主应用照常。

export function isDesktopRuntime(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return env.CREATOROS_DESKTOP === "1";
}
