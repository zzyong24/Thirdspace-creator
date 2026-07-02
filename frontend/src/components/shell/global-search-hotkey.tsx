"use client";

/**
 * [T-051 2c] 全局 ⌘K / Ctrl+K → /search。
 *
 * 此前 TopHeader 搜索入口上的 ⌘K kbd 是装饰性假承诺(全仓无 keydown 监听)。
 * 铁律「真实有效或删除」——选择做真:挂全局监听,与 kbd 提示言行一致。
 * 输入场景(input/textarea/contenteditable 聚焦时)不劫持,避免打断打字。
 */

import * as React from "react";
import { useRouter } from "next/navigation";

export function GlobalSearchHotkey() {
  const router = useRouter();
  React.useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== "k") return;
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }
      e.preventDefault();
      router.push("/search");
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [router]);
  return null;
}
