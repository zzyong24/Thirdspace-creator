import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ExecutionTaskResourceV2 } from "@creatoros/contract";

import { RadarUpgradeAction, upgradeStageStates } from "./radar-upgrade-action";

const task = (patch: Partial<ExecutionTaskResourceV2>) => ({ id: "t1", ownerId: "item-1", status: "running", checkpoint: { stage: "generating" }, createdAt: "2026-10-20T00:00:00Z", ...patch }) as unknown as ExecutionTaskResourceV2;

afterEach(() => cleanup());

describe("RadarUpgradeAction", () => {
  it("未升级时只显示一个升级为项目按钮", () => {
    const onUpgrade = vi.fn();
    render(<RadarUpgradeAction submitting={false} onUpgrade={onUpgrade} />);
    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(1);
    fireEvent.click(buttons[0]!);
    expect(onUpgrade).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("list", { name: "项目自动处理步骤" })).toBeNull();
  });

  it("升级进行中显示真实阶段，按钮禁用并可取消", () => {
    const onCancel = vi.fn();
    render(<RadarUpgradeAction task={task({})} submitting={false} onUpgrade={vi.fn()} onCancel={onCancel} />);
    expect(screen.getByRole("list", { name: "项目自动处理步骤" })).toBeInTheDocument();
    expect(document.querySelector('[data-stage="transcribing"]')?.getAttribute("data-state")).toBe("done");
    expect(document.querySelector('[data-stage="generating"]')?.getAttribute("data-state")).toBe("active");
    expect(document.querySelector('[data-slot="radar-upgrade-button"]')).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "取消" }));
    expect(onCancel).toHaveBeenCalled();
  });

  it("已有项目时直接给出查看项目链接", () => {
    render(<RadarUpgradeAction task={task({ status: "succeeded", checkpoint: { stage: "completed", projectId: "p 1" } })} submitting={false} onUpgrade={vi.fn()} />);
    expect(screen.getByRole("link", { name: "查看项目" })).toHaveAttribute("href", "/projects/p%201");
    expect(upgradeStageStates(task({ status: "succeeded" }))).toEqual(["done", "done", "done"]);
  });
});
