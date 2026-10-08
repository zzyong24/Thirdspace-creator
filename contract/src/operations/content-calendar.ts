import { z } from "zod";
import { defineEndpoint } from "../endpoints";
import {
  id,
  iso8601,
  calendarDate,
  paginationQuery,
  calendarEntryStatus,
  cadenceFrequency,
} from "../primitives";
import {
  contentCalendarEntryResource,
  publishingCadenceResource,
  cadenceAttainmentResource,
} from "../resources/content-calendar";

const accountParams = z.object({ accountId: id });
const entryParams = z.object({ entryId: id });
const windowQuery = z.object({ from: iso8601, to: iso8601 });

const preferredSlots = z.array(
  z.object({ weekday: z.number().int(), time: z.string() }),
);

const createEntryBody = z
  .object({
    projectId: id.optional(),
    plannedDate: calendarDate.optional(),
    plannedAt: iso8601.optional(),
    contentOutputId: id.optional(),
    candidateId: id.optional(),
    note: z.string().optional(),
  })
  .superRefine((body, ctx) => {
    const projectBranch =
      body.projectId !== undefined || body.plannedDate !== undefined;
    if (projectBranch) {
      if (body.projectId === undefined || body.plannedDate === undefined) {
        ctx.addIssue({
          code: "custom",
          message: "projectId and plannedDate must be provided together",
        });
      }
      if (
        body.plannedAt !== undefined ||
        body.contentOutputId !== undefined ||
        body.candidateId !== undefined
      ) {
        ctx.addIssue({
          code: "custom",
          message:
            "a project schedule cannot include plannedAt, contentOutputId, or candidateId",
        });
      }
      return;
    }
    if (body.plannedAt === undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["plannedAt"],
        message: "plannedAt is required for a legacy calendar entry",
      });
    }
  });

// SPEC §13 "内容日历 (content-calendar)" group (七步 §7.2, contract v0.4).
export const contentCalendarOperations = {
  listGroupCalendar: defineEndpoint({id:"group.calendar.list",method:"GET",path:"/account-groups/:groupId/calendar",params:z.object({groupId:id}),query:windowQuery.extend(paginationQuery.shape),response:contentCalendarEntryResource,isList:true,fr:["FR-GROUP-CALENDAR"]}),
  createGroupEntry: defineEndpoint({id:"group.calendar.entries.create",method:"POST",path:"/account-groups/:groupId/calendar/entries",params:z.object({groupId:id}),body:z.object({projectId:id,plannedDate:calendarDate,targetAccountId:id.nullable().optional(),note:z.string().optional()}),response:contentCalendarEntryResource,fr:["FR-GROUP-CALENDAR"]}),
  setCalendarEntryTarget: defineEndpoint({id:"calendar.entries.target",method:"PUT",path:"/calendar/entries/:entryId/target",params:entryParams,body:z.object({targetAccountId:id.nullable()}),response:contentCalendarEntryResource,fr:["FR-GROUP-CALENDAR"]}),
  getGroupCadence: defineEndpoint({id:"group.cadence.get",method:"GET",path:"/account-groups/:groupId/cadence",params:z.object({groupId:id}),response:publishingCadenceResource.nullable(),fr:["FR-GROUP-CALENDAR"]}),
  upsertGroupCadence: defineEndpoint({id:"group.cadence.upsert",method:"PUT",path:"/account-groups/:groupId/cadence",params:z.object({groupId:id}),body:z.object({frequency:cadenceFrequency,preferredSlots:preferredSlots.default([])}),response:publishingCadenceResource,fr:["FR-GROUP-CALENDAR"]}),
  getGroupCadenceAttainment: defineEndpoint({id:"group.cadence.attainment",method:"GET",path:"/account-groups/:groupId/cadence/attainment",params:z.object({groupId:id}),query:windowQuery,response:cadenceAttainmentResource,fr:["FR-GROUP-CALENDAR"]}),
  listCalendar: defineEndpoint({
    id: "accounts.calendar.list",
    method: "GET",
    path: "/accounts/:accountId/calendar",
    params: accountParams,
    query: windowQuery.extend(paginationQuery.shape),
    response: contentCalendarEntryResource,
    isList: true,
    fr: ["FR-CAL-LIST"],
  }),
  createEntry: defineEndpoint({
    id: "accounts.calendar.entries.create",
    method: "POST",
    path: "/accounts/:accountId/calendar/entries",
    params: accountParams,
    body: createEntryBody,
    response: contentCalendarEntryResource,
    fr: ["FR-CAL-ENTRY-CREATE"],
  }),
  updateEntry: defineEndpoint({
    id: "calendar.entries.update",
    method: "PATCH",
    path: "/calendar/entries/:entryId",
    params: entryParams,
    body: z.object({
      plannedAt: iso8601.optional(),
      plannedDate: calendarDate.optional(),
      contentOutputId: id.optional(),
      candidateId: id.optional(),
      note: z.string().optional(),
    }),
    response: contentCalendarEntryResource,
    fr: ["FR-CAL-ENTRY-UPDATE"],
  }),
  transitionEntry: defineEndpoint({
    id: "calendar.entries.transition",
    method: "POST",
    path: "/calendar/entries/:entryId/transition",
    params: entryParams,
    body: z.object({ status: calendarEntryStatus }),
    response: contentCalendarEntryResource,
    fr: ["FR-CAL-ENTRY-TRANSITION"],
  }),
  deleteEntry: defineEndpoint({
    id: "calendar.entries.delete",
    method: "DELETE",
    path: "/calendar/entries/:entryId",
    params: entryParams,
    response: z.object({ id, deleted: z.literal(true) }),
    fr: ["FR-CAL-ENTRY-DELETE"],
  }),
  getCadence: defineEndpoint({
    id: "accounts.cadence.get",
    method: "GET",
    path: "/accounts/:accountId/cadence",
    params: accountParams,
    response: publishingCadenceResource.nullable(),
    fr: ["FR-CAL-CADENCE-GET"],
  }),
  upsertCadence: defineEndpoint({
    id: "accounts.cadence.upsert",
    method: "PUT",
    path: "/accounts/:accountId/cadence",
    params: accountParams,
    body: z.object({
      frequency: cadenceFrequency,
      preferredSlots: preferredSlots.default([]),
    }),
    response: publishingCadenceResource,
    fr: ["FR-CAL-CADENCE-UPSERT"],
  }),
  getCadenceAttainment: defineEndpoint({
    id: "accounts.cadence.attainment",
    method: "GET",
    path: "/accounts/:accountId/cadence/attainment",
    params: accountParams,
    query: windowQuery,
    response: cadenceAttainmentResource,
    fr: ["FR-CAL-CADENCE-ATTAINMENT"],
  }),
} as const;
