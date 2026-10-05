import {z} from "zod";
import {id} from "../primitives";
import {workRevision,workBasisSelection} from "./work-source-anchors";
import {workContentSource} from "./work-sources";
const range=z.object({start:workRevision,end:workRevision}).strict().refine(v=>v.end>v.start,{message:"文字范围须非空"});
// SEMANTIC_BOUNDARY_ALLOW: 只核验明确字段/ID/UTF-16范围，不选择创作内容。
const momentsSelection=z.discriminatedUnion("mode",[
 z.object({mode:z.literal("whole")}).strict(),
 z.object({mode:z.literal("selected"),fields:z.array(z.enum(["text","imageUses"])),textRanges:z.array(range)}).strict(),
]).superRefine((v,c)=>{if(v.mode!=="selected")return;
 if(!v.fields.length&&!v.textRanges.length)c.addIssue({code:"custom",message:"必须明确选区"});
 if(new Set(v.fields).size!==v.fields.length)c.addIssue({code:"custom",message:"字段重复"});
 if(v.fields.includes("text")&&v.textRanges.length)c.addIssue({code:"custom",message:"全字段与范围冲突"});
 for(let i=0;i<v.textRanges.length;i++)for(let j=0;j<i;j++){const a=v.textRanges[i]!,b=v.textRanges[j]!;if(a.start<b.end&&b.start<a.end)c.addIssue({code:"custom",message:"范围重叠"});}
});
const outputRange=z.object({field:z.enum(["body","script"]),start:workRevision,end:workRevision}).strict().refine(v=>v.end>v.start,{message:"文字范围须非空"});
export const savedOutputSelection=z.discriminatedUnion("mode",[
 z.object({mode:z.literal("whole")}).strict(),
 z.object({mode:z.literal("selected"),sourceSectionIds:z.array(id),sourceFields:z.array(z.enum(["title","body","summary","tags","script"])),textRanges:z.array(outputRange)}).strict(),
]).superRefine((v,c)=>{if(v.mode!=="selected")return;
 if(!v.sourceSectionIds.length&&!v.sourceFields.length&&!v.textRanges.length)c.addIssue({code:"custom",message:"必须明确选区"});
 if(new Set(v.sourceSectionIds).size!==v.sourceSectionIds.length||new Set(v.sourceFields).size!==v.sourceFields.length)c.addIssue({code:"custom",message:"字段或段落ID重复"});
 if(v.sourceSectionIds.length&&(v.sourceFields.includes("body")||v.sourceFields.includes("script")||v.textRanges.length))c.addIssue({code:"custom",message:"段落与正文选择冲突"});
 for(let i=0;i<v.textRanges.length;i++){const a=v.textRanges[i]!;if(v.sourceFields.includes(a.field))c.addIssue({code:"custom",message:"全字段与范围冲突"});for(let j=0;j<i;j++){const b=v.textRanges[j]!;if(a.field===b.field&&a.start<b.end&&b.start<a.end)c.addIssue({code:"custom",message:"范围重叠"});}}
});
export const savedOutputSourcePick=z.object({kind:z.literal("output_version"),sourceOutputId:id,versionId:id,selection:savedOutputSelection}).strict();
export const workSourceSelectBody=z.object({projectId:id,pick:z.discriminatedUnion("kind",[
 z.object({kind:z.literal("moments_version"),momentsId:id,versionId:id,selection:momentsSelection}).strict(),
 z.object({kind:z.literal("work_basis_version"),compositionId:id,versionId:id,selection:workBasisSelection}).strict(),savedOutputSourcePick,
])}).strict();
export const workSourceSelectResult=z.object({source:workContentSource}).strict();
export type SavedOutputSourcePick=z.infer<typeof savedOutputSourcePick>;
export type WorkSourceSelectBody=z.infer<typeof workSourceSelectBody>;
