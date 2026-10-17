import {z} from "zod";
import {workFingerprint} from "@creatoros/contract";
import type {Db} from "@creatoros/backend";
import type {RequestContext,WorkContentSource,WorkRuleRef,WorkAssetFile,WorkAdoptionReceipt,WorkFieldTarget,WorkOwnerVersion,WorkSourceRef} from "@creatoros/contract";
import type {AiService} from "../ai";
import type {MomentsService} from "./moments.service";
import type {WorkFrozenSource} from "../work-compositions";
/** 前置协议，不是已装配实现；builder必须绑定传入tx。 */
export interface MomentsModelPorts{
 prepareModelAuthority?:(ctx:RequestContext)=>Promise<(tx:Db)=>Promise<void>>;
 moments(tx:Db):Pick<MomentsService,"get"|"save"|"saveReceipt"|"readVersion"|"request">;
 ai(tx:Db):Pick<AiService,"createTask"|"findTaskByAttempt"|"getTask"|"getTaskRuntimeData">;
 readSource(ctx:RequestContext,projectId:string,source:WorkContentSource,tx:Db):Promise<WorkFrozenSource>;
 readRule(ctx:RequestContext,ref:WorkRuleRef,tx:Db):Promise<unknown>;
 readAllowedFile(ctx:RequestContext,projectId:string,file:WorkAssetFile,tx:Db):Promise<{assetId:string;assetFileId:string;checksum:string}>;
 /** 原Moments root/project/artifact保存根锁，同tx；非No-op。 */
 lockMoments(ctx:RequestContext,momentsId:string,tx:Db):Promise<void>;
 wake(ctx:RequestContext,taskId:string):Promise<void>;
 resumeOriginalExecution(ctx:RequestContext,input:{taskId:string;taskType:"moments.draft";clientRequestId:string}):Promise<{id:string}>;
 /** 同项目update根锁先于Moments/Artifact与按ID排序组合锁。核momentsId===field.momentsId，版本必须精确匹配原Moments.saveReceipt；fingerprint schema强验，非No-op。 */
 recordMomentsFieldAdoption(ctx:RequestContext,input:{momentsId:string;field:Extract<WorkFieldTarget,{kind:"moments_field"}>;targetVersion:Extract<WorkOwnerVersion,{kind:"artifact"}>;targetFingerprint:z.infer<typeof workFingerprint>;sources:WorkContentSource[];sourceRefs:WorkSourceRef[];files:WorkAssetFile[];ruleRefs:WorkRuleRef[];receipt:WorkAdoptionReceipt},tx:Db):Promise<{dependencyIds:string[]}>;
}
