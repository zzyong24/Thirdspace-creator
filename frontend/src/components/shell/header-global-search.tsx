"use client";

/**
 * `HeaderGlobalSearch` — TopHeader `search` 模式的「可见搜索框」client 岛。
 *
 * [T-051 2d] 修复交互倒置:旧实现里 TopHeader 渲染的 `SearchField` 没有传
 * onSubmit(默认 preventDefault 死路),而真正接线的输入框却以 `sr-only`
 * 藏在页面内容区。现在这个可见的头部搜索框就是唯一真实的搜索框:
 *
 *  - 提交(回车)→ `router.push(/search?q=…)`,触发 server 重查
 *    `pages.search.get`(并由后端落一条 SearchHistory);
 *  - 保留 URL 上既有的 `?type=` 分面参数,换词搜索不丢当前类型窄化;
 *  - URL `?q=` 变化(历史行点击 / 浏览器前进后退)会同步回输入框值。
 *
 * 打字只更新本地受控值,不逐键写 URL —— 否则每个键击都会触发一次 server
 * 重查并被记进搜索历史(垃圾历史行)。
 */

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { Input } from "@/components/ui/input";
import { creatorIcons } from "@/lib/icons";

const SearchIcon = creatorIcons.search;

export interface HeaderGlobalSearchProps {
  readonly placeholder?: string;
  /** server 注入的初值(URL 无 ?q= 时的回退);URL 值优先。 */
  readonly initialValue?: string;
}

function HeaderGlobalSearchInner({
  placeholder = "搜索项目、素材或知识",
  initialValue = "",
}: HeaderGlobalSearchProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlQuery = searchParams?.get("q") ?? "";

  // 初始值:URL ?q= 优先(直达 /search?q=xx 时框内回显查询词)。
  const [value, setValue] = React.useState<string>(
    urlQuery !== "" ? urlQuery : initialValue,
  );

  // URL → 输入框的单向同步:仅当 ?q= 真的变化时覆盖本地值(不打断正在输入的草稿)。
  const lastUrlQueryRef = React.useRef(urlQuery);
  React.useEffect(() => {
    if (urlQuery !== lastUrlQueryRef.current) {
      lastUrlQueryRef.current = urlQuery;
      setValue(urlQuery);
    }
  }, [urlQuery]);

  const handleSubmit = React.useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const trimmed = value.trim();
      // 保留既有 ?type= 等参数,替换 ?q=。push(非 replace)让每次搜索进浏览器
      // 历史,server 端 pages.search.get 重查并记录 SearchHistory。
      const params = new URLSearchParams(searchParams?.toString() ?? "");
      if (trimmed) {
        params.set("q", trimmed);
      } else {
        params.delete("q");
      }
      const qs = params.toString();
      router.push(qs ? `/search?${qs}` : "/search", { scroll: false });
    },
    [router, searchParams, value],
  );

  return (
    <form
      role="search"
      data-slot="header-search"
      onSubmit={handleSubmit}
      className="flex min-w-0 flex-1 items-center gap-2"
    >
      <label className="sr-only" htmlFor="app-header-search">
        全局搜索
      </label>
      <div className="relative flex flex-1 items-center">
        <SearchIcon
          className="pointer-events-none absolute left-2.5 size-4 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          id="app-header-search"
          type="search"
          data-slot="header-search-input"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder={placeholder}
          autoComplete="off"
          className="h-9 w-full pl-8"
        />
      </div>
    </form>
  );
}

export function HeaderGlobalSearch(props: HeaderGlobalSearchProps) {
  // useSearchParams 需要 Suspense 边界(App Router 静态渲染约束);fallback
  // 渲染等高占位,SSR 流式期间头部不跳动。
  return (
    <React.Suspense
      fallback={<div aria-hidden="true" className="h-9 min-w-0 flex-1" />}
    >
      <HeaderGlobalSearchInner {...props} />
    </React.Suspense>
  );
}
