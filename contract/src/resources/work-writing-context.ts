import {z} from 'zod';
import {id} from '../primitives';
import {positioningMasterSnapshotResource} from './positioning';
export const writingContext=z.object({schemaVersion:z.literal(1),brandProfileVersionId:id.nullable(),sourceAssets:z.array(z.object({assetId:id,assetFileId:id}).strict()).max(20)}).strict().superRefine((v,c)=>{
 if(new Set(v.sourceAssets.map(s=>JSON.stringify([s.assetId,s.assetFileId]))).size!==v.sourceAssets.length)c.addIssue({code:'custom',message:'资料文件不能重复'});
});
export type WritingContext=z.infer<typeof writingContext>;
export const resolvedWritingContext=z.object({schemaVersion:z.literal(1),projectId:id,selection:writingContext,
 brand:z.object({versionId:id,profileId:id,oneLiner:z.string(),masterSnapshot:positioningMasterSnapshotResource.extend({facets:positioningMasterSnapshotResource.shape.facets.strict(),downstreamRules:positioningMasterSnapshotResource.shape.downstreamRules.strict()}).strict(),guidance:z.string()}).strict().nullable(),
 sourceMaterials:z.array(z.object({assetId:id,assetFileId:id,ref:z.object({kind:z.literal('asset'),id,versionId:id}).strict(),label:z.string(),text:z.string().max(60000),originalLength:z.number().int().nonnegative(),providedLength:z.number().int().nonnegative(),truncated:z.boolean()}).strict()).max(20),
 digest:z.string().regex(/^sha256:[a-f0-9]{64}$/),
}).strict().superRefine((v,c)=>{
 if((v.brand?.versionId??null)!==v.selection.brandProfileVersionId)c.addIssue({code:'custom',message:'身份版本与选择不符'});
 if(v.sourceMaterials.length!==v.selection.sourceAssets.length)c.addIssue({code:'custom',message:'资料与选择不符'});
 v.sourceMaterials.forEach((s,i)=>{const chosen=v.selection.sourceAssets[i];if(!chosen||s.assetId!==chosen.assetId||s.assetFileId!==chosen.assetFileId||s.ref.id!==s.assetId||s.ref.versionId!==s.assetFileId||s.text.length!==s.providedLength||s.providedLength!==Math.min(s.originalLength,60000)||s.truncated!==(s.originalLength>s.providedLength))c.addIssue({code:'custom',message:'资料版本或真实截断计量不符'});});
});
export type ResolvedWritingContext=z.infer<typeof resolvedWritingContext>;
