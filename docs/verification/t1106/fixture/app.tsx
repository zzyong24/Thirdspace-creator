import * as React from "react";
import {createRoot} from "react-dom/client";
import "@fontsource-variable/noto-sans-sc";
import "../../../../frontend/src/app/globals.css";
import {IntelligenceWorkbench} from "../../../../frontend/src/features/intelligence/intelligence-workbench";
import type {RadarApi, RadarItemDetail, RadarItemRow, RadarRun, RadarWorkspace} from "../../../../frontend/src/features/intelligence/intelligence-workbench-types";
import type {ExecutionTaskResourceV2} from "@creatoros/contract";
import installedWitness from "../installed-witness.json";

// 本文件只承担隔离 API fixture；正式组件、hook、Dialog、tokens、styles 都直接引用源码。
// 不访问平台认证、Cookie、数据库、模型或宿主 App，模拟成功不构成这些服务的验收。
// 历史字段和原任务链来自只读installed-witness投影；执行函数全部为fixture。
const groupId = installedWitness.task.groupId;
const collectorAccountId = installedWitness.task.accountId;
const sourceId = installedWitness.sources[0]!.sourceId;
const childTaskId = installedWitness.task.checkpoint.transcriptTaskId;
const taskId = installedWitness.task.id;
const createdAt = installedWitness.task.createdAt;
const calls: Array<{at: string; method: string; input: unknown}> = [];
function record(method: string, input: unknown = null) {
  calls.push({at: new Date().toISOString(), method, input: structuredClone(input)});
}
const workspace: RadarWorkspace = {
  collections: [{id:"fixture-favorites",parentId:null,name:"我的收藏",kind:"system",sortOrder:0,version:1}],
  sources: installedWitness.sources.map(source=>({id:source.sourceId,collectionId:null,type:"creator_profile",displayName:source.name,canonicalUrl:"https://www.douyin.com/user/fixture-profile",collector:{accountId:source.collectorAccountId,accountHandle:"月明水清深",platform:"douyin",availability:"active"},monitorEnabled:true,syncPolicy:{},status:"active",lastRunAt:source.lastRunAt,nextRunAt:null,version:1})),
  memberships: [],
  health: installedWitness.sources.map(source=>({...source.health})),
  pendingCount:1,blockedCount:1,
};
const detail: RadarItemDetail = {
  // 作品标题/作者/指标取用户截图里的代表内容；规范URL不向真实平台请求。
  item:{id:installedWitness.task.ownerId,type:"video",platform:"douyin",canonicalUrl:"https://www.douyin.com/video/fixture-content",authorName:"王温特",title:"做数字人，你到底要不要花钱？文档和一键包都准备好了",summary:null,coverUrl:null,publishedAt:"2026-10-06T03:00:00.000Z",capturedAt:createdAt},
  metrics:[{id:"fixture-metric",capturedAt:createdAt,likeCount:1,commentCount:1,collectCount:0,shareCount:0}],
  observations:[{id:"fixture-observation",sourceId:installedWitness.sources[1]!.sourceId,firstSeenAt:createdAt,lastSeenAt:createdAt}],
  snapshots:[{id:"fixture-snapshot",sourceId:installedWitness.sources[1]!.sourceId,title:"做数字人，你到底要不要花钱？",capturedAt:createdAt,finalUrl:"https://www.douyin.com/video/fixture-content"}],
  transcript:{itemId:installedWitness.task.ownerId,status:"failed",text:null,errorCode:"STALE_WORKSPACE_MEMBERSHIP"},transforms:[],
};
const rows: RadarItemRow[] = [{item:detail.item,latestMetric:detail.metrics[0]!,sourceCount:1,transcriptState:"attention",progressState:"attention"},
  {item:{...detail.item,id:"fixture-item-second",title:"你到底要不要让 AI 替你24小时干活？",publishedAt:"2026-10-02T23:30:00.000Z"},latestMetric:{...detail.metrics[0]!,id:"fixture-metric-second",likeCount:194,commentCount:10},sourceCount:1,progressState:"pending_transcript"}];
