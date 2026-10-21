/** 新手引导状态装配：真实业务信号与账号持久里程碑合并，临时失败不撤销完成状态。 */

import { ENDPOINTS,requestListWithMeta } from "@creatoros/contract";
import { client } from "@/lib/contract-client";
import { readCurrentAccountId,readCurrentGroupId,createHttpTransport } from "@/lib/http-transport";
import {
  resolveOrigin,
  deriveGuidedSteps,
  type OnboardingOrigin,
  type OnboardingState,
} from "./onboarding-steps";

export interface OnboardingWorkspace {readonly groupId:string|null;readonly accountId:string|null;readonly revision?:number;}
let workspaceRevision=0,lastObservedWorkspace:string|undefined,observingWorkspace=false;
function readWorkspaceIdentity():OnboardingWorkspace{const groupId=readCurrentGroupId();return {groupId,accountId:groupId?null:readCurrentAccountId()};}
export function onboardingWorkspaceKey(scope:OnboardingWorkspace):string{return scope.groupId?`group:${scope.groupId}`:`account:${scope.accountId??""}`;}
export function currentOnboardingWorkspace():OnboardingWorkspace{
 if(typeof window!=="undefined"&&!observingWorkspace){
  observingWorkspace=true;
  // 引导装配的生命周期是本页runtime；复用现有失效事件，不创建业务写入或调度器。
  window.addEventListener("creatoros:accounts-changed",event=>{
   const identity=readWorkspaceIdentity(),detail=event.detail as {groupId?:string|null}|undefined;
   if(detail?.groupId&&detail.groupId!==identity.groupId)return;
   workspaceRevision++;lastObservedWorkspace=onboardingWorkspaceKey(identity);
  });
 }
 const identity=readWorkspaceIdentity(),key=onboardingWorkspaceKey(identity);
 if(key!==lastObservedWorkspace){workspaceRevision++;lastObservedWorkspace=key;}
 return {...identity,revision:workspaceRevision};
}
export function assertCurrentWorkspace(scope:OnboardingWorkspace){const latest=currentOnboardingWorkspace();if(onboardingWorkspaceKey(scope)!==onboardingWorkspaceKey(latest)||(scope.revision!==undefined&&scope.revision!==latest.revision))throw Error(scope.groupId?"ONBOARDING_WORKSPACE_CHANGED":"ONBOARDING_ACCOUNT_CHANGED");}

const ORIGIN_KEY = "creatoros:onboarding:origin";
const REVIEWED_PROJECTS_PREFIX =
  "creatoros:onboarding:reviewed-imported-projects:";

export function readOrigin(): OnboardingOrigin {
  try {
    const value = window.localStorage.getItem(ORIGIN_KEY);
    return value === "fresh" || value === "existing" ? value : null;
  } catch {
    return null;
  }
}

export function writeOrigin(origin: "fresh" | "existing"): void {
  try {
    window.localStorage.setItem(ORIGIN_KEY, origin);
  } catch {
    /* 本地引导偏好写失败不阻断产品 */
  }
}

function reviewedProjectsKey(accountId: string): string {
  return `${REVIEWED_PROJECTS_PREFIX}${accountId}`;
}

export function readReviewedImportedProjects(accountId: string | null): boolean {
  if (!accountId) return false;
  try {
    return window.localStorage.getItem(reviewedProjectsKey(accountId)) === "1";
  } catch {
    return false;
  }
}

export function writeReviewedImportedProjects(accountId: string | null): void {
  if (!accountId) return;
  try {
    window.localStorage.setItem(reviewedProjectsKey(accountId), "1");
  } catch {
    /* 本地确认写失败不阻断导航 */
  }
}

export async function loadProjectSignals(accountId = readCurrentAccountId(),scope=currentOnboardingWorkspace()): Promise<{
  readonly hasImportedWorks?: boolean;
  readonly hasCreatedProject?: boolean;
}> {
  try {
    assertCurrentWorkspace(scope);
    if(!scope.groupId&&scope.accountId!==accountId)throw Error("ONBOARDING_ACCOUNT_CHANGED");
    // projects.list 的实际 transport 返回当前账号全量；不能按未实现的页号重复请求。
    const rows = await client.listProjects({params: undefined, query: {page: 1, pageSize: 100}, body: undefined});
    assertCurrentWorkspace(scope);
    if (!Array.isArray(rows)) return {};
    return {
      hasImportedWorks: rows.some(row => row.source === "imported"),
      hasCreatedProject: rows.some(row => ["manual","topic","radar","assistant","quick_create"].includes(row.source)),
    };
  } catch {
    return {};
  }
}

