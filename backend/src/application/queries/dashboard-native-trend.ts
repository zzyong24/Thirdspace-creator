import type {NativeReportResource,RequestContext,GroupDashboardTrend} from '@creatoros/contract';

export type NativeReportsPort={listNativeReports(ctx:RequestContext,input:{accountId:string;cursor:string|null;pageSize:number}):Promise<{items:NativeReportResource[];nextCursor:string|null;total:number}>};
type Input={ctx:RequestContext;accountId:string;startDate:string;endDate:string;reports:NativeReportsPort};
type Day={at:number;values:Set<number|null>;reportIds:Set<string>};
const dayMs=86400000;
const dayTime=(day:string)=>Date.parse(day+'T00:00:00Z');
const dayKey=(time:number)=>new Date(time).toISOString().slice(0,10);

export function unavailablePerformance(reason:string,accountId:string|null=null,article=false):GroupDashboardTrend['performanceTrend']{
 return {mode:'unavailable',unit:article?'人':'次',valueLabel:article?'阅读人数':'播放量',reason,accountId,observedAt:null,reportIds:[]};
}

/** SEMANTIC_BOUNDARY_ALLOW: 只按已核原生报表协议、真实归属、统计日期和时间戳投影；不判断内容、不推测总计或创作效果。 */
export async function readDashboardNativeTrend({ctx,accountId,startDate,endDate,reports}:Input):Promise<Pick<GroupDashboardTrend,'trend'|'performanceTrend'>>{
 const days=new Map<string,Day>(),seenCursors=new Set<string>();
 const start=dayTime(startDate),end=dayTime(endDate),totalDays=(end-start)/dayMs+1;
 let cursor:string|null=null;
 try{
  do{
   const cursorKey=cursor??'first';if(seenCursors.has(cursorKey))throw Error('重复分页');seenCursors.add(cursorKey);
   const page=await reports.listNativeReports(ctx,{accountId,cursor,pageSize:100});
   for(const report of page.items){
    if(report.userId!==ctx.userId||report.groupId!==ctx.groupId||report.accountId!==accountId)throw Error('报表归属不一致');
    if(report.platform!=='wechatVideo'||report.kind!=='channelsDaily'||report.scope!=='accountDaily'||report.accumulation!=='daily'||report.selection.meaning!=='statisticsDates'||report.selection.timeZone!=='Asia/Shanghai')continue;
    const first=Math.max(start,dayTime(report.selection.startDate)),last=Math.min(end,dayTime(report.selection.endDate));
    if(first>last)continue;
    // 原生解析器最多10000统计行。异常持久输入只使本图不可读，不申请巨型空数组。
    if((last-first)/dayMs>=10000)throw Error('报表日期范围异常');
    const at=Date.parse(report.observedAt);if(!Number.isFinite(at))throw Error('报表时间异常');
    const table=report.tables.find(table=>table.columns.some(column=>column.key==='时间'&&column.unit==='date')&&table.columns.some(column=>column.key==='播放'&&column.unit==='count'));
    const rowValues=new Map<string,Set<number|null>>();
    if(table){
     const dateIndex=table.columns.findIndex(column=>column.key==='时间'&&column.unit==='date'),valueIndex=table.columns.findIndex(column=>column.key==='播放'&&column.unit==='count');
     for(const row of table.rows){
      const date=row[dateIndex]?.value,value=row[valueIndex]?.value;
      if(typeof date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(date))continue;
      let values=rowValues.get(date);if(!values)rowValues.set(date,values=new Set());
      values.add(typeof value==='number'&&Number.isFinite(value)&&value>=0?value:null);
     }
    }
    for(let time=first;time<=last;time+=dayMs){
     const day=dayKey(time),existing=days.get(day),values=rowValues.get(day)??new Set<number|null>([null]);
     if(!existing||at>existing.at)days.set(day,{at,values:new Set(values),reportIds:new Set([report.id])});
     else if(at===existing.at){for(const value of values)existing.values.add(value);existing.reportIds.add(report.id);}
    }
   }
   // 0和明确null都已解决该日；同observedAt仍可能跨页冲突，严格越过最早选中时间才可停止。
   const covered=days.size===totalDays;
   const oldestChosen=covered?Math.min(...[...days.values()].map(day=>day.at)):null;
   const tail=page.items.at(-1);
   if(page.nextCursor===null||covered&&tail&&oldestChosen!==null&&Date.parse(tail.observedAt)<oldestChosen)break;
   const offset=cursor===null?0:Number(cursor),next=Number(page.nextCursor);
   if(!page.items.length||!Number.isSafeInteger(next)||next!==offset+page.items.length||next>=page.total)throw Error('分页未推进');
   cursor=page.nextCursor;
  }while(cursor!==null);
 }catch{return {trend:[],performanceTrend:unavailablePerformance('read_failed',accountId)};}
 const points=new Map<string,number|null>();
 for(const [day,sample] of days)points.set(day,sample.values.size===1?[...sample.values][0]!:null);
 // 通常窗口逐日留空；超长窗口只保真实日期与空档边界，消费端时间轴保持真实间距。
 if(totalDays<=10000){for(let time=start;time<=end;time+=dayMs){const day=dayKey(time);if(!points.has(day))points.set(day,null);}}
 else{
  const ordered=[...points.keys()].sort();points.set(startDate,points.get(startDate)??null);points.set(endDate,points.get(endDate)??null);
  for(let i=1;i<ordered.length;i++){const before=dayTime(ordered[i-1]!),after=dayTime(ordered[i]!);if(after-before>dayMs)points.set(dayKey(before+dayMs),null);}
 }
 const trend=[...points].sort(([a],[b])=>a.localeCompare(b)).map(([label,value])=>({label,value}));
 const measured=trend.some(point=>point.value!==null),reportIds=[...new Set([...days.values()].flatMap(day=>[...day.reportIds]))].sort();
 return {trend,performanceTrend:{...unavailablePerformance(reportIds.length?'no_values':'no_report',accountId),mode:measured?'daily':'unavailable',reason:measured?null:reportIds.length?'no_values':'no_report',observedAt:days.size?new Date(Math.max(...[...days.values()].map(day=>day.at))).toISOString():null,reportIds}};
}
