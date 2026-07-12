"use client";

// [T-241→T-252] 桌面外链 —— 借力 tauri-plugin-opener **官方注入脚本**,本组件只做「补位」。
//
// 演进史(防回退):
//  - T-241 v1:捕获期拦全部跨域链接 → 自己动态 import plugin-opener 调 openUrl,失败降级
//    window.open。真机(build8)实测**仍不跳**:自研链任一环运行时失败即静默(window.open 被
//    webview 吞),且捕获期 stopPropagation 顺带废掉了官方脚本 —— 双输。
//  - T-252 v2(现):opener 插件自带全局注入脚本(二进制实证:自动拦 `target="_blank"` 的
//    <a> 并 invoke plugin:opener|open_url,与 Rust 端同源零版本风险)。本组件**不再自己
//    invoke、不再 preventDefault/stopPropagation**:
//      · target="_blank" 的链接 → 完全放行,官方脚本负责开系统浏览器;
//      · **没有** target 的跨域 http(s) 链接 → 捕获期只把 anchor.target 补成 "_blank"
//        后放行 —— 官方脚本在冒泡期读的是实时属性,能接住(webview 对 _blank 的默认
//        新窗行为本就被 Tauri 抑制,不会真开窗)。
//  仅桌面运行时启用;web 浏览器 target=_blank 本就正常。
import * as React from "react";

import { isDesktopRuntimeClient } from "@/lib/desktop-updater";

export function ExternalLinkOpener(): null {
  React.useEffect(() => {
    if (!isDesktopRuntimeClient()) return;
    const onClick = (e: MouseEvent) => {
      const target = e.target as Element | null;
      const anchor = target?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!anchor) return;
      const href = anchor.href;
      if (!/^https?:\/\//i.test(href)) return;
      let url: URL;
      try {
        url = new URL(href);
      } catch {
        return;
      }
      if (url.origin === window.location.origin) return; // 站内导航放行
      // 跨域外链:确保 target=_blank,让官方 opener 脚本(冒泡期)接管。绝不 preventDefault。
      if (anchor.target !== "_blank") anchor.target = "_blank";
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);
  return null;
}
