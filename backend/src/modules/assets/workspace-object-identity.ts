import {accountKeyPrefix} from "./object-storage";
import {workspaceKey,workspaceStamp} from '../../workspace-scope';
import type {RequestContext} from '@creatoros/contract';
/** 保留旧任务的确定性提交键，新组任务按冻结组生成独立键。 */
export function workspaceObjectIdentity(ctx:RequestContext){
 const scope=workspaceKey(ctx);const legacy=scope.kind==='legacy-account'||(ctx.accountId&&ctx.groupId===`grp_legacy_${ctx.accountId}`);
 return {stamp:workspaceStamp(scope),identity:legacy?ctx.accountId!:`group:${scope.id}`,prefix:scope.kind==='group'?`groups/${encodeURIComponent(scope.id)}/`:accountKeyPrefix(scope.id)};
}
