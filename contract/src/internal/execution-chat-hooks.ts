import { z } from "zod";

/** 开场文案使用装配当时的真实资料；恢复不重新读取已变化的业务内容。 */
export const scriptHooksContextSchema = z.object({
  selectionTitle: z.string(),
  positioningBrief: z.string(),
  projectBriefHard: z.string(),
  userMaterialHardBrief: z.string(),
  userMaterialRefBrief: z.string(),
  knowledgeBrief: z.string(),
}).strict().refine(value => JSON.stringify(value).length <= 4_000_000, "开场文案上下文过大");
export type ScriptHooksContext = z.infer<typeof scriptHooksContextSchema>;
