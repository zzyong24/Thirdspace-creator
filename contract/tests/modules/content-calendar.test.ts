import { describe, expect, it } from "vitest";
import { calendarDate } from "../../src/primitives";
import { contentCalendarOperations } from "../../src/operations/content-calendar";
import { contentCalendarEntryResource } from "../../src/resources/content-calendar";

const legacyEntry = {
  id: "cal-legacy",
  userId: "user-1",
  accountId: "account-1",
  projectId: null,
  plannedDate: "2026-08-03",
  plannedAt: "2026-08-03T09:00:00.000Z",
  contentOutputId: null,
  candidateId: null,
  status: "planned",
  note: "",
  publishedAt: null,
  createdAt: "2026-07-29T12:00:00.000Z",
  updatedAt: "2026-07-29T12:00:00.000Z",
};

describe("T-599 content-calendar contract", () => {
  it("accepts only real Gregorian calendar dates", () => {
    expect(calendarDate.parse("2028-02-29")).toBe("2028-02-29");
    expect(() => calendarDate.parse("2026-02-29")).toThrow();
    expect(() => calendarDate.parse("2026-13-01")).toThrow();
    expect(() => calendarDate.parse("03-08-2026")).toThrow();
  });

  it("adds projectId and plannedDate to every calendar entry resource", () => {
    expect(contentCalendarEntryResource.parse(legacyEntry)).toMatchObject({
      projectId: null,
      plannedDate: "2026-08-03",
    });
    expect(
      contentCalendarEntryResource.parse({
        ...legacyEntry,
        id: "cal-project",
        projectId: "project-1",
      }),
    ).toMatchObject({
      projectId: "project-1",
      plannedDate: "2026-08-03",
    });
  });

  it("accepts project schedule create/update while preserving legacy create", () => {
    expect(
      contentCalendarOperations.createEntry.body.parse({
        projectId: "project-1",
        plannedDate: "2026-08-03",
      }),
    ).toEqual({
      projectId: "project-1",
      plannedDate: "2026-08-03",
    });
    expect(
      contentCalendarOperations.createEntry.body.parse({
        plannedAt: "2026-08-03T09:00:00.000Z",
        note: "legacy",
      }),
    ).toMatchObject({ note: "legacy" });
    expect(
      contentCalendarOperations.updateEntry.body.parse({
        plannedDate: "2026-08-08",
      }),
    ).toEqual({ plannedDate: "2026-08-08" });
  });

  it("rejects incomplete or mixed project schedule requests", () => {
    expect(() =>
      contentCalendarOperations.createEntry.body.parse({
        projectId: "project-1",
      }),
    ).toThrow();
    expect(() =>
      contentCalendarOperations.createEntry.body.parse({
        projectId: "project-1",
        plannedDate: "2026-08-03",
        contentOutputId: "output-1",
      }),
    ).toThrow();
    expect(() =>
      contentCalendarOperations.createEntry.body.parse({}),
    ).toThrow();
  });
});
