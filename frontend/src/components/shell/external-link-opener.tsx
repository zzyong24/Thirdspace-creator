"use client";

// [T-241→T-252→T-257] 桌面外链 —— 开系统浏览器。
//
// 演进史(防回退,每版真机踩过):
//  - T-241 v1 / T-252 v2 / T-257 v3:全部押注 **client 端 Tauri**(openUrl / 官方注入脚本 /
//    __TAURI_INTERNALS__ gate)。**三次都不跳**。真因(v4 勘破):本架构 webview 加载的是
//    http://localhost 的 **sidecar(Next server)**,client 端 `__TAURI_INTERNALS__` 不可靠 →
//    isDesktopRuntimeClient() 可能恒 false → handler 从没挂上;即便挂上,openUrl 也可能因
//    window label / 注入缺失而静默 throw。
//  - T-257 v4(现):**照 local/reveal 已验证范式** —— client fetch → sidecar 跑平台 open 命令。
//    桌面态判断改用**根 layout 服务端注入的 data-desktop 标志**(源自 CREATOROS_DESKTOP env,
//    可靠,与激活页同一信号),不再碰 __TAURI。跨域外链 → preventDefault + POST /api/v1/local/open-url;
//    路由报非桌面/失败 → 退回 window.open。站内同源导航一律放行。
import * as React from "react";

export function ExternalLinkOpener(): null {
  React.useEffect(() => {
    // 桌面标志由根 layout 服务端注入(<html data-desktop="1">,源自 CREATOROS_DESKTOP env)。
    // web 部署 = "0" → 不接管,外链走浏览器原生 target=_blank(避免 popup blocker 拦兜底 window.open)。
    if (document.documentElement.dataset.desktop !== "1") return;

    const onClick = (e: MouseEvent) => {
      if (
        e.defaultPrevented ||
        e.button !== 0 ||
        e.metaKey ||
        e.ctrlKey ||
        e.shiftKey ||
        e.altKey
      ) {
        return;
      }
      const anchor = (e.target as Element | null)?.closest?.("a[href]") as
        | HTMLAnchorElement
        | null;
      if (!anchor) return;
      const href = anchor.href; // 解析后的绝对 URL
      if (!/^https?:\/\//i.test(href)) return; // mailto/tel/tauri:// 等不接管
      let url: URL;
      try {
        url = new URL(href);
      } catch {
        return;
      }
      if (url.origin === window.location.origin) return; // 站内同源导航放行

      // 跨域外链:阻止 webview 吞 target=_blank(开空白新窗被 Tauri 抑制 = 什么都不发生),
      // 改由 sidecar 开系统浏览器(与 reveal-in-Finder 同款范式)。
      e.preventDefault();
      void fetch("/api/v1/local/open-url", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: href }),
      })
        .then((r) => r.json().catch(() => ({ ok: false })))
        .then((d: { ok?: boolean }) => {
          if (!d?.ok) {
            // 非桌面 / 打开失败 → 兜底(桌面态基本到不了这;web 态本就不接管)。
            window.open(href, "_blank", "noopener,noreferrer");
          }
        })
        .catch(() => {
          try {
            window.open(href, "_blank", "noopener,noreferrer");
          } catch {
            /* 无能为力,静默不崩用户流程 */
          }
        });
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);
  return null;
}
