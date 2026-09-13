import {z} from "zod";
/** 同一次运营分析的展示候选；不自动采纳定位或写回作品。 */
export const dailyReportAnalysis = z.object({
 format:z.literal("creatoros.daily-report.v1"),date:z.string(),startDate:z.string().optional(),endDate:z.string().optional(),accountId:z.string(),sourceGeneratedAt:z.string(),
 headline:z.string().min(1),summary:z.string(),
 positioning:z.object({observation:z.string(),suggestion:z.string()}),
 works:z.array(z.object({publicationId:z.string(),observation:z.string(),hypothesis:z.string(),experiment:z.string()})),
 experiments:z.array(z.object({title:z.string(),action:z.string(),variable:z.string(),metric:z.string(),prerequisite:z.string()})),
});
export type DailyReportAnalysis=z.infer<typeof dailyReportAnalysis>;
