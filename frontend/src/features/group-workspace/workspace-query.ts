import {groupWorkspaceQuery,type ENDPOINTS,type GroupWorkspaceQuery} from "@creatoros/contract";
export type GroupWorkspace=typeof ENDPOINTS.getGroupOverview.response["_output"]["workspace"];
type PlatformId=NonNullable<GroupWorkspace["platform"]>;
export const WORKSPACE_PLATFORMS:readonly {id:PlatformId;label:string}[]=[{id:"douyin",label:"抖音"},{id:"kuaishou",label:"快手"},{id:"wechatVideo",label:"视频号"},{id:"wechatOfficial",label:"公众号"},{id:"xiaohongshu",label:"小红书"}];
export function platformName(platform:string){return WORKSPACE_PLATFORMS.find(p=>p.id===platform)?.label??platform;}
/** SEMANTIC_BOUNDARY_ALLOW: 校验公开查询字段与日历日期，不选择账号或内容。归属由服务端再校验。 */
export function workspaceQueryFromSearch(search:Record<string,string|string[]|undefined>):GroupWorkspaceQuery {
 const query:GroupWorkspaceQuery={};
 const platform=typeof search.platform==="string"?search.platform:undefined;
 if(platform&&groupWorkspaceQuery.safeParse({platform}).success)query.platform=platform as PlatformId;
 if(typeof search.accountId==="string"&&search.accountId.trim())query.accountId=search.accountId.trim();
 const startDate=typeof search.startDate==="string"?search.startDate:typeof search.date==="string"?search.date:undefined;
 const endDate=typeof search.endDate==="string"?search.endDate:typeof search.date==="string"?search.date:undefined;
 if(startDate&&endDate&&groupWorkspaceQuery.safeParse({startDate,endDate}).success){query.startDate=startDate;query.endDate=endDate;}
 return query;
}
export function workspaceFilterHref(path:string,current:URLSearchParams,change:{platform?:string|null;accountId?:string|null;startDate?:string;endDate?:string}){
 const query=new URLSearchParams(current);
 if("platform" in change){if(change.platform)query.set("platform",change.platform);else query.delete("platform");query.delete("accountId");}
 if("accountId" in change){if(change.accountId)query.set("accountId",change.accountId);else query.delete("accountId");}
 if(change.startDate&&change.endDate){query.delete("date");query.set("startDate",change.startDate);query.set("endDate",change.endDate);}
 return `${path}${query.size?`?${query}`:""}`;
}
