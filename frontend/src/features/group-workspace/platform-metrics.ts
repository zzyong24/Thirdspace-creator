import type {GroupWorkspace} from './workspace-query';

export const normalizeWorkspacePlatform=(platform:string)=>platform==='wechatOfficialAccount'?'wechatOfficial':platform;
export function selectedWorkspacePlatform(workspace:GroupWorkspace){
 const platform=workspace.platform??workspace.accounts.find(account=>account.id===workspace.accountId)?.platform;
 return platform?normalizeWorkspacePlatform(platform):null;
}
// SEMANTIC_BOUNDARY_ALLOW: 根据平台定义选择指标单位，不判断内容语义或推测缺失数值。
export function workspaceMetricKinds(workspace:GroupWorkspace){
 const platform=selectedWorkspacePlatform(workspace);
 return platform===null?['views','reads','browses'] as const:platform==='wechatOfficial'?['reads'] as const:platform==='xiaohongshu'||platform==='x'?['browses'] as const:['views'] as const;
}
export const workspaceMetricDefinitions={
 views:{label:'视频累计播放（次）',column:'播放（次）',chart:'视频播放 · 平台比较',slot:'group-video',shape:'platform-views',empty:'当前筛选内暂无视频播放指标'},
 reads:{label:'文章累计阅读（次）',column:'阅读（次）',chart:'文章阅读 · 平台比较',slot:'group-article',shape:'platform-reads',empty:'当前筛选内暂无文章阅读指标'},
 browses:{label:'累计浏览（次）',column:'浏览（次）',chart:'浏览 · 平台比较',slot:'group-browse',shape:'platform-browses',empty:'当前筛选内暂无浏览指标'},
} as const;

export function workspacePrimaryMetrics(workspace:GroupWorkspace){
 return [{id:'g-collected',label:'已采集作品（条）',value:workspace.collected?.state==='ready'?workspace.collected.catalogWorkCount:null},...workspaceMetricKinds(workspace).map(kind=>({id:kind==='views'?'g-video':kind==='reads'?'g-read':'g-browse',label:workspaceMetricDefinitions[kind].label,value:(kind==='views'?workspace.videoViews:kind==='reads'?workspace.articleReads:workspace.browseViews)??null}))];
}
