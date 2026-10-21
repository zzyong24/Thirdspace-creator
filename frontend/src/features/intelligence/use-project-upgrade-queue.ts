"use client";
import * as React from "react";
import type {ProjectPreparationResource} from "@creatoros/contract";
import {radarScopeKey} from "./intelligence-workbench-types";
import type {RadarScope,RadarApi} from "./intelligence-workbench-types";

export interface RadarProjectState {projectId:string;preparation?:ProjectPreparationResource;preparing?:boolean;readError?:string;}
const active=(value?:ProjectPreparationResource)=>Boolean(value?.steps.some(step=>["pending","queued","running"].includes(step.status)));
const emptyItems:Array<{id:string;projectId?:string}>=[];

// 每个冻结scope独立观察；可变请求状态留在外部store，不修改React渲染快照。
function createRadarProjectStore(api:RadarApi,scopeKey:string) {
 let alive=false,epoch=0,reading=false,wakeQueued=false,timer:ReturnType<typeof setTimeout>|undefined;
 const projects=new Map<string,RadarProjectState>(),pending=new Set<string>(),listeners=new Set<()=>void>();
 let snapshot={byItem:new Map(projects),submitting:new Set(pending)};
 const publish=()=>{if(alive){snapshot={byItem:new Map(projects),submitting:new Set(pending)};for(const listener of listeners)listener();}};
 const schedule=()=>{clearTimeout(timer);if(alive&&!document.hidden&&[...projects.values()].some(row=>active(row.preparation)))timer=setTimeout(()=>void refresh(false),3000);};
 async function refresh(all:boolean){
  clearTimeout(timer);if(!alive||document.hidden||!api.getProjectPreparation)return;
  if(reading){wakeQueued ||= all;return;}reading=true;wakeQueued=false;const turn=epoch;
  try {
   for(const [itemId,row] of projects){
    if(!alive||turn!==epoch||document.hidden)return;
    if(!all&&row.preparation&&!active(row.preparation))continue;
    try {
     const preparation=await api.getProjectPreparation(row.projectId);
     if(!alive||turn!==epoch)return;if(preparation.projectId!==row.projectId)throw Error("项目准备回执与原项目不符");
     projects.set(itemId,{projectId:row.projectId,preparation,preparing:active(preparation)});publish();
    }catch(error){if(alive&&turn===epoch){projects.set(itemId,{...row,readError:error instanceof Error?error.message:"准备状态暂时不可读取"});publish();}}
   }
  } finally {reading=false;if(alive){if(wakeQueued&&!document.hidden){wakeQueued=false;void refresh(true);}else schedule();}}
 }
 return {
  getSnapshot:()=>snapshot,
  subscribe(listener:()=>void){listeners.add(listener);return()=>{listeners.delete(listener);};},
  activate(){
   alive=true;epoch++;wakeQueued=false;pending.clear();publish();void refresh(true);
   const wake=()=>{void refresh(true);},visibility=()=>{clearTimeout(timer);if(!document.hidden)wake();};
   window.addEventListener("focus",wake);document.addEventListener("visibilitychange",visibility);
   return()=>{alive=false;epoch++;clearTimeout(timer);window.removeEventListener("focus",wake);document.removeEventListener("visibilitychange",visibility);};
  },
  register(items:Array<[string,string|null]>){let added=false;for(const [id,projectId] of items)if(projectId&&!projects.has(id)){projects.set(id,{projectId});added=true;}if(added){publish();void refresh(false);}},
  async enqueue(itemId:string,positioningVersionId:string|null,setNotice:(value:string|null)=>void){
   if(!alive||pending.has(itemId)||projects.has(itemId)||!api.ensureProject)return;
   const turn=epoch;pending.add(itemId);publish();
   try {
    const result=await api.ensureProject({source:"radar",itemId,idempotencyKey:`radar-ensure:${scopeKey}:${itemId}`,...(positioningVersionId?{positioningVersionId}:{})});
    if(!alive||turn!==epoch)return;
    projects.set(itemId,{projectId:result.project.id});publish();void refresh(false);setNotice("项目已创建，准备状态和候选请在项目中查看。");
   }catch(error){if(alive&&turn===epoch)setNotice(error instanceof Error?error.message:"项目创建结果暂未确认，请按原作品重试读取。");}
   finally{if(turn===epoch){pending.delete(itemId);publish();}}
  },
 };
}

/** 雷达只确保项目存在；恢复页面时只读真实项目准备，不再控制旧升级任务。 */
export function useProjectUpgradeQueue({api,accountId,groupId,items=emptyItems,positioningVersionId,setNotice}:RadarScope&{
 api:RadarApi;items?:Array<{id:string;projectId?:string}>;positioningVersionId:string|null;setNotice:(value:string|null)=>void;
}) {
 const scopeKey=radarScopeKey({groupId,accountId});
 const store=React.useMemo(()=>createRadarProjectStore(api,scopeKey),[api,scopeKey]);
 const snapshot=React.useSyncExternalStore(store.subscribe,store.getSnapshot,store.getSnapshot);
 React.useEffect(()=>store.activate(),[store]);
 const itemKey=JSON.stringify(items.map(item=>[item.id,item.projectId??null]));
 React.useEffect(()=>{store.register(JSON.parse(itemKey));},[itemKey,store]);
 return {...snapshot,enqueue:(itemId:string)=>store.enqueue(itemId,positioningVersionId,setNotice)};
}
