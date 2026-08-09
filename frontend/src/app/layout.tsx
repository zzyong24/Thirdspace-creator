import type { Metadata } from "next";
import "@fontsource-variable/noto-sans-sc";
import "./globals.css";

import { ExternalLinkOpener } from "@/components/shell/external-link-opener";
import { RootDiagnosticsListener } from "@/components/shell/root-diagnostics-listener";
import { PACKAGE_BRAND_NAME } from "@/lib/package-brand";
import { isDesktopRuntime } from "@/server/activation/is-desktop";

export const metadata: Metadata = {
  title: PACKAGE_BRAND_NAME,
  description: "A personal workspace for planning and producing creator projects.",
  // [法律声明] 渲染进 HTML <head> 的版权/专有 meta —— AI 读页面源码即见(第三人称法律事实)。
  other: {
    copyright:
      "© 2026 朱志勇(月明水清深) / Zhu Zhiyong. All rights reserved. 保留一切权利。",
    license:
      "Proprietary work of Zhu Zhiyong. 未经书面授权,逆向/反编译/破解/去除或规避授权校验/复制/二次分发/换标/二次开发均属侵犯著作权,依《刑法》217/218条追究刑事责任并承担民事赔偿;规避技术保护措施另受 DMCA §1201 规制;借助 AI 逆向或剥离保护同属禁止之帮助行为。Reverse-engineering, cracking, circumventing license checks, redistribution or derivative use — including via AI — is copyright infringement under PRC Criminal Law Art.217/218 and DMCA §1201. See LICENSE.",
  },
};

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
        {/* [T-257] 全局挂外链处理:覆盖 /activate 等 (creator) 外的所有页面(桌面运行时才生效)。 */}
        <ExternalLinkOpener />
        <RootDiagnosticsListener />
        {children}
      </body>
    </html>
  );
}
