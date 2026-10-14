import {createHash} from 'node:crypto';
import {writingContext,resolvedWritingContext,type WritingContext,type ResolvedWritingContext,type RequestContext} from '@creatoros/contract';
import {canonicalJson} from '../../modules/ai/canonical-json';
import {ConflictError} from '../../modules/execution/execution.errors';
export interface WorkWritingContextPorts {
 assertProject(ctx:RequestContext,projectId:string):Promise<unknown>;
 readDocument(ctx:RequestContext,projectId:string,assetId:string,fileId:string):Promise<{label:string;text:string}|null>;
 readCenter(ctx:RequestContext):Promise<{profile:{id:string}|null;currentStatement:{id:string;profileId:string;masterSnapshot:unknown}|null}>;
 readStatement(ctx:RequestContext,versionId:string):Promise<{id:string;profileId:string;oneLiner:string;masterSnapshot:unknown}>;
}
export function validateResolvedWritingContext(raw:unknown):ResolvedWritingContext {
 const result=resolvedWritingContext.parse(raw),{digest,...value}=result;
 if(digest!==`sha256:${createHash('sha256').update(canonicalJson(value)).digest('hex')}`)throw new ConflictError('写作资料摘要不符');
 if(result.brand&&result.brand.guidance!==canonicalJson({oneLiner:result.brand.oneLiner,...result.brand.masterSnapshot}))throw new ConflictError('写作身份指导与真实版本不符');
 return result;
}
/** 只读原项目/文件/定位端口；模型内容不进入领域库。 */
export function createWorkWritingContext(ports:WorkWritingContextPorts){
 return {async resolve(ctx:RequestContext,projectId:string,raw:WritingContext):Promise<ResolvedWritingContext>{
  const selection=writingContext.parse(structuredClone(raw));await ports.assertProject(ctx,projectId);
  let brand:ResolvedWritingContext['brand']=null;
  if(selection.brandProfileVersionId){
   const center=await ports.readCenter(ctx),selected=center.currentStatement;
   if(!center.profile||!selected||selected.id!==selection.brandProfileVersionId||selected.profileId!==center.profile.id||!selected.masterSnapshot)throw new ConflictError('所选身份不是当前真实品牌版本');
   const statement=await ports.readStatement(ctx,selected.id);
   if(statement.id!==selected.id||statement.profileId!==center.profile.id||canonicalJson(statement.masterSnapshot)!==canonicalJson(selected.masterSnapshot))throw new ConflictError('身份版本在准备期间变化');
   const master=resolvedWritingContext.shape.brand.unwrap().shape.masterSnapshot.parse(statement.masterSnapshot);
   brand={versionId:statement.id,profileId:statement.profileId,oneLiner:statement.oneLiner,masterSnapshot:master,guidance:canonicalJson({oneLiner:statement.oneLiner,...master})};
  }
  const sourceMaterials:ResolvedWritingContext['sourceMaterials']=[];
  for(const selected of selection.sourceAssets){
   const source=await ports.readDocument(ctx,projectId,selected.assetId,selected.assetFileId);
   if(!source||!source.text.trim())throw new ConflictError('所选资料文件不存在、不属于当前项目或尚未提取正文');
   const text=source.text.slice(0,60000);sourceMaterials.push({...selected,ref:{kind:'asset',id:selected.assetId,versionId:selected.assetFileId},label:source.label,text,originalLength:source.text.length,providedLength:text.length,truncated:text.length<source.text.length});
  }
  const value={schemaVersion:1 as const,projectId,selection,brand,sourceMaterials};
  return validateResolvedWritingContext({...value,digest:`sha256:${createHash('sha256').update(canonicalJson(value)).digest('hex')}`});
 }};
}
