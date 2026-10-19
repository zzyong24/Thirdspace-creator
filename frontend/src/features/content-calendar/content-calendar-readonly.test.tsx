import * as React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ContentCalendarView } from "./content-calendar-view";
import type { ContentCalendarViewModel } from "./content-calendar-page";
import type { ContentCalendarEntryResource } from "@creatoros/backend/modules/content-calendar";

const routerPush = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: routerPush,
    prefetch: vi.fn(),
  }),
}));

function entry(
  overrides: Partial<ContentCalendarEntryResource> & {
    id: string;
    plannedDate: string;
    projectId: string | null;
  },
): ContentCalendarEntryResource {
  const { id, projectId, plannedDate, ...rest } = overrides;
  return {
    id,
    userId: "user-1",
    accountId: "account-1",
    projectId,
    plannedDate,
    plannedAt: `${plannedDate}T12:00:00.000Z`,
    contentOutputId: null,
    candidateId: null,
    status: "planned",
    note: "",
    publishedAt: null,
    createdAt: "2026-07-20T00:00:00.000Z",
    updatedAt: "2026-07-20T00:00:00.000Z",
    ...rest,
  } as ContentCalendarEntryResource;
}

function vm(
  overrides: Partial<ContentCalendarViewModel> = {},
): ContentCalendarViewModel {
  return {
    accountId: "account-1",
    accounts: [],
    month: "2026-08",
    referenceDateKey: "2026-07-29",
    publications: [],
    entries: [],
    projects: [{ id: "project-1", title: "夏季栏目" }],
    cadence: null,
    attainment: null,
    window: {
      from: "2026-08-01T00:00:00.000Z",
      to: "2026-09-01T00:00:00.000Z",
    },
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
  routerPush.mockReset();
});

describe("ContentCalendarView T-599 只读排期", () => {
  it("月份切换统一留在发布中心", () => {
    render(<ContentCalendarView viewModel={vm()} />);
    fireEvent.click(screen.getByTestId("calendar-prev-month"));
    expect(routerPush).toHaveBeenLastCalledWith(
      "/publishing?month=2026-07",
      { scroll: false },
    );
    fireEvent.click(screen.getByTestId("calendar-next-month"));
    expect(routerPush).toHaveBeenLastCalledWith(
      "/publishing?month=2026-09",
      { scroll: false },
    );
  });

  it("project-bound 排期显示真实项目标题并只提供项目深链", () => {
    render(
      <ContentCalendarView
        viewModel={vm({
          entries: [
            entry({
              id: "cal-project",
              projectId: "project-1",
              plannedDate: "2026-08-03",
            }),
          ],
        })}
      />,
    );

    fireEvent.click(screen.getByTestId("calendar-day-2026-08-03"));
    expect(screen.getByTestId("calendar-drawer-entry")).toHaveTextContent(
      "夏季栏目",
    );
    expect(screen.getByRole("link", { name: "打开项目" })).toHaveAttribute(
      "href",
      "/projects/project-1",
    );
    expect(screen.queryByText("+ 排期")).toBeNull();
    expect(screen.queryByRole("button", { name: "改期" })).toBeNull();
    expect(screen.queryByRole("button", { name: "删除" })).toBeNull();
  });

  it("无法安全关联项目的旧 entry 标为“待整理计划”，不伪造项目链接", () => {
    render(
      <ContentCalendarView
        viewModel={vm({
          entries: [
            entry({
              id: "cal-legacy",
              projectId: null,
              plannedDate: "2026-08-04",
              note: "历史备注",
            }),
          ],
        })}
      />,
    );

    fireEvent.click(screen.getByTestId("calendar-day-2026-08-04"));
    const row = screen.getByTestId("calendar-drawer-entry");
    expect(row).toHaveTextContent("待整理计划");
    expect(row).toHaveTextContent("历史备注");
    expect(screen.queryByRole("link", { name: "打开项目" })).toBeNull();
  });

  it("手工 published calendar entry 不冒充真实发布，空未来日也不再打开自由排期", () => {
    render(
      <ContentCalendarView
        viewModel={vm({
          entries: [
            entry({
              id: "cal-fake-published",
              projectId: "project-1",
              plannedDate: "2026-08-03",
              status: "published",
            }),
          ],
        })}
      />,
    );

    expect(screen.getByTestId("calendar-month-summary")).toHaveTextContent(
      "排期 0 条",
    );
    const day = screen.getByTestId("calendar-day-2026-08-03");
    expect(day.tagName).toBe("DIV");
    fireEvent.click(day);
    expect(screen.queryByTestId("calendar-day-drawer")).toBeNull();
  });
});
it('T1022 切月只替换月份，保留平台、实际账号和数据日期窗口',()=>{
 render(<ContentCalendarView viewModel={vm({groupId:'g',accountId:null})} navigationQuery="platform=douyin&accountId=a2&startDate=2026-09-28&endDate=2026-10-04&month=2026-08"/>);
 fireEvent.click(screen.getByTestId('calendar-prev-month'));
 const previous=new URL(routerPush.mock.calls.at(-1)![0],'http://localhost');expect(previous.searchParams.get('month')).toBe('2026-07');expect(previous.searchParams.get('platform')).toBe('douyin');expect(previous.searchParams.get('accountId')).toBe('a2');expect(previous.searchParams.get('startDate')).toBe('2026-09-28');expect(previous.searchParams.get('endDate')).toBe('2026-10-04');
 fireEvent.click(screen.getByTestId('calendar-next-month'));expect(new URL(routerPush.mock.calls.at(-1)![0],'http://localhost').searchParams.get('month')).toBe('2026-09');
});
