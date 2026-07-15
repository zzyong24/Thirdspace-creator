import * as React from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// T-083 b/c 交互 + 排期写路径测试。证明:
//  b 全量交互:未来空格可点开抽屉;过去日抽屉列作品 + 稿面链接。
//  c 排期写路径:抽屉「+ 排期」→ createEntry(计划标题落 note,选项目加前缀)→ refresh;
//    改期 → updateEntry;删除 → 二次确认 Dialog → deleteEntry → refresh。
// Deterministic — mock client 立即 resolve;plannedAt 由 dateKey 派生;NO Date.now。

const mockRouter = { refresh: vi.fn(), push: vi.fn(), replace: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => mockRouter }));

const mockClient = {
  createEntry: vi.fn((i: unknown): Promise<unknown> => Promise.resolve(i)),
  updateEntry: vi.fn((i: unknown): Promise<unknown> => Promise.resolve(i)),
  deleteEntry: vi.fn((i: unknown): Promise<unknown> => Promise.resolve(i)),
};
vi.mock("@/lib/contract-client", () => ({
  client: {
    createEntry: (i: unknown) => mockClient.createEntry(i),
    updateEntry: (i: unknown) => mockClient.updateEntry(i),
    deleteEntry: (i: unknown) => mockClient.deleteEntry(i),
  },
}));

import { ContentCalendarView } from "./content-calendar-view";
import {
  ScheduleEntryForm,
  DrawerEntryRow,
  dateKeyToPlannedAt,
  isoToLocalInput,
  localInputToIso,
} from "./content-calendar-schedule";
import type {
  CalendarPublicationItem,
  ContentCalendarViewModel,
} from "./content-calendar-page";
import type { ContentCalendarEntryResource } from "@creatoros/backend/modules/content-calendar";

const ACC = "acct-d";

const PLANNED: ContentCalendarEntryResource = {
  id: "cal-1",
  userId: "user-a",
  accountId: ACC,
  plannedAt: "2026-07-21T09:00:00.000Z",
  contentOutputId: null,
  candidateId: null,
  status: "planned",
  note: "老稿子改期",
  publishedAt: null,
  createdAt: "2026-07-20T00:00:00.000Z",
  updatedAt: "2026-07-20T00:00:00.000Z",
};

function pub(
  id: string,
  dateKey: string,
  title: string,
): CalendarPublicationItem {
  return {
    id,
    dateKey,
    title,
    projectId: `proj-${id}`,
    platformLabel: "抖音",
    views: "暂无数据",
    coverAssetId: null,
  };
}

function vm(
  overrides: Partial<ContentCalendarViewModel>,
): ContentCalendarViewModel {
  return {
    accountId: ACC,
    accounts: [],
    month: "2026-07",
    referenceDateKey: "2026-07-03",
    publications: [],
    entries: [],
    projects: [],
    cadence: null,
    attainment: null,
    window: {
      from: "2026-07-01T00:00:00.000Z",
      to: "2026-08-01T00:00:00.000Z",
    },
    ...overrides,
  };
}

beforeEach(() => vi.clearAllMocks());
afterEach(() => cleanup());

