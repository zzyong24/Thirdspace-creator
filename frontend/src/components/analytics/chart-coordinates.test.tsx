import * as React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ChartFrame } from "./chart-frame";
import { HorizontalBarsChart } from "./horizontal-bars-chart";
import { ViewsTrendChart } from "./views-trend-chart";

vi.mock("@/components/analytics/echarts-base", () => ({
  EChart: ({ option }: { option: unknown }) => <div data-testid="chart-options">{JSON.stringify(option)}</div>,
  useChartTokens: () => ({ brand: "#6d4aff", surface: "#fff", border: "#ddd", foreground: "#111", mutedForeground: "#666" }),
}));
afterEach(cleanup);

describe("真实图表坐标", () => {
  it("首页趋势显示日期、单位、数值刻度和零基线，不再按最小值截断", () => {
    const { container } = render(<ChartFrame title="播放趋势" summary="两个实际采集日" trend={[{ label: "10/01", value: 120 }, { label: "10/02", value: 360 }]} />);
    expect(screen.getByText("日期")).toBeVisible();
    expect(screen.getByText("数值（次）")).toBeVisible();
    expect(screen.getByText("0")).toBeVisible();
    expect(screen.getByText("10/01")).toBeVisible();
    expect(screen.getByText("10/02")).toBeVisible();
    expect(container.querySelector('[data-slot="chart-zero-baseline"]')).not.toBeNull();
    expect(container.querySelector('[data-slot="chart-frame-svg"] path[fill="none"]')?.getAttribute("d")).not.toContain(",100.00");
  });
  it("缺明细时不画虚假折线，也不把最高最低写成零", () => {
    const { container } = render(<ChartFrame title="播放趋势" summary="没有采集" trend={[]} />);
    expect(screen.getByText("暂无趋势数据")).toBeVisible();
    expect(screen.queryByText(/最高 0/)).not.toBeInTheDocument();
    expect(container.querySelector('[data-slot="chart-frame-svg"] path')).toBeNull();
  });
  it("单次采集只显示点位，不画线段", () => {
    const { container } = render(<ChartFrame title="播放趋势" summary="单次采集" trend={[{ label: "10/01", value: 120 }]} />);
    expect(container.querySelector('[data-slot="chart-frame-svg"] circle')).not.toBeNull();
    expect(container.querySelector('[data-slot="chart-frame-svg"] path')).toBeNull();
    expect(screen.getByText(/需多次采集/)).toBeVisible();
  });
  it("横条使用共同的零起点、可见名称数值和单位", () => {
    const { container } = render(<HorizontalBarsChart slot="works" shape="bars" summary="两条真实作品" data={[{ label: "第一期", value: 20 }, { label: "第二期", value: 80 }]} />);
    expect(screen.getByText("数值（次）")).toBeVisible();
    expect(screen.getByText("第一期")).toBeVisible();
    expect(screen.getByText("第二期")).toBeVisible();
    expect(screen.getByText("20 次")).toBeVisible();
    expect(screen.getByText("80 次")).toBeVisible();
    const axis = container.querySelector('[data-slot="works-axis"]');
    expect(axis?.textContent).toContain("0");
    expect(axis?.textContent).toBe("020406080");
    const bars = container.querySelectorAll('[data-slot="works-svg"] rect:last-child');
    expect(bars[0]?.getAttribute("width")).toBe("25");
    expect(bars[1]?.getAttribute("width")).toBe("100");
  });
  it("横条无数据不会冒充实测零", () => {
    render(<HorizontalBarsChart slot="works" shape="bars" summary="尚未采集" data={[]} />);
    expect(screen.getByText("暂无比较数据")).toBeVisible();
    expect(screen.queryByText("0 次")).not.toBeInTheDocument();
  });
  it("真实零仍可读，未知条目保留名称但不伪造条长", () => {
    const { container } = render(<HorizontalBarsChart slot="works" shape="bars" summary="部分未采集" data={[{ label: "实测零", value: 0 }, { label: "未采集", value: Number.NaN }]} />);
    expect(screen.getByText("0 次")).toBeVisible();
    expect(screen.getByText("未采集")).toBeVisible();
    expect(screen.getByText("—")).toBeVisible();
    expect(container.querySelectorAll('[data-slot="works-svg"]')).toHaveLength(1);
  });
  it("趋势中的未知日保留断点，不能连成连续走势", () => {
    const { container } = render(<ChartFrame title="播放趋势" summary="中间一天缺采集" trend={[{ label: "10/01", value: 12 }, { label: "10/02", value: null }, { label: "10/03", value: 24 }]} />);
    const line = container.querySelector('[data-slot="chart-frame-svg"] path[fill="none"]');
    expect(line?.getAttribute("d")).not.toContain("L");
    expect(line?.getAttribute("d")?.match(/M/g)).toHaveLength(2);
    expect(container.querySelectorAll('[data-slot="chart-frame-svg"] circle')).toHaveLength(2);
    expect(screen.getByText("10/02")).toBeVisible();
  });
  it("负向数据修正保留负数及零基线", () => {
    const { container } = render(<ChartFrame title="播放修正" summary="负向更正" trend={[{ label: "10/01", value: -12 }, { label: "10/02", value: 24 }]} />);
    expect(container.querySelector('[data-slot="chart-value-axis"]')?.textContent).toContain("-");
    expect(container.querySelector('[data-slot="chart-zero-baseline"]')?.getAttribute("y1")).not.toBe("100");
  });
  it("ECharts趋势有日期和值单位，轴字至少12px，保留未知而非补零", () => {
    render(<ViewsTrendChart summary="两天采集，一天缺失" mode="daily" data={[{ label: "10/01", value: 12 }, { label: "10/02", value: null }, { label: "10/03", value: 42 }]} />);
    const option = JSON.parse(screen.getByTestId("chart-options").textContent!);
    expect(option.xAxis.name).toBe("日期");
    expect(option.yAxis.name).toBe("播放量（次）");
    expect(option.yAxis.min).toBe(0);
    expect(option.xAxis.axisLabel.fontSize).toBeGreaterThanOrEqual(12);
    expect(option.yAxis.axisLabel.fontSize).toBeGreaterThanOrEqual(12);
    expect(option.series[0].connectNulls).toBe(false);
    expect(option.series[0].data).toEqual([12, null, 42]);
  });
});
