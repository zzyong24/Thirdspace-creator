import type { Metadata } from "next";
import "@fontsource-variable/noto-sans-sc";
import "./globals.css";

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
  return (
    <html lang="en" className="font-sans" suppressHydrationWarning>
      <body>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        {children}
      </body>
    </html>
  );
}
