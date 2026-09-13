import {z} from "zod";
import {publicationTrafficResource} from "../resources/analytics";
export const dailyReportPage = z.object({
 date:z.string(),timeZone:z.literal("Asia/Shanghai"),generatedAt:z.string(),accountId:z.string().nullable(),accountName:z.string().nullable().default(null),
 positioning:z.string().nullable(),warnings:z.array(z.string()),
 recentWorks:z.array(z.object({publicationId:z.string(),projectId:z.string(),title:z.string(),publishedAt:z.string(),capturedAt:z.string().nullable(),metrics:z.record(z.string(),z.number())})).optional().default([]),
 works:z.array(z.object({publicationId:z.string(),projectId:z.string(),title:z.string(),publishedAt:z.string(),capturedAt:z.string().nullable(),script:z.string().nullable(),
 metrics:z.record(z.string(),z.number()),traffic:z.array(publicationTrafficResource)})),
});
export type DailyReportPage=z.infer<typeof dailyReportPage>;
