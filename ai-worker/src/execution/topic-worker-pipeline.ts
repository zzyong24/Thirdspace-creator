import { topicSourceRead, type TopicSourceRead } from "@creatoros/contract";
import type { TopicReadTarget as ContractTopicReadTarget } from "@creatoros/contract/execution-worker";
import { topicQueryPlanSchema } from "../prompt/templates/topic-query-plan";
import { StructuredOutputError } from "../nodes/structured-output-error";
import { findGenerationFailure } from "./generation-error";
import type { LanguageModel } from "ai";
import { topicGenerateFrozenSchema } from "./topic-worker-input";
import { runStructuredNode } from "../nodes/structured-node";
import { getEffectiveTemplate } from "../prompt/effective-skill-runtime";
import { topicFacets } from "../nodes/topic-node";
import { renderSignalQualityBrief } from "../nodes/topic-signal-quality";
import {
  formatTrendBrief,
  formatTrendSourceBrief,
  type TrendSourceSignal,
} from "../nodes/topic-trend-context";
import { topicArraySchema } from "../prompt/templates/topic-generate";
import { trendExtractSchema } from "../prompt/templates/trend-extract";
import { parseFeed } from "../runtime/search-rss";
export type TopicReadTarget = ContractTopicReadTarget;
export type TopicReadData =
  | {kind:"error"; code:string}
  | {
      kind: "search";
      results: Array<{ title: string; url: string; snippet: string }>;
    }
  | { kind: "web" | "rss"; sourceUrl: string; title: string; text: string };
