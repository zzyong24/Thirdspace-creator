import {createHash} from 'node:crypto';
import {resolvedWritingContext as resolvedSchema,type WorkCreationTarget,type ResolvedWritingContext} from '@creatoros/contract';
import {canonicalJson} from '../ai/canonical-json';
import {ConflictError} from '../execution/execution.errors';

type Definition={name:string;version:string};
/** SEMANTIC_BOUNDARY_ALLOW: 仅按原冻结协议选择重建选项，核验身份与摘要，不判断创作含义。 */
export function resolveWorkCreationProtocol(definitions:readonly Definition[],target?:WorkCreationTarget,resolved?:ResolvedWritingContext):{workWritingContext?:boolean} {
 const creation=definitions.filter(def=>def.name==='work.creation.read'||def.name==='work.creation.propose');
 if(!creation.length)return {};
 const versions=creation.map(def=>{
  const match=/^chat-tools-work-director-v([12]):[a-f0-9]{64}$/.exec(def.version);
  if(!match)throw new ConflictError('联合创作工具定义已变化：协议未知');
  return match[1]!;
 });
 if(new Set(versions).size!==1||new Set(creation.map(def=>def.name)).size!==creation.length)throw new ConflictError('联合创作工具定义协议混合或重复');
 const workWritingContext=versions[0]==='2';
 if(!target||Boolean(target.writingContext)!==workWritingContext||Boolean(resolved)!==workWritingContext)throw new ConflictError('联合创作冻结写作上下文与协议不符');
 if(resolved){
  const {digest,...body}=resolvedSchema.parse(resolved);
  if(body.projectId!==target.projectId||canonicalJson(body.selection)!==canonicalJson(target.writingContext)||digest!==`sha256:${createHash('sha256').update(canonicalJson(body)).digest('hex')}`)throw new ConflictError('联合创作冻结写作上下文摘要不符');
 }
 return {workWritingContext};
}
