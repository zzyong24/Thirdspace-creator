import {z} from "zod";
import {id} from "../primitives";
import {workFingerprint,workRequestId,workAssetFile,workRuleRef} from "../resources/work-source-anchors";
import {momentsImageUses} from "../resources/moments";
import {workSourceRef} from "../resources/work-sources";
/** 内部原AI输入，不扩泛用公共AI入口的可自报正文/模型配置。 */
export const momentsModelTaskInput=z.object({projectId:id,momentsId:id,generationRootId:id,frozenInputDigest:workFingerprint}).strict();
export const momentsModelOutput=z.discriminatedUnion("field",[
 z.object({field:z.literal("text"),value:z.string()}).strict(),
 z.object({field:z.literal("imageUses"),value:momentsImageUses}).strict(),
]);
export const momentsFrozenProof=z.object({generationRootId:id,momentsId:id,artifactId:id,baseVersionId:id,field:z.enum(["text","imageUses"]),frozenInputDigest:workFingerprint}).strict();
export const momentsRetryReservation=z.object({originalCandidateId:id,clientRequestId:workRequestId,requestDigest:workFingerprint,originalTaskId:id.nullable()}).strict();
/** 完整字段血缘由服务端原冻结来源给出，模型无此写口。 */
export const momentsFrozenLineage=z.object({sourceRefs:z.array(workSourceRef),files:z.array(workAssetFile),ruleRefs:z.array(workRuleRef)}).strict();
