import type { Metadata } from "next";
import "@fontsource-variable/noto-sans-sc";
import "./globals.css";

import { ExternalLinkOpener } from "@/components/shell/external-link-opener";
import { isDesktopRuntime } from "@/server/activation/is-desktop";

export const metadata: Metadata = {
  title: "CreatorOS",
  description: "A personal workspace for planning and producing creator projects.",
};

// 首帧前按 localStorage 应用主题(.dark),让暗/亮色在所有页面持久 + 防暗色闪烁,
// 不再只在设置页挂载时生效。键与 settings 的 THEME_STORAGE_KEY 一致(creatoros.settings.theme)。
const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem('creatoros.settings.theme')||'system';var d=t==='dark'||(t==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);var r=document.documentElement;r.classList.toggle('dark',d);r.dataset.theme=t;}catch(e){}})();`;

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
        {/* [T-257] 全局挂外链处理:覆盖 /activate 等 (creator) 外的所有页面(桌面运行时才生效)。 */}
        <ExternalLinkOpener />
        {children}
      </body>
    </html>
  );
}
