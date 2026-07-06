"use client";

/**
 * Shared error state for the (creator) segment.
 *
 * Implements the canonical error visual defined in D-007. Stays inside
 * the AppShell main frame so the Sidebar and TopHeader remain visible —
 * the user can always reach another route even when the current page
 * fails.
 */

import { useEffect } from "react";

import { Button } from "@/components/ui/button";
import Link from "next/link";

import { describeUserError } from "@/lib/ai-error-humanize";

interface CreatorErrorProps {
  readonly error: Error & { digest?: string };
  readonly reset: () => void;
}

export default function CreatorError({ error, reset }: CreatorErrorProps) {
  useEffect(() => {
    // Log to the console only; the project does not have a remote error
    // sink in the first implementation phase.
    console.error("CreatorOS page error:", error);
  }, [error]);

  return (
    <section
      role="alert"
      aria-live="assertive"
      data-slot="creator-error"
      className="flex flex-col items-start gap-section-gap p-page-gutter"
    >
      <div className="flex flex-col gap-2">
        <h1 className="text-xl font-semibold text-foreground">
          出了点问题
        </h1>
        <p className="text-sm text-muted-foreground">
          {/* [T-133] 不把裸 error.message(可能含技术栈/内部串)渲给用户;
              走人话收口,识别不出给兜底。错误编号(digest)仍展示便于排查。 */}
          {describeUserError(error, "页面加载失败，请稍后重试。")}
        </p>
        {error.digest ? (
          <p className="text-xs text-text-subtle">错误编号：{error.digest}</p>
        ) : null}
      </div>
      <div className="flex items-center gap-2">
        <Button type="button" onClick={reset}>
          重试
        </Button>
        <Link
          href="/"
          className="group/button inline-flex h-8 items-center justify-center rounded-lg border border-border bg-background px-2.5 text-sm font-medium transition-all hover:bg-muted hover:text-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          返回首页
        </Link>
      </div>
    </section>
  );
}
