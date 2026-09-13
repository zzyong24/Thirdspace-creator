import type {RequestContext, ENDPOINTS} from "@creatoros/contract";
type DailyReportPage=typeof ENDPOINTS.getDailyReport.response["_output"];
type Projects=ReturnType<typeof import("../../modules/projects").createProjectsService>;
type Publishing=ReturnType<typeof import("../../modules/publishing").createPublishingService>;
type Analytics=ReturnType<typeof import("../../modules/analytics").createAnalyticsService>;
export interface DailyReportPorts {
 now:()=>string;
 projectsService:Pick<Projects,"listProjectsForComposition"|"listOutputRefsByProjects">;
 publishingService:Pick<Publishing,"listPublicationsByOutputIds">;
 analyticsService:Pick<Analytics,"listLatestSnapshotsByPublicationIds">;
 trafficService:Pick<import("../../modules/analytics").TrafficService,"getProject">;
 readAccountName?:(ctx:RequestContext)=>Promise<string|null>;
 readScript:(ctx:RequestContext,projectId:string)=>Promise<string|null>;
 readPositioning:(ctx:RequestContext)=>Promise<string|null>;
}
/** SEMANTIC_BOUNDARY_ALLOW: 仅确定北京时间日期边界与真实指标字段，不进行内容选择或运营归因。 */
export function yesterdayBeijing(now:string){
 const day=new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Shanghai",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date(now));
 const start=new Date(new Date(day+"T00:00:00+08:00").getTime()-86400000);
 const date=new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Shanghai",year:"numeric",month:"2-digit",day:"2-digit"}).format(start);
 return {date,start:start.getTime(),end:start.getTime()+86400000};
}
export function createDailyReportApplication(ports:DailyReportPorts){return {async getDailyReport(ctx:RequestContext,date?:string):Promise<DailyReportPage>{
 const generatedAt=ports.now();
 const window=date?{date,start:Date.parse(date+"T00:00:00+08:00"),end:Date.parse(date+"T00:00:00+08:00")+86400000}:yesterdayBeijing(generatedAt);
 if(date&&(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(window.start)||new Date(date+"T00:00:00Z").toISOString().slice(0,10)!==date))throw new Error("日期无效");
 const report:DailyReportPage={date:window.date,timeZone:"Asia/Shanghai",generatedAt,accountId:ctx.accountId??null,accountName:null,positioning:null,warnings:[],works:[]};
 if(!ctx.accountId)return report;
 try{report.accountName=await ports.readAccountName?.(ctx)??null;}catch{report.warnings.push("账号名称暂时读取失败");}
 const projects=await ports.projectsService.listProjectsForComposition(ctx);
 const refs=await ports.projectsService.listOutputRefsByProjects(ctx,projects.map(p=>p.id));
 const pubs=await ports.publishingService.listPublicationsByOutputIds(ctx,refs.map(r=>r.outputId));
 const byOutput=new Map(refs.map(r=>[r.outputId,r])),byProject=new Map(projects.map(p=>[p.id,p]));
 const selected=pubs.filter(p=>p.accountId===ctx.accountId&&p.status==="published"&&!p.hiddenAt&&!p.removedAt&&p.publishedAt&&Date.parse(p.publishedAt)>=window.start&&Date.parse(p.publishedAt)<window.end&&byOutput.has(p.contentOutputId));
 const snapshots=await ports.analyticsService.listLatestSnapshotsByPublicationIds(ctx,selected.map(p=>p.id));
 const byPublication=new Map(snapshots.map(s=>[s.publicationId,s]));
 try{report.positioning=await ports.readPositioning(ctx);}catch{report.warnings.push("定位暂时读取失败");}
 const projectData=new Map<string,{script:string|null;traffic:DailyReportPage["works"][number]["traffic"]}>();
 for(const pub of selected){
  const ref=byOutput.get(pub.contentOutputId)!;
  if(!projectData.has(ref.projectId)){
   let script:string|null=null,traffic:DailyReportPage["works"][number]["traffic"]=[];
   try{script=await ports.readScript(ctx,ref.projectId);}catch{report.warnings.push("部分作品稿件读取失败");}
   try{traffic=(await ports.trafficService.getProject(ctx,ref.projectId)).items;}catch{report.warnings.push("部分流量来源读取失败");}
   projectData.set(ref.projectId,{script,traffic});
  }
  const detail=projectData.get(ref.projectId)!,snapshot=byPublication.get(pub.id),metrics:Record<string,number>={};
  for(const [key,value] of Object.entries(snapshot?.rawMetrics??{}))if(typeof value==="number"&&Number.isFinite(value))metrics[key]=value;
  report.works.push({publicationId:pub.id,projectId:ref.projectId,title:byProject.get(ref.projectId)?.title||ref.title||"未命名作品",publishedAt:pub.publishedAt!,capturedAt:snapshot?.capturedAt??null,script:detail.script,metrics,traffic:detail.traffic.filter(t=>t.publicationId===pub.id)});
 }
 report.works.sort((a,b)=>b.publishedAt.localeCompare(a.publishedAt));report.warnings=[...new Set(report.warnings)];return report;
}};}
