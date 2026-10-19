import {z} from "zod";
import {structuredGenerationInputSchema} from "@creatoros/contract/execution-worker";
import {diagnosisSchema,calibrationScoreSchema,positioningSuggestionSchema} from "@creatoros/ai-worker";
import {assembleCreativeContext,loadPositioningWorksBrief,type ContextDeps} from "./creative-context";
import {diagnoseFacets,normalizeDiagnosis,type DiagnosisSubjectReader,type DiagnosisRubricReader} from "./calibration-diagnose-runner";
import {scoreFacets,normalizeScore,type ScorePredictionReader,type ScoreMetricsReader} from "./calibration-score-runner";
import {positioningFacets,normalizeSuggestion} from "./positioning-runner";
import type {StructuredBusinessAdapter} from "./structured-business-execution.service";
const subjectSchema=z.object({subjectType:z.enum(["content_output","publication"]),subjectId:z.string().min(1)});
const diagnosisTargetSchema=subjectSchema.extend({rubricVersionId:z.string().min(1),rubricKeys:z.array(z.string().min(1)).min(1)});
const scoreTargetSchema=z.object({predictionId:z.string().min(1),rubricKeys:z.array(z.string().min(1)).min(1),metrics:z.array(z.object({key:z.string(),value:z.number().finite()}))});
function facetsFor(execution:Parameters<StructuredBusinessAdapter["project"]>[2],skillId:string){
 const input=structuredGenerationInputSchema.parse(execution?.frozenInput);
 if(input.skillId!==skillId || input.capability!==skillId)throw new Error("候选与冻结任务类型不符");return input.facets;
}
/** 仅准备真实上下文和投影候选；不执行模型，也不写入业务实体。 */
export function createCalibrationDiagnoseBusinessAdapter(deps:ContextDeps & {subject:DiagnosisSubjectReader;rubric:DiagnosisRubricReader}):StructuredBusinessAdapter{
 return {skillId:"calibration.diagnose",capability:"calibration.diagnose",
  async prepare(ctx,task){
   const target=subjectSchema.parse(task.inputData);const subject=await deps.subject.get(ctx,target.subjectType,target.subjectId);const rubric=await deps.rubric.current(ctx);
   const frozen=diagnosisTargetSchema.parse({...target,rubricVersionId:rubric.rubricVersionId,rubricKeys:rubric.dimensions.map(d=>d.key)});
   const context=await assembleCreativeContext(ctx,{projectId:null,topic:subject.title,angle:""},deps);
   return {...diagnoseFacets(context,subject,rubric.dimensions),__calibrationDiagnosis:JSON.stringify(frozen)};
  },
  project(_input,object,execution){
   const target=diagnosisTargetSchema.parse(JSON.parse(facetsFor(execution,"calibration.diagnose").__calibrationDiagnosis ?? "null"));
   const diagnosis=normalizeDiagnosis(diagnosisSchema.parse(object),new Set(target.rubricKeys));if(!diagnosis)throw new Error("诊断未返回可用的真实维度评分");
   return {resultType:"calibration_diagnosis",resultData:{subjectType:target.subjectType,subjectId:target.subjectId,rubricVersionId:target.rubricVersionId,diagnosis}};
  },
 };
}
export function createCalibrationScoreBusinessAdapter(deps:ContextDeps & {prediction:ScorePredictionReader;metrics:ScoreMetricsReader}):StructuredBusinessAdapter{
 return {skillId:"calibration.score",capability:"calibration.score",
  async prepare(ctx,task){
   const {predictionId}=z.object({predictionId:z.string().min(1)}).parse(task.inputData);const prediction=await deps.prediction.get(ctx,predictionId);
   if(prediction.status!=="locked")throw new Error("自动评分要求已锁定的盲预测");
   if(!prediction.dimensions.length)throw new Error("预测没有评分维度");
   const subject=subjectSchema.parse(prediction);const metrics=await deps.metrics.forSubject(ctx,subject.subjectType,subject.subjectId);
   const frozen=scoreTargetSchema.parse({predictionId,rubricKeys:prediction.dimensions.map(d=>d.key),metrics:metrics.map(m=>({key:m.key,value:m.value}))});
   const context=await assembleCreativeContext(ctx,{projectId:null,topic:prediction.title,angle:""},deps);
   return {...scoreFacets(context,prediction.title,prediction.dimensions,metrics),__calibrationScore:JSON.stringify(frozen)};
  },
  project(_input,object,execution){
   const target=scoreTargetSchema.parse(JSON.parse(facetsFor(execution,"calibration.score").__calibrationScore ?? "null"));
   const dimensions=normalizeScore(calibrationScoreSchema.parse(object),new Set(target.rubricKeys));if(!dimensions.length)throw new Error("评分未返回可用的真实维度");
   return {resultType:"calibration_score",resultData:{predictionId:target.predictionId,dimensions,metrics:target.metrics}};
  },
 };
}
export function createPositioningGenerateBusinessAdapter(deps:ContextDeps):StructuredBusinessAdapter{
 return {skillId:"positioning.generate",capability:"positioning.generate",
  async prepare(ctx,_task){const context=await assembleCreativeContext(ctx,{projectId:null,topic:""},deps);const works=await loadPositioningWorksBrief(ctx,deps.positioningWorks);return positioningFacets(context,works);},
  project(_input,object,execution){facetsFor(execution,"positioning.generate");const suggestion=normalizeSuggestion(positioningSuggestionSchema.parse(object));if(!suggestion)throw new Error("定位未返回可用提案");return {resultType:"positioning_profile",resultData:{suggestion}};},
 };
}
