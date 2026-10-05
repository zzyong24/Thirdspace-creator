// 正式目标 contract/src/resources/publication-cover.ts；仅前置候选，未注册未消费操作。
import {z} from 'zod';
import {id,iso8601} from '../primitives';
import {workAssetFile,workFingerprint,workRequestId} from './work-source-anchors';
import {publicationRevisionResource} from './publishing';
const identity={outputId:id,publicationId:id};
const base={...identity,expectedCurrentRevisionId:id,clientRequestId:workRequestId};
export const publicationCoverSaveBody=z.discriminatedUnion('operation',[
 z.object({...base,operation:z.literal('attach'),expectedCover:z.null(),file:workAssetFile}).strict(),
 z.object({...base,operation:z.literal('replace'),expectedCover:workAssetFile,file:workAssetFile}).strict(),
 z.object({...base,operation:z.literal('detach'),expectedCover:workAssetFile,file:z.null()}).strict(),
]);
export const publicationCoverState=z.discriminatedUnion('kind',[
 z.object({kind:z.literal('none')}).strict(),
 z.object({kind:z.literal('exact_file'),file:workAssetFile}).strict(),
 z.object({kind:z.literal('legacy_unverified'),assetId:id}).strict(),
]);
export const publicationCoverRead=z.object({...identity,version:z.object({kind:z.literal('publication'),publicationId:id,revisionId:id}).strict(),cover:publicationCoverState}).strict().superRefine((v,c)=>{if(v.version.publicationId!==v.publicationId)c.addIssue({code:'custom',message:'发布修订归属不符'});});
export const publicationCoverCommitReceipt=z.object({kind:z.literal('manual_save'),owner:z.literal('publication'),clientRequestId:workRequestId,requestDigest:workFingerprint,committedAt:iso8601,version:z.object({kind:z.literal('publication'),publicationId:id,revisionId:id}).strict()}).strict();
const exactProof=z.object({file:workAssetFile,checksum:z.string().regex(/^[a-f0-9]{64}$/)}).strict();
export const publicationCoverSaveResult=z.object({...identity,revision:publicationRevisionResource.strict(),receipt:publicationCoverCommitReceipt,fileProof:exactProof.nullable()}).strict().superRefine((v,c)=>{if(v.revision.publicationId!==v.publicationId||v.receipt.version.publicationId!==v.publicationId||v.receipt.version.revisionId!==v.revision.id)c.addIssue({code:'custom',message:'真实发布修订/回执身份不符'});if(v.fileProof?(v.revision.coverAssetId!==v.fileProof.file.assetId||v.revision.coverAssetFileId!==v.fileProof.file.assetFileId):(v.revision.coverAssetId!==null||v.revision.coverAssetFileId!==null))c.addIssue({code:'custom',message:'封面提交与精确文件证明不符'});});
export const publicationCoverOriginalRequest=z.object({...identity,clientRequestId:workRequestId,requestDigest:workFingerprint,input:publicationCoverSaveBody,status:z.literal('committed'),result:publicationCoverSaveResult,createdAt:iso8601}).strict().superRefine((v,c)=>{if(v.input.outputId!==v.outputId||v.input.publicationId!==v.publicationId||v.input.clientRequestId!==v.clientRequestId||v.result.outputId!==v.outputId||v.result.publicationId!==v.publicationId||v.result.receipt.clientRequestId!==v.clientRequestId||v.result.receipt.requestDigest!==v.requestDigest)c.addIssue({code:'custom',message:'封面原请求摘要/结果身份不符'});});
