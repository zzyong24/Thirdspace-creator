"use client";

import { useEffect } from "react";

/** 全局订阅系统外观；打开设置只读取偏好，不成为主题生效的触发点。 */
export function ThemeSync() {
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      let theme = document.documentElement.dataset.theme || "system";
      try { theme = localStorage.getItem("creatoros.settings.theme") || "system"; } catch { /* 保留首帧偏好 */ }
      if (!["system", "light", "dark"].includes(theme)) theme = "system";
      const root = document.documentElement;
      root.dataset.theme = theme;
      root.classList.toggle("dark", theme === "dark" || (theme === "system" && media.matches));
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === null || event.key === "creatoros.settings.theme") apply();
    };
    apply();
    media.addEventListener("change", apply);
    window.addEventListener("storage", onStorage);
    window.addEventListener("creatoros:theme-change", apply);
    return () => {
      media.removeEventListener("change", apply);
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("creatoros:theme-change", apply);
    };
  }, []);
  return null;
}
