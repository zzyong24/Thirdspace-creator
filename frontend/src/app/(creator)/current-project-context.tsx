"use client";

// 当前项目 identity 的客户端 context(T-039b item②)—— 把「真项目标题」从 server component
// 跨到 client 的 ShellRouter。
//
// 根因(见任务②):`(creator)/layout.tsx` 是 server component 但 Next 嵌套布局拿不到子路由的
// `[projectId]` param;而 ShellRouter 的 `resolveRoute` 只读 fixture(canonicalDataset),真项目
// id 在 fixture 里查不到 → 顶部 header + 左下角指示器都退回中性「当前项目」。
//
// 解法:新建 `projects/[projectId]/layout.tsx`(server component,**能**读 projectId param + 用
// 现有只读 op 拉真 {id,title}),用本 Provider 把真 identity 灌进 client;ShellRouter 用
// `useCurrentProjectOverride()` 读它,`resolveRoute` 有真值时优先用真标题、fixture 仅兜底其余字段。
// 非项目路由(无此 Provider 包裹)→ hook 返回 null → resolveRoute 走原 fixture 逻辑(不破坏现有路由)。
//
// [T-054 组B] 修「当前项目/当前项目」重复:CurrentProjectProvider 挂在 ShellRouter **之下**
// (嵌套 layout 的 children 里),而 React context 只向下流 —— ShellRouter 直接 useContext
// 永远读到 null,真标题从未到过侧栏。改为「上报」模式:ShellRouter 持有 override state 并向下
// 提供一个 setter context;CurrentProjectProvider 除了照旧向下提供值,还用 effect 把值**上报**
// 给 ShellRouter(卸载时清空),真项目标题这才真正流进侧栏指示器与顶部 header。

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

const CurrentProjectContext = React.createContext<CurrentProjectOverride | null>(
  null,
);

/**
 * 上报通道:ShellRouter 在 shell 顶层提供 setter,项目路由子树里的 CurrentProjectProvider
 * 通过它把真项目 identity 推**上**去(context 本身只向下流,值靠 effect 上报)。
 * 默认 no-op:测试/无 shell 场景下 Provider 照常工作,只是没人接收上报。
 */
const CurrentProjectSetterContext = React.createContext<
  (value: CurrentProjectOverride | null) => void
>(() => {});

/** ShellRouter 用:向 children 提供上报 setter。 */
export function CurrentProjectSetterProvider({
  onChange,
  children,
}: {
  readonly onChange: (value: CurrentProjectOverride | null) => void;
  readonly children: React.ReactNode;
}) {
  return (
    <CurrentProjectSetterContext.Provider value={onChange}>
      {children}
    </CurrentProjectSetterContext.Provider>
  );
}

/**
 * 读当前项目 override —— ShellRouter 在项目路由下拿到真 {id,title},其它路由拿 null(走 fixture)。
 * 挂在 Provider 之下(项目路由)才有值;shell 顶层无 Provider 时天然返回 null(向后兼容)。
 */
export function useCurrentProjectOverride(): CurrentProjectOverride | null {
  return React.useContext(CurrentProjectContext);
}

/**
 * Provider —— 由 `projects/[projectId]/layout.tsx`(server)渲染,把 server 读到的真项目 identity
 * 灌给其下所有 client 消费者(含 shell 里的 ShellRouter)。`value` 为 null(读失败/未解析)时
 * 等价「无 override」,shell 退回 fixture / 中性态(诚实,不硬凑)。
 */
export function CurrentProjectProvider({
  value,
  children,
}: {
  readonly value: CurrentProjectOverride | null;
  readonly children: React.ReactNode;
}) {
  // [T-054 组B] 把真项目 identity 上报给 ShellRouter(它在本 Provider 之上,直接
  // useContext 读不到)。路由切换/卸载时清空,离开项目路由后侧栏不残留旧项目。
  const report = React.useContext(CurrentProjectSetterContext);
  const routeParam = value?.routeParam ?? null;
  const projectId = value?.projectId ?? null;
  const title = value?.title ?? null;
  React.useEffect(() => {
    if (routeParam && projectId && title !== null) {
      report({ routeParam, projectId, title });
    } else {
      report(null);
    }
    return () => report(null);
  }, [report, routeParam, projectId, title]);
  return (
    <CurrentProjectContext.Provider value={value}>
      {children}
    </CurrentProjectContext.Provider>
  );
}