export async function loadRadarSignals(accountId = readCurrentAccountId(),scope=currentOnboardingWorkspace()): Promise<{
  readonly hasBenchmarkMonitor?: boolean;
  readonly hasBenchmarkTopic?: boolean;
}> {
  if (!scope.groupId&&!accountId) return {};
  try {
    assertCurrentWorkspace(scope);
    const workspace = (await client.getIntelligenceWorkspace({
      params: undefined,
      query: scope.groupId?{}:{accountId:accountId!},
      body: undefined,
    })) as {
      sources?: ReadonlyArray<{
        id?: unknown;
        type?: unknown;
        monitorEnabled?: unknown;
        status?: unknown;
      }>;
    };
    const benchmarkSources = (workspace.sources ?? []).filter(
      (source): source is typeof source & { id: string } =>
        typeof source.id === "string" && source.type === "creator_profile",
    );
    const activeSources = benchmarkSources.filter(
      (source) => source.monitorEnabled === true && source.status === "active",
    );
    assertCurrentWorkspace(scope);
    const convertedBySource = await Promise.allSettled(
      benchmarkSources.map((source) =>
        client.listIntelligenceItems({
          params: undefined,
          query: {
            ...(scope.groupId?{}:{accountId:accountId!}),
            sourceId: source.id,
            page: 1,
            pageSize: 1,
            sort: "newest",
            topicState: "converted",
          },
          body: undefined,
        }),
      ),
    );
    assertCurrentWorkspace(scope);
    return {
      hasBenchmarkMonitor: activeSources.length > 0,
      hasBenchmarkTopic: convertedBySource.some(
        (result) =>
          result.status === "fulfilled" &&
          Array.isArray(result.value) &&
          result.value.length > 0,
      ),
    };
  } catch {
    return {};
  }
}

import type {OnboardingStateResource,OnboardingPatch} from "@creatoros/contract";
export type {OnboardingPatch};
export type GroupOnboardingRecord=typeof ENDPOINTS.getGroupOnboarding.response["_output"];
export type OnboardingRecord=OnboardingStateResource|GroupOnboardingRecord;
export function assertCurrentAccount(accountId:string|null){if(readCurrentGroupId()||accountId!==readCurrentAccountId())throw Error("ONBOARDING_ACCOUNT_CHANGED");}
export async function saveOnboarding(accountId:string,body:OnboardingPatch):Promise<OnboardingStateResource>{const scope=currentOnboardingWorkspace();assertCurrentAccount(accountId);const result=await client.patchOnboarding({params:{accountId},query:undefined,body});assertCurrentWorkspace(scope);assertCurrentAccount(accountId);if(result.accountId!==accountId)throw Error("ONBOARDING_ACCOUNT_CHANGED");return result;}
export async function saveGroupOnboarding(groupId:string,body:OnboardingPatch):Promise<GroupOnboardingRecord>{const scope={...currentOnboardingWorkspace(),groupId,accountId:null};assertCurrentWorkspace(scope);const result=await client.patchGroupOnboarding({params:{groupId},query:undefined,body});assertCurrentWorkspace(scope);if(result.groupId!==groupId||result.accountId!==null)throw Error("ONBOARDING_WORKSPACE_CHANGED");return result;}
export function saveWorkspaceOnboarding(scope:OnboardingWorkspace,body:OnboardingPatch):Promise<OnboardingRecord>{assertCurrentWorkspace(scope);if(scope.groupId)return saveGroupOnboarding(scope.groupId,body);if(scope.accountId)return saveOnboarding(scope.accountId,body);throw Error("ONBOARDING_WORKSPACE_REQUIRED");}

