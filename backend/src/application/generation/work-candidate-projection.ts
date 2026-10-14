import {createHash} from 'node:crypto';
import {articleDocument,graphicPostDocument,workMetadataSelection,workFactSelection,type ArticleDocument,type GraphicPostDocument} from '@creatoros/contract';
import {canonicalJson} from '../../modules/ai/canonical-json';
import {ConflictError} from '../../modules/execution/execution.errors';
export const workAdoptionDigest=(value:unknown)=>`sha256:${createHash('sha256').update(canonicalJson(value)).digest('hex')}`;
/** SEMANTIC_BOUNDARY_ALLOW: 只落实用户字段/事实选择并保留精确来源，不判断创作内容。 */
export function projectWorkCandidate(owner:'article',base:ArticleDocument,candidate:ArticleDocument,fields:unknown,facts:unknown,mode:'editor'|'joint'):ArticleDocument;
export function projectWorkCandidate(owner:'graphic',base:GraphicPostDocument,candidate:GraphicPostDocument,fields:unknown,facts:undefined,mode:'joint'):GraphicPostDocument;
export function projectWorkCandidate(owner:'article'|'graphic',rawBase:unknown,rawCandidate:unknown,rawFields:unknown,rawFacts:unknown,mode:'editor'|'joint'):any {
 const schema=owner==='article'?articleDocument:graphicPostDocument,base:any=schema.parse(rawBase),candidate:any=schema.parse(rawCandidate),fields=workMetadataSelection.parse(rawFields);
 const result=structuredClone(candidate);
 const copy=(key:string,source:any)=>{if(Object.hasOwn(source,key))result[key]=structuredClone(source[key]);else delete result[key];};
 for(const field of ['title','summary','tags'] as const){
  const selected=fields.includes(field);if(selected&&!Object.hasOwn(candidate,field))throw new ConflictError('候选没有所选元信息字段');
  copy(field,selected?candidate:base);
  if(owner==='article'&&(field==='title'||field==='summary'))copy(`${field}SourceRefs`,selected?candidate:base);
 }
 const selectedAll=['title','summary','tags'].every(key=>fields.includes(key as any)&&Object.hasOwn(candidate,key));
 if(!fields.length)copy('metadataSource',base);else if(selectedAll)copy('metadataSource',candidate);else delete result.metadataSource;
 if(owner==='article'){
  const facts=workFactSelection.parse(rawFacts);
  if(mode==='editor'&&facts.mode!=='keep')throw new ConflictError('文章微调不能替换事实');
  if(facts.mode==='keep')copy('factItems',base);
  else if(facts.expectedBeforeDigest!==workAdoptionDigest(base.factItems)||facts.proposedFactsDigest!==workAdoptionDigest(candidate.factItems))throw new ConflictError('原事实或候选事实摘要不符');
  if(facts.mode==='replace')result.factItems=candidate.factItems.map((fact:any)=>{const prior=base.factItems.find((row:any)=>row.id===fact.id&&row.text===fact.text&&canonicalJson(row.sourceRefs)===canonicalJson(fact.sourceRefs));return {...fact,reviewState:prior?.reviewState??'needs_confirmation'};});
 }else{
  const seen=new Set<string>();result.sourceRefs=[...candidate.sourceRefs,...base.sourceRefs].filter(ref=>{const key=canonicalJson(ref);if(seen.has(key))return false;seen.add(key);return true;});
 }
 return schema.parse(result);
}
export function workCandidateIntentDigest(operationId:string,outputId:string,body:{fieldSelection:string[];clientRequestId:string;[key:string]:unknown}){
 const {clientRequestId:_,...intent}=body;
 return workAdoptionDigest({operationId,outputId,...intent,fieldSelection:['title','summary','tags'].filter(field=>body.fieldSelection.includes(field))});
}
