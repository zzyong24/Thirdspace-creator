// [T-332 S4] 前台操作注册表单测:登记/注销/幂等/订阅 —— 切号确认弹窗的判据(SPEC §6.1)。

import { afterEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";

import {
  beginForegroundActivity,
  hasForegroundActivity,
  listForegroundActivities,
  resetForegroundActivitiesForTest,
  subscribeForegroundActivity,
  useForegroundActivity,
} from "./foreground-activity";

afterEach(() => {
  resetForegroundActivitiesForTest();
});

describe("foreground-activity registry", () => {
  it("默认无前台操作(切换器直切)", () => {
    expect(hasForegroundActivity()).toBe(false);
    expect(listForegroundActivities()).toEqual([]);
  });

  it("登记 → has=true;注销 → 回落 false", () => {
    const end = beginForegroundActivity("AI 正在生成回复");
    expect(hasForegroundActivity()).toBe(true);
    expect(listForegroundActivities()).toEqual(["AI 正在生成回复"]);
    end();
    expect(hasForegroundActivity()).toBe(false);
  });

  it("注销幂等:重复调用不误删其它操作", () => {
    const endA = beginForegroundActivity("op-a");
    const endB = beginForegroundActivity("op-b");
    endA();
    endA(); // 第二次是 no-op,不能把 op-b 也弄没
    expect(hasForegroundActivity()).toBe(true);
    expect(listForegroundActivities()).toEqual(["op-b"]);
    endB();
    expect(hasForegroundActivity()).toBe(false);
  });

  it("订阅者在登记/注销时收到通知,解绑后不再收", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeForegroundActivity(listener);
    const end = beginForegroundActivity("op");
    expect(listener).toHaveBeenCalledTimes(1);
    end();
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
    beginForegroundActivity("op-2");
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("useForegroundActivity:active 期间挂号,active=false / 卸载自动注销", () => {
    const { rerender, unmount } = renderHook(
      ({ active }: { active: boolean }) =>
        useForegroundActivity("表单提交中", active),
      { initialProps: { active: false } },
    );
    expect(hasForegroundActivity()).toBe(false);

    rerender({ active: true });
    expect(hasForegroundActivity()).toBe(true);

    rerender({ active: false });
    expect(hasForegroundActivity()).toBe(false);

    rerender({ active: true });
    expect(hasForegroundActivity()).toBe(true);
    unmount();
    expect(hasForegroundActivity()).toBe(false);
  });
});
