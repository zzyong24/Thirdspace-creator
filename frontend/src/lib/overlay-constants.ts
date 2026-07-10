// Copilot overlay URL 的两个 query 常量 —— 故意放在 **无 `"use client"`** 的共享模块,
// 让 server component / client component 都能安全 import。
//
// 教训(2026-07-07):早期这两个 const 写在 components/overlays/overlay-controller.tsx
// (顶部带 `"use client"`)。server component 路径(如 copilot-deeplink.ts)import 后,Next.js
// RSC 把 client reference proxy 注入到 URLSearchParams.set(),URL 被序列化成一个「会抛错的函数」,
// 渲染出的 href 形如 `?function(){throw Error('Attempted to call ... from the server ...')}=...`,
// 点击后 OverlayController(只看 ?copilot=open)无法识别 → 「点了没反应」。
//
// 抽到本文件后,server / client 都拿到同一个字符串字面量,bug 消失;改值也只需改一处。

/** `?copilot=…` —— OverlayController 唯二识别的 query 名之一。 */
export const OVERLAY_QUERY_KEY = "copilot";

/** `copilot=open` —— OverlayController 据此渲染浮层;其他值视为关闭。 */
export const OVERLAY_OPEN_VALUE = "open";