export async function loadState():Promise<OnboardingState>{
 const scope=currentOnboardingWorkspace(),{groupId,accountId}=scope;
 if(!groupId&&!accountId){
  const transport=createHttpTransport();
  const [groups,accounts]=await Promise.all([
   requestListWithMeta(transport,ENDPOINTS.listAccountGroups,{params:undefined,query:{page:1,pageSize:1,includeArchived:true},body:undefined}),
   requestListWithMeta(transport,ENDPOINTS.listAccounts,{params:undefined,query:{page:1,pageSize:1},body:undefined}),
  ]);
  assertCurrentWorkspace(scope);
  if(groups.meta.page!==1||accounts.meta.page!==1||groups.meta.total<groups.data.length||accounts.meta.total<accounts.data.length)throw Error("引导所需账号组列表尚未完整读取");
  return {groupId:null,accountId:null,origin:null,needsFirstGroup:groups.meta.total===0&&groups.data.length===0&&accounts.meta.total===0&&accounts.data.length===0};
 }
 let record:OnboardingRecord=groupId?await client.getGroupOnboarding({params:{groupId},query:undefined,body:undefined}):await client.getOnboarding({params:{accountId:accountId!},query:undefined,body:undefined});
 assertCurrentWorkspace(scope);
 if(groupId?( !("groupId" in record)||record.groupId!==groupId||record.accountId!==null):record.accountId!==accountId)throw Error("ONBOARDING_WORKSPACE_CHANGED");
 // 旧全局偏好仅归旧account一次；组引导不自动接收任何成员的历史状态。
 if(!groupId&&accountId)try{
  const migratedKey="creatoros:onboarding:legacy-migrated-account";
  if(!localStorage.getItem(migratedKey)&&record.updatedAt===null){const origin=readOrigin(),hidden=localStorage.getItem("creatoros:onboarding:hidden")==="1";if(origin||hidden)record=await saveOnboarding(accountId,{...(origin?{origin}:{}),...(hidden?{hidden:true}:{})});assertCurrentWorkspace(scope);localStorage.setItem(migratedKey,accountId);}
 }catch{/* 旧偏好迁移失败不覆盖实际后端状态。 */}
 assertCurrentWorkspace(scope);
 if(record.hidden)return {groupId,accountId,origin:record.origin,completedSteps:record.completedSteps,preferences:record};
 const [projectSignals,radarSignals,bound,hasPositioningProfile]=await Promise.all([
  loadProjectSignals(accountId,scope),loadRadarSignals(accountId,scope),groupId?loadGroupMembers(groupId,scope):loadAccountBound(accountId!),loadHasProfile(scope),
 ]);
 assertCurrentWorkspace(scope);
 const state:OnboardingState={groupId,accountId,...(groupId?{memberCount:typeof bound==="number"?bound:undefined}:{douyinLoggedIn:bound===true}),origin:resolveOrigin(record.origin,projectSignals),...projectSignals,...radarSignals,hasPositioningProfile,hasReviewedImportedProjects:record.completedSteps.includes("review-imported-projects")||(!groupId&&readReviewedImportedProjects(accountId)),completedSteps:record.completedSteps,preferences:record};
 const completedSteps=deriveGuidedSteps(state).filter(step=>step.done).map(step=>step.key);
 if(completedSteps.some(key=>!record.completedSteps.includes(key))||state.origin!==record.origin){try{const preferences=await saveWorkspaceOnboarding(scope,{completedSteps,origin:state.origin??null});return {...state,completedSteps:preferences.completedSteps,preferences};}catch{assertCurrentWorkspace(scope);return {...state,persistenceError:"进度暂未保存，请重试。"};}}
 return state;
}
async function loadGroupMembers(groupId:string,scope:OnboardingWorkspace):Promise<number|undefined>{try{assertCurrentWorkspace(scope);const group=await client.getAccountGroup({params:{groupId},query:undefined,body:undefined});assertCurrentWorkspace(scope);if(group.id!==groupId||!Array.isArray(group.members))return undefined;return new Set(group.members.filter(member=>member.leftAt===null&&member.status==="active").map(member=>member.accountId)).size;}catch{return undefined;}}

async function loadAccountBound(accountId: string): Promise<boolean | undefined> {
  try {
    const account = await client.getAccount({params: {accountId},query: undefined,body: undefined});
    return account.id === accountId ? true : undefined;
  } catch { return undefined; }
}

export async function loadHasProfile(scope=currentOnboardingWorkspace()): Promise<boolean | undefined> {
  try {
    assertCurrentWorkspace(scope);
    const center = (await client.getPositioningCenter({
      params: undefined,
      query: undefined,
      body: undefined,
    })) as { profile?: unknown };
    assertCurrentWorkspace(scope);
    return center.profile !== null && center.profile !== undefined;
  } catch {
    return undefined;
  }
}
