import {resolveContextDeps} from "../context/registry";

import {TOPIC_GENERATE_TEMPLATE} from "@creatoros/ai-worker";
import {createTopicGenerateBusinessAdapter,createDailyTopicBusinessAdapter} from "../../modules/ai-runtime";
import {createCalibrationDiagnoseBusinessAdapter,createCalibrationScoreBusinessAdapter,createPositioningGenerateBusinessAdapter} from "../../modules/ai-runtime";
import {createScriptSimilarityBusinessAdapter,createTopicPreferenceBusinessAdapter} from "../../modules/ai-runtime";

import {createResearchGatherBusinessAdapter} from "../../modules/ai-runtime";
import {createTopicEnrichBusinessAdapter} from "../../modules/ai-runtime";
import {createCopilotBusinessAdapter} from "../../modules/ai-runtime";
import {createCoverBusinessAdapter} from "../../modules/ai-runtime";
import {COVER_BRIEF_TEMPLATE} from "@creatoros/ai-worker";

import type {createStructuredBusinessExecutionService} from "../../modules/ai-runtime";
/** 固定业务能力注册；冻结上下文、候选投影与原执行服务保持一致。 */
export function createDiscoveryBusinessAdapters(ports:{
projectsService: Pick<ReturnType<typeof import("../../modules/projects").createProjectsService>,"getProject">;
candidateService: Pick<ReturnType<typeof import("../../modules/candidate").createCandidateService>,"listDropReasons" | "getCandidate" | "getTopicRecommendationContext">;
trendSourcesService: Pick<ReturnType<typeof import("../../modules/trend-sources").createTrendSourcesService>,"listEnabledSources">;
deps: {now:()=>string};
aiService: ReturnType<typeof import("../../modules/ai").createAiService>;
persistentTaskService: ReturnType<typeof import("../../modules/execution").createPersistentTaskService>;
projectIntelligenceReferences: ReturnType<typeof import("../../modules/intelligence").createProjectIntelligenceReferenceService>;
generationContext: Required<Pick<import("../../modules/ai-runtime").ContextDeps,"positioning"|"learnings">>;
makeGenerationReaders: ()=>ReturnType<typeof import("../context/generation").createGenerationContextReaders>;
makeProjectMaterialsReader: ()=>import("../../modules/ai-runtime").ProjectMaterialsReader;
calibrationDiagnoseReaders: ReturnType<typeof import("../context/calibration-diagnose").createCalibrationDiagnoseReaders>;
calibrationScoreReaders: ReturnType<typeof import("../context/calibration-score").createCalibrationScoreReaders>;
dailyTopicAdapter: ReturnType<typeof createDailyTopicBusinessAdapter>;
positioningWorksReader: Parameters<typeof createPositioningGenerateBusinessAdapter>[0]["positioningWorks"];
}){
const {projectsService,candidateService,trendSourcesService,deps,aiService,persistentTaskService,projectIntelligenceReferences,generationContext,makeGenerationReaders,makeProjectMaterialsReader,calibrationDiagnoseReaders,calibrationScoreReaders,dailyTopicAdapter,positioningWorksReader}=ports;
return {
"script.source_similarity":createScriptSimilarityBusinessAdapter({tasks:persistentTaskService,references:projectIntelligenceReferences}),
"topic.preference":createTopicPreferenceBusinessAdapter({listDropReasons:c=>candidateService.listDropReasons(c)}),
"cover.generate":createCoverBusinessAdapter({...resolveContextDeps(COVER_BRIEF_TEMPLATE.contextRequirements,makeGenerationReaders().contextReaderRegistry),positioning:generationContext.positioning}),
"copilot.assist":createCopilotBusinessAdapter({ai:aiService,positioning:generationContext.positioning,learnings:generationContext.learnings,async assertProject(c,id){await projectsService.getProject(c,id);}}),
"scheduled.topic.daily":dailyTopicAdapter,
"topic.generate":createTopicGenerateBusinessAdapter({topicWorkspace:{getContext:(c,id)=>candidateService.getTopicRecommendationContext(c,id)},...resolveContextDeps(TOPIC_GENERATE_TEMPLATE.contextRequirements,makeGenerationReaders().contextReaderRegistry),...generationContext,signals:makeGenerationReaders().signalsReader,knowledge:makeGenerationReaders().knowledgeReader,sourceReader:{listEnabledSources:(c)=>trendSourcesService.listEnabledSources(c)},now:deps.now,async assertProject(c,id){await projectsService.getProject(c,id);}}),
"research.gather_material":createResearchGatherBusinessAdapter({positioning:generationContext.positioning,projectMaterials:makeProjectMaterialsReader(),async assertProject(c,id){await projectsService.getProject(c,id);}}),
"calibration.diagnose":createCalibrationDiagnoseBusinessAdapter({...generationContext,...calibrationDiagnoseReaders}),
"calibration.score":createCalibrationScoreBusinessAdapter({...generationContext,...calibrationScoreReaders}),
"positioning.generate":createPositioningGenerateBusinessAdapter({positioning:generationContext.positioning,accounts:makeGenerationReaders().accountsReader,positioningWorks:positioningWorksReader}),
"topic.enrich":createTopicEnrichBusinessAdapter({
      ...generationContext,
      signals:makeGenerationReaders().signalsReader,
      knowledge:makeGenerationReaders().knowledgeReader,
      candidate:{async get(c,id){const candidate=await candidateService.getCandidate(c,id);return {title:candidate.title,angle:candidate.angle};}},
    })
} satisfies Parameters<typeof createStructuredBusinessExecutionService>[1]["adapters"];
}
