import type {WorkEditorTarget} from '@creatoros/contract';
import {ConflictError} from '../execution/execution.errors';
type Definition={name:string;version:string};
export type WorkEditorDefinitionOptions={legacyWorkEditorProtocol?:boolean;workWritingContext?:boolean;workEditorOwner?:WorkEditorTarget['owner']};
/** SEMANTIC_BOUNDARY_ALLOW: 只分派已冻结的协议身份；不按正文或当前偏好重建旧任务。 */
export function resolveWorkEditorProtocol(definitions:readonly Definition[],target?:WorkEditorTarget):WorkEditorDefinitionOptions {
 const editors=definitions.filter(def=>def.name==='work.editor.read'||def.name==='work.editor.propose');
 if(!editors.length)return {};
 const prefixes=editors.map(def=>{
  const match=/^(chat-tools-work-director-v[12]|chat-tools-work-editor-markdown-v1|chat-tools-work-editor-owner-v1-(wechat_article|graphic_post|production)):[a-f0-9]{64}$/.exec(def.version);
  if(!match)throw new ConflictError('编导工具定义协议未知');
  return match[1]!;
 });
 if(new Set(prefixes).size!==1||new Set(editors.map(def=>def.name)).size!==editors.length)throw new ConflictError('编导工具定义协议混合');
 const prefix=prefixes[0]!;
 if(prefix==='chat-tools-work-director-v1')return {legacyWorkEditorProtocol:true,workWritingContext:false};
 if(prefix==='chat-tools-work-director-v2')return {legacyWorkEditorProtocol:true,workWritingContext:true};
 if(prefix==='chat-tools-work-editor-markdown-v1')return {legacyWorkEditorProtocol:false};
 const owner=prefix.slice('chat-tools-work-editor-owner-v1-'.length) as WorkEditorTarget['owner'];
 if(!target||target.owner!==owner)throw new ConflictError('编导工具定义owner与冻结目标不符');
 return {workEditorOwner:owner};
}
