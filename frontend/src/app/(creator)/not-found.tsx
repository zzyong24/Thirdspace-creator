/**
 * Shared 404 visual for the (creator) segment (D-007).
 *
 * The shared not-found page keeps the AppShell chrome visible so the
 * user can navigate to a known route from the Sidebar.
 */

import Link from "next/link";

export default function CreatorNotFound() {
  return (
    <section
      role="status"
      aria-live="polite"
      data-slot="creator-not-found"
      className="flex flex-col items-start gap-section-gap p-page-gutter"
    >
      <div className="flex flex-col gap-2">
        <h1 className="text-xl font-semibold text-foreground">未找到该页面</h1>
        <p className="text-sm text-muted-foreground">
          链接可能已失效，或你输入的地址有误。可以从侧栏回到主要工作区。
        </p>
      </div>
      <Link
        href="/"
        className="group/button inline-flex h-8 items-center justify-center rounded-lg bg-primary px-2.5 text-sm font-medium text-primary-foreground transition-all hover:bg-primary/80 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        返回首页
      </Link>
    </section>
  );
}
