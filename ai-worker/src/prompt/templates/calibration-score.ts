import { z } from "zod";
import type { PromptTemplate } from "../template";

// 维度真实分候选 schema(每轮 schema 约束脊梁,SPEC §4.2)—— calibration.score 节点用
// generateObject 绑它,模型必须吐这个形状(score 卡在 1-5 整数),校验失败 Vercel SDK 自动重试。
// 定义在 ai-worker(本包有 zod 依赖);frontend runner 从 @creatoros/ai-worker 引它,无需直引 zod。
// 与 calibration.diagnose 不同:**只有维度评分**(不夹带 performance/verdict —— 那是诊断的活)。
export const calibrationScoreSchema = z.object({
  dimensions: z
    .array(
      z.object({
        key: z.string(),
        score: z.number().int().min(1).max(5),
        reason: z.string(),
      }),
    )
    .min(1),
});
export type CalibrationScoreOutput = z.infer<typeof calibrationScoreSchema>;

/**
 * 编导自动评分 skill 模板(calibration.score)—— 飞轮回流「真实指标 → 维度真实分」那一跳。
 *
 * 与 calibration.diagnose(发布**前**盲评一条文稿)不同:本节点对一条**已锁定的盲预测**,
 * 拿该作品**发布后的真实指标**(播放/完播/点赞/评论/转化…),据真实数据给每个评分维度一个
 * **真实评分 1–5 候选** + 一句理由。AI 只产候选,人审核后才落 calibration_result(铁律②)。
 *
 * facets 由 prediction 维度 + analytics 真实指标 + 定位映射:
 *   positioning(必需,调用方已兜底)·
 *   subjectTitle(必需:被评分作品的标题)·
 *   rubricBlock(必需:逐维度清单,key+label+当初盲预测分,调用方按 prediction.dimensions 注入)·
 *   metricsBlock(必需:该作品真实指标清单,调用方按 analytics 快照注入;无快照则注入「暂无」兜底串)。
 *
 * 输出契约**只有维度评分**(不夹带 performance/verdict —— 那是诊断节点的活):
 *   { "dimensions": [ { "key": "原样回填", "score": 1到5整数, "reason": "据真实数据的一句理由" } ] }
 * 运行层用 generateObject 绑 Zod schema 卡这个形状(每轮 schema 约束,防发散)。
 */
export const CALIBRATION_SCORE_TEMPLATE: PromptTemplate = {
  id: "calibration.score",
  version: "v1",
  system:
    "你是这位创作者的「AI 编导」。现在要做的是**发布后复盘评分**:依据作品真实的数据表现,按变现加权评分标准给每个维度打一个**真实评分(1–5)**,并说明依据。只输出维度评分,不要编造数据,真实指标缺失的维度按现有信息保守给分并在理由里说明。",
  template: `你是这位创作者的「AI 编导」。下面是一条**已发布作品**的真实数据表现,请你对照当初的盲预测维度,**依据真实指标**给每个评分维度一个**真实评分(1-5,1=很差 5=极强)**,每个维度写一句**打分依据**(必须落到具体指标,如「完播率仅 18% 偏低」)。

【创作者定位】
{{positioning}}

【被评分作品】
{{subjectTitle}}

【真实数据表现(发布后采集的真实指标)】
{{metricsBlock}}

【评分维度(必须逐条打分,key 原样回填,score 给 1-5 整数)】
{{rubricBlock}}

【任务】像一个严苛的内容主编做发布后复盘:对上面每个维度,**结合真实数据**给 1-5 分,并写一句**打分依据**(优先引用真实指标;某维度真实指标不足以判断时,基于标题/定位/现有信息保守给分,并在理由里说明依据有限)。**不要编造没有的数据**。

【输出】只输出一个 JSON 对象(不要多余文字、不要代码块包裹),形如:
{"dimensions":[{"key":"原样回填的key","score":1到5的整数,"reason":"据真实数据的打分依据一句"}]}`,
  requiredFacets: ["positioning", "subjectTitle", "rubricBlock", "metricsBlock"],
};