describe("content-calendar b/c — 全量交互 + 排期写路径", () => {
  it("dateKeyToPlannedAt 派生当天 09:00 UTC(决定论,非 wall-clock)", () => {
    expect(dateKeyToPlannedAt("2026-07-25")).toBe("2026-07-25T09:00:00.000Z");
  });

  // [FE-M02] datetime-local(本地时区)↔ ISO(UTC) 双向转换。断言用「本地解析」做参照,
  // 与实现同口径,故不依赖测试机时区(TZ-robust)。
  it("isoToLocalInput / localInputToIso 双向转换处理时区,且不要求用户手打 ISO", () => {
    // 本地 15:30 → ISO → 转回本地输入值,值不变(round-trip)。
    const local = "2026-07-28T15:30";
    const iso = localInputToIso(local);
    expect(iso).toBe(new Date("2026-07-28T15:30").toISOString());
    expect(isoToLocalInput(iso!)).toBe(local);
    // 空/非法输入 → null(调用方回退默认时刻)。
    expect(localInputToIso("")).toBeNull();
    expect(localInputToIso("  ")).toBeNull();
    expect(isoToLocalInput("not-a-date")).toBe("");
  });

  it("b: 未来空格可点开抽屉,并给出排期入口", () => {
    render(<ContentCalendarView viewModel={vm({})} />);
    // 07-15 未来、空 → 可点(openable),点开抽屉出「+ 排期」入口。
    const future = screen.getByTestId("calendar-day-2026-07-15");
    expect(future.getAttribute("data-openable")).toBe("true");
    fireEvent.click(future);
    expect(screen.getByTestId("calendar-day-drawer")).toBeTruthy();
    expect(screen.getByTestId("calendar-schedule-open")).toBeTruthy();
  });

  it("b: 过去空窗格不可点(无排期入口)", () => {
    render(<ContentCalendarView viewModel={vm({})} />);
    const gap = screen.getByTestId("calendar-day-2026-07-02");
    expect(gap.getAttribute("data-openable")).toBeNull();
    fireEvent.click(gap);
    expect(screen.queryByTestId("calendar-day-drawer")).toBeNull();
  });

  it("b: 过去有发布日抽屉列作品 + 稿面链接,不给排期入口", () => {
    render(
      <ContentCalendarView
        viewModel={vm({ publications: [pub("p1", "2026-07-01", "七月发布")] })}
      />,
    );
    fireEvent.click(screen.getByTestId("calendar-day-2026-07-01"));
    expect(screen.getByTestId("calendar-drawer-pub")).toBeTruthy();
    expect(
      screen.getByTestId("calendar-drawer-pub-link").getAttribute("href"),
    ).toBe("/projects/proj-p1");
    // 过去日不排期。
    expect(screen.queryByTestId("calendar-schedule-open")).toBeNull();
  });

  it("c: 抽屉「+ 排期」→ createEntry(计划标题落 note)→ router.refresh", async () => {
    render(<ContentCalendarView viewModel={vm({})} />);
    fireEvent.click(screen.getByTestId("calendar-day-2026-07-15"));
    fireEvent.click(screen.getByTestId("calendar-schedule-open"));
    fireEvent.change(screen.getByLabelText("计划标题"), {
      target: { value: "拍开箱" },
    });
    fireEvent.click(screen.getByTestId("calendar-schedule-submit"));
    await waitFor(() =>
      expect(mockClient.createEntry).toHaveBeenCalledTimes(1),
    );
    const arg = mockClient.createEntry.mock.calls[0]![0] as {
      params: { accountId: string };
      body: { plannedAt: string; note?: string };
    };
    expect(arg.params.accountId).toBe(ACC);
    // [FE-M02] 计划时刻默认「当天本地 09:00」,提交时转 ISO(UTC)存储。断言用本地解析
    // 做参照,TZ-robust(不写死某个 Z 值)。
    expect(arg.body.plannedAt).toBe(new Date("2026-07-15T09:00").toISOString());
    expect(arg.body.note).toBe("拍开箱");
    await waitFor(() => expect(mockRouter.refresh).toHaveBeenCalled());
  });

  it("c: 选项目 → note 带项目标注前缀", async () => {
    render(
      <ScheduleEntryForm
        accountId={ACC}
        dateKey="2026-07-15"
        projects={[{ id: "proj-x", title: "秋季企划" }]}
      />,
    );
    fireEvent.click(screen.getByTestId("calendar-schedule-open"));
    fireEvent.change(screen.getByLabelText("计划标题"), {
      target: { value: "预告片" },
    });
    fireEvent.change(screen.getByLabelText("选项目"), {
      target: { value: "proj-x" },
    });
    fireEvent.click(screen.getByTestId("calendar-schedule-submit"));
    await waitFor(() =>
      expect(mockClient.createEntry).toHaveBeenCalledTimes(1),
    );
    const arg = mockClient.createEntry.mock.calls[0]![0] as {
      body: { note?: string };
    };
    expect(arg.body.note).toBe("【秋季企划】预告片");
  });

  it("c: 改期 → updateEntry(改后的 plannedAt/note)", async () => {
    render(
      <ul>
        <DrawerEntryRow entry={PLANNED} />
      </ul>,
    );
    fireEvent.click(screen.getByTestId("calendar-entry-edit"));
    // [FE-M02] 改期字段是 datetime-local(本地时区),用户填本地时刻,不再手打 ISO。
    fireEvent.change(screen.getByLabelText(`改期 ${PLANNED.id}`), {
      target: { value: "2026-07-28T15:30" },
    });
    fireEvent.click(screen.getByTestId("calendar-entry-save"));
    await waitFor(() =>
      expect(mockClient.updateEntry).toHaveBeenCalledTimes(1),
    );
    const arg = mockClient.updateEntry.mock.calls[0]![0] as {
      params: { entryId: string };
      body: { plannedAt?: string };
    };
    expect(arg.params.entryId).toBe("cal-1");
    // 本地 15:30 归一到 UTC 存储(TZ-robust 参照)。
    expect(arg.body.plannedAt).toBe(new Date("2026-07-28T15:30").toISOString());
  });

  it("c: 删除走二次确认 Dialog → 确认后 deleteEntry + refresh", async () => {
    render(
      <ul>
        <DrawerEntryRow entry={PLANNED} />
      </ul>,
    );
    // 点删除只弹框,不发请求。
    fireEvent.click(screen.getByTestId("calendar-entry-delete"));
    expect(screen.getByTestId("calendar-delete-entry-dialog")).toBeTruthy();
    expect(mockClient.deleteEntry).not.toHaveBeenCalled();
    // 确认才发。
    fireEvent.click(screen.getByTestId("calendar-delete-entry-confirm"));
    await waitFor(() =>
      expect(mockClient.deleteEntry).toHaveBeenCalledTimes(1),
    );
    const arg = mockClient.deleteEntry.mock.calls[0]![0] as {
      params: { entryId: string };
    };
    expect(arg.params.entryId).toBe("cal-1");
    await waitFor(() => expect(mockRouter.refresh).toHaveBeenCalled());
  });

  it("c: 已发布 entry 只读(无改期/删除)", () => {
    render(
      <ul>
        <DrawerEntryRow entry={{ ...PLANNED, status: "published" }} />
      </ul>,
    );
    expect(screen.queryByTestId("calendar-entry-edit")).toBeNull();
    expect(screen.queryByTestId("calendar-entry-delete")).toBeNull();
  });

  // [FE-M02] 写失败不再静默:错误可见 + 保留用户输入(表单/弹框不关,可重试)。
  it("c: 排期失败 → 红字错误可见 + 表单不关闭、输入保留、不 refresh", async () => {
    mockClient.createEntry.mockRejectedValueOnce(new Error("网络断了"));
    render(<ContentCalendarView viewModel={vm({})} />);
    fireEvent.click(screen.getByTestId("calendar-day-2026-07-15"));
    fireEvent.click(screen.getByTestId("calendar-schedule-open"));
    fireEvent.change(screen.getByLabelText("计划标题"), {
      target: { value: "拍开箱" },
    });
    fireEvent.click(screen.getByTestId("calendar-schedule-submit"));
    await waitFor(() =>
      expect(screen.getByTestId("calendar-schedule-error")).toBeTruthy(),
    );
    // 后端 message 透传给用户。
    expect(screen.getByTestId("calendar-schedule-error").textContent).toContain(
      "网络断了",
    );
    // 表单没关、输入保留(可直接重试)。
    expect(
      (screen.getByLabelText("计划标题") as HTMLInputElement).value,
    ).toBe("拍开箱");
    // 写没成功 → 不 refresh。
    expect(mockRouter.refresh).not.toHaveBeenCalled();
  });

  it("c: 删除失败 → 红字错误可见 + 二次确认弹框保持打开", async () => {
    mockClient.deleteEntry.mockRejectedValueOnce(new Error("删除被拒"));
    render(
      <ul>
        <DrawerEntryRow entry={PLANNED} />
      </ul>,
    );
    fireEvent.click(screen.getByTestId("calendar-entry-delete"));
    fireEvent.click(screen.getByTestId("calendar-delete-entry-confirm"));
    await waitFor(() =>
      expect(
        screen.getByTestId(`calendar-delete-error-${PLANNED.id}`),
      ).toBeTruthy(),
    );
    expect(
      screen.getByTestId(`calendar-delete-error-${PLANNED.id}`).textContent,
    ).toContain("删除被拒");
    // 弹框仍在(用户可重试/取消)。
    expect(screen.getByTestId("calendar-delete-entry-dialog")).toBeTruthy();
    expect(mockRouter.refresh).not.toHaveBeenCalled();
  });
});
