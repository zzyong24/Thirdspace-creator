"use client";

// [T-241→T-252→T-257] 桌面外链 —— 显式调 opener 插件开系统浏览器。
//
// 演进史(防回退,每一版都真机踩过):
//  - T-241 v1:捕获期拦跨域链接 → 动态 import plugin-opener 调 openUrl,失败降级 window.open。
//    build8 实测不跳。事后归因(T-257 复查证伪):当时归因于「自研链运行时失败 + stopPropagation
//    废掉官方脚本」——但根因其实是 build8 期 opener 能力/依赖未齐,openUrl 静默 throw。
//  - T-252 v2:改为「只把 target 补成 _blank,让 opener 官方注入脚本接管」,自己不 invoke。
//    **T-257 真机证伪**:激活页(/activate,在 (creator) 外、根 layout 也没挂本组件)外链
//    完全不跳。若官方脚本真是 webview 级全局拦截,跟路由无关的激活页外链就该能开 —— 事实不能,
//    **反证 tauri-plugin-opener 并不自动注入 target=_blank 点击拦截**(init.d.ts 为空、Rust 侧
//    仅 opener::init() 无 initialization_script)。v2 等于什么都没做。
//  - T-257 v3(现):**显式 invoke**。权限已确认到位(opener:default 含 allow-open-url,已验)、
//    依赖已在(@tauri-apps/plugin-opener),动态 import 范式与 desktop-updater 同款(updater 真通
//    = 该范式在桌面端可用)。跨域 http(s) 外链 → preventDefault + openUrl(系统浏览器);站内
//    同源导航一律放行(webview 正常跳)。**挂载点上移到根 layout**,覆盖 /activate 等 (creator)
//    外的所有页面(见 app/layout.tsx)。
//  仅桌面运行时启用;web/dev 无 __TAURI_INTERNALS__ → 整体短路,外链走浏览器原生 target=_blank。
import * as React from "react";

import { isDesktopRuntimeClient } from "@/lib/desktop-updater";

export function ExternalLinkOpener(): null {
  React.useEffect(() => {
    if (!isDesktopRuntimeClient()) return;
    const onClick = (e: MouseEvent) => {
      // 已被其它处理器消费 / 修饰键(用户自己要新窗)/ 非左键 → 不插手。
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) {
        return;
      }
      const target = e.target as Element | null;
      const anchor = target?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!anchor) return;
      const href = anchor.href; // 解析后的绝对 URL
      if (!/^https?:\/\//i.test(href)) return; // mailto/tel/tauri:// 等非 http 不接管
      let url: URL;
      try {
        url = new URL(href);
      } catch {
        return;
      }
      if (url.origin === window.location.origin) return; // 站内同源导航放行(webview 正常跳)

      // 跨域外链:阻止 webview 默认(它对 target=_blank 开空白新窗后被 Tauri 抑制 = 什么都不发生),
      // 改为显式调 opener 插件开系统浏览器。动态 import(web/SSR import 即报错,故运行时按需)。
      e.preventDefault();
      void (async () => {
        try {
          const { openUrl } = await import("@tauri-apps/plugin-opener");
          await openUrl(href);
        } catch {
          // 兜底:极端情况下(插件缺失)退回 window.open,聊胜于无。
          try {
            window.open(href, "_blank", "noopener,noreferrer");
          } catch {
            /* 无能为力,静默 —— 不崩用户流程 */
          }
        }
      })();
    };
    // 捕获期:先于页面自有处理器拿到点击;不 stopPropagation(不阻断其它逻辑,evidence 显示
    // 无官方脚本会二次开,故无重复打开风险)。
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);
  return null;
}
