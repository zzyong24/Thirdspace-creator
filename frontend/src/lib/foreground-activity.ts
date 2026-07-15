"use client";

/**
 * [T-332 S4] 前台操作注册表(SPEC §6.1:切号确认弹窗的判据)。
 *
 * 语义:切号 = 切整个工作区。**默认直切**(localStorage + cookie + router.refresh,
 * SPEC §6.1「保持现状机制」);只有当页面上有「进行中的前台操作」(表单提交中 / AI 流式
 * 生成中等,离开会丢进行时上下文)时,切换器才弹确认「有进行中的操作,切号会离开当前页面」。
 * 后台任务(scheduled job、production 渲染)归属由创建时 stamp 决定,不进本注册表——
 * 它们不受切号影响,继续跑、完成后归原号。
 *
 * 设计:模块级 Map(token → label)+ 订阅回调,无 window 依赖(SSR 安全)、不引入
 * 全局事件总线。各 feature 用 `useForegroundActivity(label, active)` 在操作进行期间
 * 挂号;切换器切号前查 `hasForegroundActivity()`。
 */

import * as React from "react";

// token(自增)→ 人可读的操作名(确认弹窗里列出来,让用户知道会丢什么)。
const activities = new Map<number, string>();
let nextToken = 0;
const listeners = new Set<() => void>();

function emit(): void {
  for (const fn of listeners) fn();
}

/** 登记一个进行中的前台操作;返回注销函数(操作结束/组件卸载时必须调用)。 */
export function beginForegroundActivity(label: string): () => void {
  const token = nextToken++;
  activities.set(token, label);
  emit();
  let done = false;
  return () => {
    if (done) return; // 幂等:重复注销不炸、不误删别人的号
    done = true;
    activities.delete(token);
    emit();
  };
}

/** 当前是否有任何进行中的前台操作(切换器切号前查询)。 */
export function hasForegroundActivity(): boolean {
  return activities.size > 0;
}

/** 进行中操作的人可读名单(确认弹窗展示;去重保持登记序)。 */
export function listForegroundActivities(): readonly string[] {
  return [...new Set(activities.values())];
}

/** 订阅注册表变化(切换器用来重渲确认态)。返回解绑函数。 */
export function subscribeForegroundActivity(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** 测试助手:清空注册表(模块级单例,测试间必须隔离)。 */
export function resetForegroundActivitiesForTest(): void {
  activities.clear();
  emit();
}

/**
 * React hook:`active` 为 true 期间把一个前台操作挂进注册表,false / 卸载时自动注销。
 * 用法:`useForegroundActivity("AI 正在生成回复", streaming)`。
 */
export function useForegroundActivity(label: string, active: boolean): void {
  React.useEffect(() => {
    if (!active) return;
    return beginForegroundActivity(label);
  }, [label, active]);
}

/** React hook:响应式读「是否有前台操作」(切换器确认弹窗判据)。 */
export function useHasForegroundActivity(): boolean {
  return React.useSyncExternalStore(
    subscribeForegroundActivity,
    hasForegroundActivity,
    // SSR 快照:服务端恒无前台操作。
    () => false,
  );
}