/** 数据库上下文已冻结；所有外部读取和模型结果都经调用方的持久端口。 */
export async function runTopicWorkerPipeline(
  raw: unknown,
  deps: {
    model: LanguageModel;
    signal: AbortSignal;
    maxOutputTokens: number;
    timeoutMs?: number;
    read(target: TopicReadTarget): Promise<TopicReadData | null>;
  },
) {
  const input = topicGenerateFrozenSchema.parse(raw),
    { signal } = deps;
  let basisBrief = input.basisBrief;
  let trend = { sourceCount: 0, signalCount: 0 };
  const reads:TopicSourceRead[]=input.trendSources.map(s=>({id:s.id,name:s.name,url:s.url,status:"not_called",note:"未调用",readAt:null}));
  let plannedQuery:string|undefined;
  if(input.audienceTaskContext&&(input.basis==="trend"||input.mode==="daily")){
    const config=input.audienceTaskContext.config;
    // 私人作者材料及非公开问题不进入公开检索规划。
    const publicCells=[...config.audienceGrid,...config.industryGrid].filter(c=>c.publicQueryAllowed).map(c=>({id:c.id,text:c.text}));
    const planned=await runStructuredNode({model:deps.model,template:getEffectiveTemplate("topic.query-plan"),facets:{publicTaskContext:JSON.stringify({audience:config.audience,platform:config.platform,cells:publicCells,problems:config.problems.filter(p=>p.publicStatus==="public")}),sources:JSON.stringify(input.trendSources)},outputSchema:topicQueryPlanSchema,maxOutputTokens:deps.maxOutputTokens,timeoutMs:deps.timeoutMs,signal});
    plannedQuery=topicQueryPlanSchema.parse(planned.object).query;
  }
  signal.throwIfAborted();
  if (input.basis === "trend" || input.mode === "daily") {
    const signals: TrendSourceSignal[] = [];
    // 固定顺序保证中间模型调用序号跨恢复稳定。单个已知失败由read落回执后返回空。
    const search = await deps.read({ kind: "search", ...(input.audienceTaskContext?{query:plannedQuery,allowPartial:true}:{}) });
    reads.push({id:"web-search",name:"公开任务搜索",url:null,status:search&&search.kind!=="error"?"partial":search?.kind==="error"&&["PERMISSION","NEEDS_LOGIN","CAPTCHA"].includes(search.code)?"permission_denied":"failed",note:search&&search.kind!=="error"?"只读取搜索摘要，正文与观众入口仍待核验":"未取得搜索结果",readAt:new Date().toISOString()});
    signal.throwIfAborted();
    for (const source of input.trendSources) {
      signal.throwIfAborted();
      const page = await deps.read({ kind: "source", sourceId: source.id, ...(input.audienceTaskContext?{allowPartial:true}:{}) });
      const status=reads.find(r=>r.id===source.id)!;
      status.readAt=new Date().toISOString();
      status.status=page&&page.kind!=="error"?"success":page?.kind==="error"&&["PERMISSION","NEEDS_LOGIN","CAPTCHA"].includes(page.code)?"permission_denied":"failed";
      status.note=status.status==="success"?"已读取来源正文":"未取得正文";
      signal.throwIfAborted();
      if (!page || page.kind === "search" || page.kind === "error") continue;
      if(page.text.length>=1500000){status.status="partial";status.note="正文已截断";}
      if (source.sourceType === "rss") {
        for (const row of parseFeed(page.text, source.domain).slice(0, 8))
          signals.push({
            title: row.title,
            url: row.url || null,
            heat: null,
            publishedAt: row.publishedAt ?? null,
            sourceName: source.name,
          });
        continue;
      }
      const pageText = page.text.slice(0, 40000).trim();
      if(page.text.length>40000){status.status="partial";status.note="仅分析前40000字符";}
      if (!pageText) continue;
      try {
        const result = await runStructuredNode({
          model: deps.model,
          template: getEffectiveTemplate("trend.extract"),
          facets: { sourceName: source.name, pageText },
          outputSchema: trendExtractSchema,
          maxOutputTokens: deps.maxOutputTokens,
          timeoutMs: deps.timeoutMs,
          signal,
        });
        signal.throwIfAborted();
        const parsed=trendExtractSchema.safeParse(result.object);
        if(!parsed.success)throw new StructuredOutputError("结构化节点:热点来源输出不合法",{cause:parsed.error});
        signals.push(
          ...parsed.data.signals.filter((row) => row.title.trim())
            .slice(0, 8)
            .map((row) => ({
              ...row,
              title: row.title.trim(),
              sourceName: source.name,
            })),
        );
      } catch (error) {
        signal.throwIfAborted();
        // 已确认格式失败保留旧单源降级；预算、鉴权和任何未知供应商结果必须停止。
        status.status="partial";status.note="已读取，条目提取失败";
        const knownFailure=findGenerationFailure(error);
        if(knownFailure)throw knownFailure;
        if (!(
          error instanceof Error && error.message.startsWith("结构化节点:")
        ))
          throw error;
      }
    }
    const hits = search?.kind === "search" ? search.results : [];
    basisBrief = [input.mode === "daily" && input.basisBrief ? `【受众评论信号】\n${input.basisBrief}` : "", formatTrendSourceBrief(signals), formatTrendBrief(hits)]
      .filter(Boolean)
      .join("\n\n");
    trend = {
      sourceCount:
        new Set(signals.map((row) => row.sourceName.trim()).filter(Boolean))
          .size + (hits.length ? 1 : 0),
      signalCount: signals.length + hits.length,
    };
  }
  signal.throwIfAborted();
  const result=await runStructuredNode({
    model: deps.model,
    template: getEffectiveTemplate("topic.generate"),
    facets: {audienceTaskContext:input.audienceTaskContext?JSON.stringify(input.audienceTaskContext):"",sourceReads:JSON.stringify(reads),...topicFacets(
      input.context.positioningBrief,
      input.basis,
      basisBrief,
      input.basis === "knowledge"
        ? undefined
        : input.context.knowledgeBrief || undefined,
      input.context.learningsBrief || undefined,
      renderSignalQualityBrief({ ...input.qualityProfile, trend }),
    )},
    outputSchema: topicArraySchema,
    maxOutputTokens: deps.maxOutputTokens,
    timeoutMs: deps.timeoutMs,
    signal,
  });
  return {...result,object:{...result.object as object,...(input.audienceTaskContext?{sourceReads:reads.map(r=>topicSourceRead.parse(r))}:{})}};
}
