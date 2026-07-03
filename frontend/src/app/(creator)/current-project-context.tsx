"use client";

// 当前项目 identity 的客户端桥(T-039b item② / T-089④ 修真)—— 把「真项目标题」从
// `projects/[projectId]/layout.tsx`(server,能读 param)跨到 shell 的 ShellRouter(client)。
//
// [T-089④ 根因] 旧实现用 React Context:Provider 由**嵌套** layout 渲染,而消费者
// ShellRouter 挂在 `(creator)/layout.tsx`(Provider 的**祖先**)。React context 只向下
// 流,祖先永远读到 null → 项目页左上角标题恒退中性「项目 / 最近更新 —」(用户见空白/
// 占位)。真机复现:/projects/<真id> header 只显「项目」。
//
// 修法:module 级微型 store(useSyncExternalStore)。嵌套 layout 渲染的
// CurrentProjectProvider 在 effect 里把值**发布**进 store(卸载/换项目时清空),
// ShellRouter 经 useCurrentProjectOverride() **订阅** store —— 不依赖树形位置,
// 祖先也能读到。API(两个导出名)与旧版完全一致,调用方零改动。
//
// 诚实性不变:值为 null(读失败/未解析/非项目路由)→ shell 退回 fixture / 中性态。

import * as React from "react";

/** 从 server 灌进来的真项目 identity(仅 shell 指示器/header 需要的最小切片)。 */
export interface CurrentProjectOverride {
  /** URL 里的 [projectId] 段(原样,可能是 slug),用于 sidebar item 的 id/href。 */
  readonly routeParam: string;
  /** 解析后的真项目 id(canonical)。 */
  readonly projectId: string;
  /** 真项目标题(server 端用 projects.get / projects.list 读到)。 */
  readonly title: string;
}

// ---------------------------------------------------------------------------
// module 级 store(单值 + 订阅者集合)。一个路由树同时只有一个项目 layout 实例,
// 单值足够;并发导航时后挂载者覆盖(与路由语义一致)。
// ---------------------------------------------------------------------------

let currentValue: CurrentProjectOverride | null = null;
const listeners = new Set<() => void>();

function publish(value: CurrentProjectOverride | null): void {
  if (currentValue === value) return;
  currentValue = value;
  for (const l of listeners) l();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): CurrentProjectOverride | null {
  return currentValue;
}

// SSR/预渲染快照:恒 null(server 端没有"当前客户端路由"概念;首帧后 effect 发布真值)。
function getServerSnapshot(): CurrentProjectOverride | null {
  return null;
}

/**
 * 读当前项目 override —— ShellRouter(以及任意组件,无论树形位置)拿到真 {id,title},
 * 非项目路由 / 未发布时为 null(走 fixture / 中性态,向后兼容)。
 */
export function useCurrentProjectOverride(): CurrentProjectOverride | null {
  return React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/**
 * 发布器 —— 由 `projects/[projectId]/layout.tsx`(server)渲染,把 server 读到的真项目
 * identity 发布进 module store,供 shell(树上任意位置)订阅。`value` 为 null(读失败/
 * 未解析)时等价「无 override」;卸载(离开项目路由)时清空,shell 退回中性态。
 */
export function CurrentProjectProvider({
  value,
  children,
}: {
  readonly value: CurrentProjectOverride | null;
  readonly children: React.ReactNode;
}) {
  React.useEffect(() => {
    publish(value);
    return () => {
      // 只清掉自己发布的值(快速导航下另一实例可能已覆盖,别误清新值)。
      if (currentValue === value) publish(null);
    };
  }, [value]);
  return <>{children}</>;
}
