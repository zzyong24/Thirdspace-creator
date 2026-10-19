"use client";

import * as React from "react";
import {modelRoutingChoicesSchema} from "@creatoros/contract";
import {CURRENT_ACCOUNT_KEY, readCurrentAccountId} from "@/lib/http-transport";
import {
  readModelRoutingPreference, serverModelRoutingPreference, subscribeModelRouting, loadModelRouting,
} from "./assistant-engine";

function subscribeAccount(refresh: () => void) {
 const storage=(event:StorageEvent)=>{if(event.key===null||event.key===CURRENT_ACCOUNT_KEY)refresh();};
 window.addEventListener('creatoros:accounts-changed',refresh);window.addEventListener('storage',storage);
 return()=>{window.removeEventListener('creatoros:accounts-changed',refresh);window.removeEventListener('storage',storage);};
}
/** 来源和已核能力只读同一设置资源；真实Codex握手由设置切换或实际提交准入负责。 */
export function useAssistantEngine() {
 const routing=React.useSyncExternalStore(subscribeModelRouting,readModelRoutingPreference,()=>serverModelRoutingPreference);
 const parsed=modelRoutingChoicesSchema.safeParse(routing.resource?.choices??routing.resource?.effectiveChoices);
 const v2=parsed.success;
 const engine=v2?(parsed.data.text==='codex'?'codex':'pi'):(routing.resource?.legacyExecutionEngine??'pi');
 const preference={engine,ready:routing.ready,saving:routing.saving,error:routing.error};
 React.useEffect(()=>{void loadModelRouting();},[]);
 const accountId=React.useSyncExternalStore(subscribeAccount,readCurrentAccountId,()=>null);
 const capability=(mode:string,name:string)=>routing.resource?.capabilities.find(row=>row.mode===mode&&row.capability===name);
 const text=capability('text','copilot.assist'),vision=capability('vision','copilot.assist');
 const ready=routing.ready&&!routing.saving;
 // 未核实允许进入实际准入，不能用一次缺失/取消观察把输入长期锁住；真实失败仍按本用途阻止。
 // SEMANTIC_BOUNDARY_ALLOW: 仅核已登记的可恢复观测错误码；不把旧观测当作本轮授权或模型成功。
 const retryableObservation=(row:typeof text)=>row?.source==='codex'&&row.status==='unavailable'&&['CODEX_LOGIN_REQUIRED','CODEX_STATUS_UNAVAILABLE','CODEX_CONFIG_CHANGED','CODEX_RUNTIME_UNAVAILABLE'].includes(row.reasonCode??'');
 const canUse=(row:typeof text)=>Boolean(ready&&(!row||row.status==='ready'||row.status==='unverified'||retryableObservation(row)));
 const textAvailable=Boolean(ready&&(text?text.status==='ready':!v2&&engine==='pi'));
 const visionAvailable=Boolean(ready&&(vision?vision.status==='ready':!v2&&engine==='pi'));
 const status=routing.error??(!routing.ready?'正在读取模型来源…':routing.saving?'正在保存模型来源…':text?`文本：${({ready:'可用',not_configured:'未配置',unverified:'未核实',unavailable:'不可用'} as const)[text.status]}`:v2?'文本状态未核实':'');
 return {engine,preference,accountId,available:textAvailable,checking:!routing.ready,status,routing,v2,
  textAvailable,visionAvailable,canSubmitText:canUse(text),canSubmitVision:canUse(vision),
  imageGeneration:capability('image','image.generate'),imageEditing:capability('image','image.edit'),
  recheck:()=>void loadModelRouting(true)};
}
