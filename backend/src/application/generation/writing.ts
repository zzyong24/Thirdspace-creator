import {isDeepStrictEqual} from "node:util";
import {resolveContextDeps} from "../context/registry";

import {createExecutionScriptCheckpointService} from "../../modules/execution";
import {preparePlatformAdaptContext,projectPlatformAdaptCandidate,preparePlanningOutlineContext,projectPlanningOutlineCandidate} from "../../modules/ai-runtime";

import {prepareScriptReviewContext} from "../../modules/ai-runtime";
import {createPlanningThesisBusinessAdapter} from "../../modules/ai-runtime";
import {createScriptBusinessAdapter} from "../../modules/ai-runtime";
import {preparePlanningContractContext,projectPlanningContractCandidate} from "../../modules/ai-runtime";
import {prepareReviewContext,projectReviewCandidate} from "../../modules/ai-runtime";
import {PLANNING_THESIS_TEMPLATE,SCRIPT_DRAFT_TEMPLATE} from "@creatoros/ai-worker";
import {buildWechatArticleFacets,validateWechatArticleCandidate} from "@creatoros/ai-worker/wechat-article-candidate";
import {structuredGenerationInputSchema} from "@creatoros/contract/execution-worker";
import type {createStructuredBusinessExecutionService} from "../../modules/ai-runtime";
/** 固定业务能力注册；冻结上下文、候选投影与原执行服务保持一致。 */
export function createWritingBusinessAdapters(ports:{
projectsService: Pick<ReturnType<typeof import("../../modules/projects").createProjectsService>,"getProject">;
artifactsService: Pick<ReturnType<typeof import("../../modules/artifacts").createArtifactsService>,"getArtifact">;
db: import("../../db").Db;
generationContext: Required<Pick<import("../../modules/ai-runtime").ContextDeps,"positioning"|"learnings">>;
makeGenerationReaders: ()=>ReturnType<typeof import("../context/generation").createGenerationContextReaders>;
makeBriefReader: ()=>import("../../modules/ai-runtime").ProjectBriefReader;
makeReviewSubjectReader: ()=>import("../../modules/ai-runtime").ReviewSubjectReader;
artifactOriginReader: import("../../modules/ai-runtime").ContextDeps["artifactOrigin"];
contractReader: import("../../modules/ai-runtime").ContextDeps["contract"];
reviewScriptSource: Parameters<typeof prepareScriptReviewContext>[2]["scriptSource"];
reviewGateService: Parameters<typeof prepareScriptReviewContext>[2]["lintRules"];
articlesService?: Pick<ReturnType<typeof import("../../modules/articles").createArticlesService>,"getArticle"|"getVersion">;
}){
const {projectsService,artifactsService,db,generationContext,makeGenerationReaders,makeBriefReader,makeReviewSubjectReader,artifactOriginReader,contractReader,reviewScriptSource,reviewGateService}=ports;
return {
...(ports.articlesService ? {"wechat.article-draft":{
      skillId:"wechat.article-draft",capability:"copy.generate",
      async prepare(c,task){
        const input=task.inputData;
        const outputId=String(input.outputId??"");
        const article=await ports.articlesService!.getArticle(c,outputId);
        if(article.projectId!==task.projectId || article.artifactId!==input.artifactId || typeof input.baseVersionId!=="string")throw new Error("ARTICLE_GENERATION_BASE_CHANGED");
        const frozen=article.currentVersionId===input.baseVersionId?article.current:
          (await ports.articlesService!.getVersion(c,outputId,input.baseVersionId)).document;
        // SEMANTIC_BOUNDARY_ALLOW: 只核验历史稿与已冻结输入相等；新稿不能替换本次任务来源。
        if(!isDeepStrictEqual(frozen,input.current))throw new Error("ARTICLE_GENERATION_BASE_CHANGED");
        return buildWechatArticleFacets(input);
      },
      project(_input,object,execution){
        const frozen=structuredGenerationInputSchema.parse(execution?.frozenInput);
        if(frozen.skillId!=="wechat.article-draft" || frozen.capability!=="copy.generate")throw new Error("ARTICLE_GENERATION_FROZEN_TYPE_MISMATCH");
        const methodInput=JSON.parse(frozen.facets.articleContext??"null");
        const proposal=validateWechatArticleCandidate(object,methodInput);
        return {resultType:"wechat_article_candidate",resultData:{proposal}};
      },
    }} : {}),
"script.draft":createScriptBusinessAdapter({
      ...resolveContextDeps(SCRIPT_DRAFT_TEMPLATE.contextRequirements,makeGenerationReaders().contextReaderRegistry),
      positioning:generationContext.positioning,
      readRuntime:(c,id)=>createExecutionScriptCheckpointService(db).readRuntime(c,id),
      async assertArtifact(c,artifactId,projectId){
        const artifact=await artifactsService.getArtifact(c,artifactId);
        // 新提交只选 output_script；保留已经绑定旧 master_script 的历史任务兼容。
        if((projectId!==null && artifact.projectId!==projectId) || !["output_script","master_script"].includes(artifact.artifactType))throw new Error("文稿目标与当前项目或工件类型不一致");
      },
    }),
"planning.thesis":createPlanningThesisBusinessAdapter({
      ...resolveContextDeps(PLANNING_THESIS_TEMPLATE.contextRequirements,makeGenerationReaders().contextReaderRegistry),
      positioning:generationContext.positioning,
      async assertProject(c,projectId){await projectsService.getProject(c,projectId);},
    }),
"review.analyze":{
      skillId:"review.insights",capability:"review.insights",
      prepare:(c,task)=>prepareReviewContext(c,task,{...generationContext,reviewSubject:makeReviewSubjectReader()}),
      project:projectReviewCandidate,
    },
"planning.contract":{
      skillId:"planning.contract",capability:"planning.contract",
      prepare:(c,task)=>preparePlanningContractContext(c,task,{...generationContext,artifactOrigin:artifactOriginReader,
        async assertTargetArtifact(context,target){
          const artifact=await artifactsService.getArtifact(context,target.artifactId);
          if((target.projectId!==null && artifact.projectId!==target.projectId) || artifact.artifactType!=="content_contract")throw new Error("内容合同目标与当前项目或工件类型不一致");
        },
      }),
      project:projectPlanningContractCandidate,
    },
"script.review":{
      skillId:"script.review",capability:"default",
      prepare:(c,task)=>prepareScriptReviewContext(c,task,{scriptSource:reviewScriptSource,lintRules:reviewGateService,positioning:generationContext.positioning}),
      project(){throw new Error("审核报告必须经审核事务提交，不能创建采纳候选");},
    },
"publish.platform_adapt":{
      skillId:"platform.adapt",capability:"script.rewrite",
      prepare:(c,task)=>preparePlatformAdaptContext(c,task,{...generationContext}),
      project:(input,object)=>projectPlatformAdaptCandidate(input,object as Parameters<typeof projectPlatformAdaptCandidate>[1]),
    },
"planning.outline":{
      skillId:"planning.outline",capability:"planning.outline",
      prepare:(c,task)=>preparePlanningOutlineContext(c,task,{...generationContext,contract:contractReader,artifactOrigin:artifactOriginReader,brief:makeBriefReader()}),
      project:(input,object)=>projectPlanningOutlineCandidate(input,object as Parameters<typeof projectPlanningOutlineCandidate>[1]),
    }
} satisfies Parameters<typeof createStructuredBusinessExecutionService>[1]["adapters"];
}
