"use client";
import {createContext} from "react";
import type {CreationScope} from "@/lib/creation-workspace-scope";
import type {ProductionWorkbenchProps} from "@/features/production/production-workbench";
export type VideoLeaveState={dirty:boolean;busy:boolean;pending:boolean;imports:number;ready:boolean};
export type VideoLeaveControl={readState:()=>VideoLeaveState;saveForLeave:()=>Promise<boolean>;recoverOriginalReceipt:()=>Promise<void>;exportLocalBackup:()=>Promise<void>;dispose:()=>Promise<void>};
export const ProjectVideoSessionContext=createContext<{attach:(props:ProductionWorkbenchProps,scope:CreationScope)=>()=>void}|null>(null);
export type VideoSessionIdentity={scopeKey:string;projectId:string;outputId:string;generation:number};
let current:VideoSessionIdentity|null=null;
let guard:((target:{href?:string;scopeKey?:string})=>Promise<boolean>)|null=null;
const listeners=new Set<()=>void>();
export const subscribeVideoSession=(listener:()=>void)=>{listeners.add(listener);return()=>{listeners.delete(listener);};};
export const readVideoSession=()=>current;
export const readServerVideoSession=()=>null;
export function publishVideoSession(identity:VideoSessionIdentity|null,navigationGuard:typeof guard){current=identity;guard=navigationGuard;for(const listener of listeners)listener();}
export function clearVideoSession(generation:number){if(current?.generation!==generation)return;publishVideoSession(null,null);}
export async function requestVideoLeave(target:{href?:string;scopeKey?:string}):Promise<boolean>{return guard?guard(target):true;}
/** SEMANTIC_BOUNDARY_ALLOW: 只核对真实项目/作品和URL导航目标，不选择内容。 */
export function isSameVideoWorkspace(identity:VideoSessionIdentity,target:{href?:string;scopeKey?:string}):boolean{
 if(target.scopeKey!==undefined)return target.scopeKey===identity.scopeKey;
 if(!target.href)return false;
 const url=new URL(target.href,"http://creatoros.local");const parts=url.pathname.split("/").filter(Boolean);
 if(parts[0]!=="projects"||decodeURIComponent(parts[1]??"")!==identity.projectId)return false;
 const outputId=url.searchParams.get("outputId");
 return !outputId||outputId===identity.outputId;
}
