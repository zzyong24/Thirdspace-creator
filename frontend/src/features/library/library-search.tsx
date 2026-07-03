"use client";

/**
 * 库页跨类搜索行([T-063d] 北极星 SPEC §3「统一头部:搜索(跨三类)」)。
 *
 * 不造新搜索:提交后跳全局搜索 `/search?q=…`(pages.search.get 已支持
 * knowledge/asset facet,结果页自带 4 类 tab 窄化)。这里只是一个导航入口。
 */

import * as React from "react";
import { useRouter } from "next/navigation";

export function LibrarySearch() {
  const router = useRouter();
  const [value, setValue] = React.useState("");
  return (
    <form
      data-slot="library-search"
      role="search"
      aria-label="跨库搜索"
      onSubmit={(e) => {
        e.preventDefault();
        const q = value.trim();
        if (q.length === 0) return;
        router.push(`/search?q=${encodeURIComponent(q)}`);
      }}
      className="flex h-8 w-64 items-center gap-2 rounded-control border border-border bg-surface px-2.5 text-sm"
    >
      <span aria-hidden="true" className="text-xs text-muted-foreground">
        ⌕
      </span>
      <label className="sr-only" htmlFor="library-search-input">
        搜索素材、知识、作品
      </label>
      <input
        id="library-search-input"
        data-slot="library-search-input"
        type="search"
        placeholder="搜素材 / 知识 / 作品…"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="h-full min-w-0 flex-1 bg-transparent text-[13px] text-foreground placeholder:text-muted-foreground focus-visible:outline-none"
      />
    </form>
  );
}
