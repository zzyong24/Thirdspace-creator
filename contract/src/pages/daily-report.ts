import {z} from "zod";
import {publicationTrafficResource} from "../resources/analytics";
const calendarDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
 const timestamp = Date.parse(value + "T00:00:00Z");
 return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value;
}, "日期无效");
export const dailyReportQuery = z.object({date:calendarDate.optional(),startDate:calendarDate.optional(),endDate:calendarDate.optional()}).superRefine((value,ctx)=>{
 if ((value.startDate === undefined) !== (value.endDate === undefined)) ctx.addIssue({code:"custom",message:"开始日期和结束日期必须同时提供"});
 if (value.date !== undefined && (value.startDate !== undefined || value.endDate !== undefined)) ctx.addIssue({code:"custom",message:"单日与日期范围不能同时提供"});
 if (value.startDate && value.endDate && value.startDate > value.endDate) ctx.addIssue({code:"custom",message:"开始日期不能晚于结束日期"});
});
export type DailyReportQuery=z.infer<typeof dailyReportQuery>;
export const dailyReportPage = z.object({
 date:z.string(),startDate:calendarDate.optional(),endDate:calendarDate.optional(),timeZone:z.literal("Asia/Shanghai"),generatedAt:z.string(),accountId:z.string().nullable(),accountName:z.string().nullable().default(null),
 accountProfileUrl:z.string().url().nullable().optional(),positioningOneLiner:z.string().nullable().optional(),
 positioning:z.string().nullable(),warnings:z.array(z.string()),
 recentWorks:z.array(z.object({publicationId:z.string(),projectId:z.string(),title:z.string(),publishedAt:z.string(),capturedAt:z.string().nullable(),metrics:z.record(z.string(),z.number())})).optional().default([]),
 works:z.array(z.object({publicationId:z.string(),projectId:z.string(),title:z.string(),publishedAt:z.string(),capturedAt:z.string().nullable(),script:z.string().nullable(),
 metrics:z.record(z.string(),z.number()),traffic:z.array(publicationTrafficResource)})),
});
export type DailyReportPage=z.infer<typeof dailyReportPage>;
