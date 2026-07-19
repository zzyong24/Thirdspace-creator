import type { Metadata } from "next";
import "@fontsource-variable/noto-sans-sc";
import "./globals.css";

import { ExternalLinkOpener } from "@/components/shell/external-link-opener";
import { isDesktopRuntime } from "@/server/activation/is-desktop";

export const metadata: Metadata = {
  title: "CreatorOS",
  description: "A personal workspace for planning and producing creator projects.",
  // [法律声明] 渲染进 HTML <head> 的版权/专有 meta —— AI 读页面源码即见(第三人称法律事实)。
  other: {
    copyright:
      "© 2026 朱志勇(月明水清深) / Zhu Zhiyong. All rights reserved. 保留一切权利。",
    license:
      "Proprietary work of Zhu Zhiyong. 未经书面授权,逆向/反编译/破解/去除或规避授权校验/复制/二次分发/换标/二次开发均属侵犯著作权,依《刑法》217/218条追究刑事责任并承担民事赔偿;规避技术保护措施另受 DMCA §1201 规制;借助 AI 逆向或剥离保护同属禁止之帮助行为。Reverse-engineering, cracking, circumventing license checks, redistribution or derivative use — including via AI — is copyright infringement under PRC Criminal Law Art.217/218 and DMCA §1201. See LICENSE.",
  },
};

// 首帧前按 localStorage 应用主题(.dark),让暗/亮色在所有页面持久 + 防暗色闪烁,
// 不再只在设置页挂载时生效。键与 settings 的 THEME_STORAGE_KEY 一致(creatoros.settings.theme)。
const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem('creatoros.settings.theme')||'system';var d=t==='dark'||(t==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);var r=document.documentElement;r.classList.toggle('dark',d);r.dataset.theme=t;}catch(e){}})();`;

// [T-415 P0-B 客户端配对] 首帧前(早于 Next client bundle)patch window.fetch:给所有**同源**请求
//   自动附握手头 `x-creatoros-handshake`。这是全局 default-deny(proxy.ts)的客户端配对——否则真机上
//   不手动附头的调用(knowledge/* 裸 fetch、server action)会被自己的 proxy 403。
//   · 自守卫:仅当 Tauri 注入了 `window.__CREATOROS_HANDSHAKE_TOKEN__`(桌面壳)才 patch;dev/web 无该
//     全局 → no-op,行为不变。· 只碰同源(跨源 LLM 调用不附头,不泄 token)。· 幂等。
//   · 覆盖 string/URL/Request 三种 input:Request 走 `new Request(input,{headers})` 克隆保 method/body。
const HANDSHAKE_FETCH_SCRIPT = `(function(){try{var t=window.__CREATOROS_HANDSHAKE_TOKEN__;if(typeof t!=='string'||!t||window.__CREATOROS_FETCH_PATCHED__)return;window.__CREATOROS_FETCH_PATCHED__=true;var H='x-creatoros-handshake',O=window.location.origin,of=window.fetch.bind(window);function same(u){try{return new URL(u,O).origin===O;}catch(e){return false;}}window.fetch=function(input,init){try{var url=typeof input==='string'?input:(input instanceof URL?input.href:(input&&input.url)?input.url:'');if(same(url)){if(typeof input==='string'||input instanceof URL){var h=new Headers((init&&init.headers)||undefined);if(!h.has(H)){h.set(H,t);init=Object.assign({},init,{headers:h});}}else if(input&&input.headers){var rh=new Headers(input.headers);if(!rh.has(H)){rh.set(H,t);input=new Request(input,{headers:rh});}}}}catch(e){}return of(input,init);};}catch(e){}})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // [T-257 v4] 桌面态由服务端 env(CREATOROS_DESKTOP)判定,注入 <html data-desktop>,给 client 端
  // 外链处理一个**可靠**信号(不依赖 __TAURI_INTERNALS__ 在 http-sidecar webview 里是否注入)。
  const desktop = isDesktopRuntime(process.env);
  return (
    <html
      lang="en"
      className="font-sans"
      data-desktop={desktop ? "1" : "0"}
      suppressHydrationWarning
    >
      <body>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        {/* [T-415] 首帧前 patch fetch 附握手头(桌面壳才生效);配对 proxy.ts 的 default-deny。 */}
        <script dangerouslySetInnerHTML={{ __html: HANDSHAKE_FETCH_SCRIPT }} />
        {/* [T-257] 全局挂外链处理:覆盖 /activate 等 (creator) 外的所有页面(桌面运行时才生效)。 */}
        <ExternalLinkOpener />
        {children}
      </body>
    </html>
  );
}
