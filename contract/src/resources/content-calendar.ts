import { z } from "zod";
import {
  id,
  iso8601,
  calendarDate,
  calendarEntryStatus,
  cadenceFrequency,
} from "../primitives";

// 七步整合设计 §7.2 — 发布节奏 / 内容日历.

// ContentCalendarEntry — a per-account planned/published/missed slot. Bound to
// a ContentOutput OR a Candidate (never both), or neither (an intent slot).
export const contentCalendarEntryResource = z.object({
  id,
  userId: id,
  accountId: id.nullable(),
  groupId: id.nullable().optional(),
  membershipVersion: z.number().int().nullable().optional(),
  targetStatus: z.enum(["unassigned", "ready", "needs_reselection"]).optional(),
  projectId: id.nullable(),
  plannedDate: calendarDate,
  plannedAt: iso8601,
  contentOutputId: id.nullable(),
  candidateId: id.nullable(),
  status: calendarEntryStatus,
  note: z.string(),
  publishedAt: iso8601.nullable(),
  createdAt: iso8601,
  updatedAt: iso8601,
});
export type ContentCalendarEntryResource = z.infer<
  typeof contentCalendarEntryResource
>;

// PublishingCadence — per-account target frequency + preferred slots.
export const publishingCadenceResource = z.object({
  id,
  userId: id,
  accountId: id.nullable(),
  groupId: id.nullable().optional(),
  frequency: cadenceFrequency,
  preferredSlots: z.array(
    z.object({ weekday: z.number().int(), time: z.string() }),
  ),
  createdAt: iso8601,
  updatedAt: iso8601,
});
export type PublishingCadenceResource = z.infer<
  typeof publishingCadenceResource
>;

// cadenceAttainmentResource — derived (computed, NOT a stored table).
export const cadenceAttainmentResource = z.object({
  accountId: id.nullable(),
  groupId: id.nullable().optional(),
  from: iso8601,
  to: iso8601,
  plannedCount: z.number().int(),
  publishedCount: z.number().int(),
  missedCount: z.number().int(),
  expectedCount: z.number().int(),
  attainmentRatio: z.number(),
  gapDays: z.number().int(),
  isLagging: z.boolean(),
});
export type CadenceAttainmentResource = z.infer<
  typeof cadenceAttainmentResource
>;
