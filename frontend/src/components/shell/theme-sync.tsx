"use client";

import { useEffect } from "react";

/** 全局恢复主题与密度；打开设置只读取偏好，不成为外观生效的触发点。 */
export function ThemeSync() {
  useEffect(() => {
    let media: MediaQueryList | null = null;
    try { media = window.matchMedia("(prefers-color-scheme: dark)"); } catch { /* 系统外观不可读时仍恢复持久密度。 */ }
    const apply = () => {
      let density = "comfortable";
      try {
        const stored = localStorage.getItem("creatoros.settings.density");
        if (stored === "comfortable" || stored === "compact") density = stored;
      } catch { /* 无法读取时恢复现有默认布局，不回写用户偏好。 */ }
      document.documentElement.dataset.density = density;
      let theme = document.documentElement.dataset.theme || "system";
      try { theme = localStorage.getItem("creatoros.settings.theme") || "system"; } catch { /* 保留首帧偏好 */ }
      if (!["system", "light", "dark"].includes(theme)) theme = "system";
      const root = document.documentElement;
      root.dataset.theme = theme;
      root.classList.toggle("dark", theme === "dark" || (theme === "system" && (media?.matches ?? false)));
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === null || event.key === "creatoros.settings.theme" || event.key === "creatoros.settings.density") apply();
    };
    apply();
    media?.addEventListener("change", apply);
    window.addEventListener("storage", onStorage);
    window.addEventListener("creatoros:theme-change", apply);
    return () => {
      media?.removeEventListener("change", apply);
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("creatoros:theme-change", apply);
    };
  }, []);
  return null;
}