let upgrade = {
  ...installedWitness.task,userId:"fixture-user-t1106",ownerType:"item_import",priority:1,idempotencyKey:"fixture-original-idempotency-t1106",leaseOwner:null,leaseExpiresAt:null,heartbeatAt:null,attempt:18,maxAttempts:3,costEstimate:null,
} as ExecutionTaskResourceV2;
let currentRun: RadarRun | null = null;
let releaseStart: (()=>void) | undefined;
let releaseReconnect: (()=>void) | undefined;
let startNumber = 0;
const unexpected = async (method: string, input: unknown) => { record(method,input); throw new Error(`未授权 fixture 操作：${method}`); };
const api = {
  async listCollectors(input) {record("listCollectors",input);return [{accountId:collectorAccountId,accountHandle:"月明水清深",platform:"douyin"}];},
  async listItems(input) {record("listItems",input);return {items:rows,page:1,pageSize:100,total:rows.length,hasMore:false};},
  async getItem(input) {record("getItem",input);return structuredClone(detail);},
  async listProjectUpgrades(input) {record("listProjectUpgrades",input);return {tasks:[structuredClone(upgrade)],total:1};},
  async getProjectUpgrade(input) {record("getProjectUpgrade",input);return structuredClone(upgrade);},
  async commandTask(input) {record("commandTask",input);if(input.taskId!==taskId||input.command!=="retry")throw new Error("原任务ID或命令发生变化");upgrade={...upgrade,status:"queued",errorCode:null,errorMessage:null};},
  async enqueueProjectUpgrades(input) {return unexpected("enqueueProjectUpgrades",input);},
  async startRun(input) {
    record("startRun",{...input,collectorAccountId});
    startNumber += 1;
    currentRun={id:`fixture-new-run-${startNumber}`,sourceId:input.sourceId,trigger:"manual",status:"running",startedAt:createdAt,finishedAt:null,scannedCount:0,newCount:0,updatedCount:0,skippedCount:0,failedCount:0,errorCode:null,errorSummary:null,nextAction:"none",createdAt};
    workspace.health[0]={...workspace.health[0]!,lastRunId:currentRun.id,lastRunStatus:"running",lastErrorCode:null};
    await new Promise<void>(resolve=>{releaseStart=resolve;});
    return {run:structuredClone(currentRun),task:{id:`fixture-sync-task-${startNumber}`,status:"running"}};
  },
  async getRun(input) {record("getRun",input);if(!currentRun)throw new Error("没有在途同步任务");return {run:structuredClone(currentRun),events:[]};},
  async reconnectCollector(input) {record("reconnectCollector",input);await new Promise<void>(resolve=>{releaseReconnect=resolve;});return {loggedIn:true};},
  async listRuns(input) {record("listRuns",input);return currentRun?[structuredClone(currentRun)]:[];},
  async updateSource(input) {record("updateSource",input);return {...workspace.sources.find(source=>source.id===input.sourceId)!,monitorEnabled:input.monitorEnabled,version:2};},
  previewProfile:input=>unexpected("previewProfile",input),previewWeb:input=>unexpected("previewWeb",input),listFavoriteFolders:input=>unexpected("listFavoriteFolders",input),createCollection:input=>unexpected("createCollection",input),createSource:input=>unexpected("createSource",input),deleteSource:input=>unexpected("deleteSource",input),importDouyinShare:input=>unexpected("importDouyinShare",input),enqueueTranscript:input=>unexpected("enqueueTranscript",input),uploadTranscript:input=>unexpected("uploadTranscript",input),previewTopic:input=>unexpected("previewTopic",input),confirmTopic:input=>unexpected("confirmTopic",input),promoteCandidate:input=>unexpected("promoteCandidate",input),
} satisfies RadarApi;
window.__t1106Fixture={
  calls,
  identities:{groupId,collectorAccountId,sourceId,taskId,childTaskId},
  releaseStart(){releaseStart?.();releaseStart=undefined;},
  completeRun(){if(!currentRun)throw new Error("没有原运行可结束");currentRun={...currentRun,status:"succeeded_no_change",finishedAt:createdAt,scannedCount:13,updatedCount:13};workspace.health[0]={...workspace.health[0]!,lastRunId:currentRun.id,lastRunStatus:"succeeded_no_change",lastErrorCode:null,blockedCount:0};},
  releaseReconnect(){releaseReconnect?.();releaseReconnect=undefined;},
  resetHistoricalLoginScenario(){workspace.health[0]={...installedWitness.sources[0]!.health};window.dispatchEvent(new Event("t1106:fixture-refresh"));},
  snapshot(){return {upgrade:structuredClone(upgrade),currentRun:structuredClone(currentRun),workspace:structuredClone(workspace)};},
};
declare global {interface Window {__t1106Fixture:{calls:typeof calls;identities:{groupId:string;collectorAccountId:string;sourceId:string;taskId:string;childTaskId:string};releaseStart():void;completeRun():void;releaseReconnect():void;resetHistoricalLoginScenario():void;snapshot():unknown};}}
function FixtureApp(){
  const [,redraw]=React.useReducer((version:number)=>version+1,0);
  React.useEffect(()=>{window.addEventListener("t1106:fixture-refresh",redraw);return()=>window.removeEventListener("t1106:fixture-refresh",redraw);},[]);
  return <div style={{height:"100dvh",padding:"24px",background:"var(--creatoros-canvas)"}}><IntelligenceWorkbench groupId={groupId} workspace={{...workspace,health:[...workspace.health]}} items={rows} initialDetail={detail} positioningVersionId="fixture-positioning-t1106" api={api}/></div>;
}
createRoot(document.getElementById("root")!).render(<FixtureApp/>);
