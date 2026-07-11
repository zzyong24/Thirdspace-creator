"use client";

// [T-241] 桌面外链全局拦截 —— 治「所有链接点不进去」(用户真机实锤)。
//
// 根因:Tauri webview 默认**拒绝新窗口请求**(target=_blank 的外链点击被吞,既不开新窗
// 也不跳系统浏览器);capabilities 此前只授 shell:execute/kill(spawn sidecar),无 opener。
// 修:document 级 click 拦截(捕获期),命中「外部 http(s) 链接」→ preventDefault →
// tauri-plugin-opener openUrl 交系统默认浏览器。一处覆盖现有 10 处 target=_blank 及
// 未来新增外链,不逐处改(逐处改必漏,T-229 审计教训)。
//
// 边界:
//  - 仅桌面运行时启用(isDesktopRuntimeClient;web 浏览器 target=_blank 本就正常);
//  - 仅拦「跨 origin 的 http(s)」——站内路由(next Link/相对路径/同 origin)不碰;
//  - 动态 import 插件(web/SSR import 即因缺 __TAURI_INTERNALS__ 报错,同 desktop-updater 先例);
//  - openUrl 失败降级 window.open(best-effort,绝不让点击静默无反应)。
import * as React from "react";

import { isDesktopRuntimeClient } from "@/lib/desktop-updater";

export function ExternalLinkOpener(): null {
  React.useEffect(() => {
    if (!isDesktopRuntimeClient()) return;
    const onClick = (e: MouseEvent) => {
      const target = e.target as Element | null;
      const anchor = target?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!anchor) return;
      const href = anchor.href; // 浏览器已解析为绝对 URL
      if (!/^https?:\/\//i.test(href)) return;
      let url: URL;
      try {
        url = new URL(href);
      } catch {
        return;
      }
      // 同 origin = 站内导航(Next 路由/静态资源),放行不拦。
      if (url.origin === window.location.origin) return;
      e.preventDefault();
      e.stopPropagation();
      void (async () => {
        try {
          const opener = await import("@tauri-apps/plugin-opener");
          await opener.openUrl(href);
        } catch (err) {
          // 插件不可用(旧壳/权限缺)→ 降级 window.open,别让点击无反应。
          console.warn("[T-241] opener 失败,降级 window.open:", err);
          window.open(href, "_blank", "noopener,noreferrer");
        }
      })();
    };
    // 捕获期注册:先于 React 合成事件与既有 onClick,保证外链统一走系统浏览器。
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);
  return null;
}
