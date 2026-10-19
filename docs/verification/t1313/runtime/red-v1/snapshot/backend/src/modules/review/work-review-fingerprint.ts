import {createHash} from "node:crypto";
import {z} from "zod";
import {workReviewSnapshot,workReviewScope,workMemberRef,workOwnerVersion,workFieldTarget,workContentSource,workSourceRef,workAssetFile,workRuleRef,workSelection,workFingerprint,type WorkReviewScope} from "@creatoros/contract";
// SEMANTIC_BOUNDARY_ALLOW: 规范JSON及摘要只核验精确输入身份/值，不做内容判断。
export function canonical(value:unknown):string{if(Array.isArray(value))return `[${value.map(canonical).join(",")}]`;if(value&&typeof value==="object")return `{${Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;return JSON.stringify(value)??"null";}
export const digest=(value:unknown)=>createHash("sha256").update(canonical(value)).digest("hex");
const sourceValue=z.object({ref:workContentSource,value:z.json()}).strict();
const sourceRefValue=z.object({ref:workSourceRef,value:z.json()}).strict();
const fileValue=z.object({ref:workAssetFile,contentHash:z.string().min(1)}).strict();
const ruleValue=z.object({ref:workRuleRef,value:z.json()}).strict();
export const frozenReviewContextSchema=z.object({
 projectId:z.string().min(1),scope:workReviewScope,
 basis:z.object({artifactId:z.string().min(1),versionId:z.string().min(1),value:z.json()}).strict(),selection:workSelection,
 members:z.array(z.object({member:workMemberRef,ownerVersion:workOwnerVersion,fields:z.array(z.object({
  target:workFieldTarget,provenanceVersion:workOwnerVersion,value:z.json(),sources:z.array(sourceValue),sourceRefs:z.array(sourceRefValue),files:z.array(fileValue),rules:z.array(ruleValue),
 }).strict())}).strict()).max(4),
}).strict();
export type FrozenReviewContext=z.infer<typeof frozenReviewContextSchema>;
/** 必须由backend实际owner读取；生成与确认均不接受客户端快照/摘要。 */
export function freezeReview(scope:WorkReviewScope,raw:unknown,stamp:string){
 const read=frozenReviewContextSchema.parse(raw);
 if(canonical(scope)!==canonical(read.scope))throw Error("REVIEW_SCOPE_MISMATCH");
 const members=read.members.map(member=>({...member,fields:member.fields.map(field=>({target:field.target,provenanceVersion:field.provenanceVersion,valueDigest:digest(field.value),sources:field.sources.map(x=>x.ref),sourceRefs:field.sourceRefs.map(x=>x.ref),files:field.files.map(x=>x.ref),ruleRefs:field.rules.map(x=>x.ref)}))}));
 const fieldProof=(field:FrozenReviewContext["members"][number]["fields"][number])=>({target:field.target,...(scope.kind!=="field"?{provenanceVersion:field.provenanceVersion}:{}),valueDigest:digest(field.value),sources:field.sources.map(x=>({ref:x.ref,valueDigest:digest(x.value)})),sourceRefs:field.sourceRefs.map(x=>({ref:x.ref,valueDigest:digest(x.value)})),files:field.files,rules:field.rules.map(x=>({ref:x.ref,valueDigest:digest(x.value)}))});
 const proofMembers=read.members.map(member=>({member:member.member,...(scope.kind!=="field"?{ownerVersion:member.ownerVersion}:{}),fields:member.fields.map(fieldProof)}));
 const proof={scope,members:proofMembers,...(scope.kind!=="field"?{basis:{artifactId:read.basis.artifactId,versionId:read.basis.versionId,valueDigest:digest(read.basis.value)}}:{}),...(scope.kind==="composition"?{selection:read.selection}:{})};
 const snapshot=workReviewSnapshot.parse({scope,basisArtifactId:read.basis.artifactId,basisVersionId:read.basis.versionId,selection:read.selection,members,fingerprint:workFingerprint.parse(digest(proof)),frozenAt:stamp});
 // field模型只看实际审查字段及它显式所用的source/basis摘录，不能看被指纹排除的完整basis。
 const modelContext=scope.kind==="field"?{scope,members:read.members.map(member=>({member:member.member,fields:member.fields.map(field=>({target:field.target,value:field.value,sources:field.sources,sourceRefs:field.sourceRefs,files:field.files,rules:field.rules}))}))}:{scope,basis:read.basis,selection:scope.kind==="composition"?read.selection:undefined,members:read.members};
 return{snapshot,context:read,modelContext:JSON.parse(JSON.stringify(modelContext))};
}
