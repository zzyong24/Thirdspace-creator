"use client";

import * as React from "react";
import {CreatorDatePicker,beijingToday,type CreatorDateRange} from "@/components/ui/creator-date-picker";
export type ReportDateMode="date"|"week"|"month"|"range";
/** 日期字符串只作日历运算，不按浏览器时区把午夜换算成其他日期。 */
export function shiftReportDate(date:string,days:number){const value=new Date(`${date}T00:00:00Z`);value.setUTCDate(value.getUTCDate()+days);return value.toISOString().slice(0,10);}
export function reportPreset(days:1|7|30,today=beijingToday()):CreatorDateRange{return {startDate:shiftReportDate(today,-days),endDate:shiftReportDate(today,-1)};}
/** SEMANTIC_BOUNDARY_ALLOW: 纯日历边界计算，不选择内容或判断表现。 */
export function periodForMode(date:string,mode:Exclude<ReportDateMode,"range">):CreatorDateRange{
 if(mode==='date')return {startDate:date,endDate:date};
 const d=new Date(`${date}T00:00:00Z`);
 if(mode==='week'){const startDate=shiftReportDate(date,-((d.getUTCDay()+6)%7));return {startDate,endDate:shiftReportDate(startDate,6)};}
 return {startDate:`${date.slice(0,7)}-01`,endDate:new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).toISOString().slice(0,10)};
}
function modeForPeriod(value:CreatorDateRange):ReportDateMode{
 if(value.startDate===value.endDate)return 'date';
 for(const mode of ['month','week'] as const){const p=periodForMode(value.startDate,mode);if(p.startDate===value.startDate&&p.endDate===value.endDate)return mode;}
 return 'range';
}
const modes=[{value:"date",label:"单天"},{value:"week",label:"周"},{value:"month",label:"月"},{value:"range",label:"自定义"}] as const;
export function ReportDateRange({value,onChange,disabled=false}:{value:CreatorDateRange;onChange:(range:CreatorDateRange)=>void;disabled?:boolean}){
  const [mode,setMode]=React.useState<ReportDateMode>(modeForPeriod(value));
  React.useEffect(()=>setMode(modeForPeriod(value)),[value.startDate,value.endDate]);
  const apply=(range:CreatorDateRange|null)=>{if(range)onChange(range);};
  return <div className="flex min-w-0 flex-wrap items-center gap-3" aria-label="报表日期范围">
    <div role="group" aria-label="日期范围模式" className="inline-flex rounded-control border border-border bg-surface p-1">
      {modes.map(item=><button key={item.value} type="button" disabled={disabled} aria-pressed={mode===item.value} onClick={()=>{setMode(item.value);if(item.value!=="range")onChange(periodForMode(value.startDate,item.value));}} className={`rounded px-3 py-1.5 text-sm disabled:opacity-50 ${mode===item.value?"bg-brand-soft font-medium text-brand":"text-muted-foreground hover:text-foreground"}`}>{item.label}</button>)}
    </div>
    {mode==="date"?<CreatorDatePicker key="date" mode="date" label="报表日期" value={value.startDate} disabled={disabled} onChange={date=>{if(date)onChange({startDate:date,endDate:date});}}/>:<CreatorDatePicker key={mode} mode={mode} label={mode==="week"?"报表周":mode==="month"?"报表月份":"报表起止日期"} value={value} disabled={disabled} onChange={apply}/>}
    <div className="flex flex-wrap items-center gap-1" role="group" aria-label="快捷日期范围">{[{days:1,label:"昨天"},{days:7,label:"近 7 天"},{days:30,label:"近 30 天"}].map(item=><button key={item.days} type="button" disabled={disabled} className="rounded-control px-2.5 py-1.5 text-sm text-brand hover:bg-brand-soft disabled:opacity-50" onClick={()=>{setMode(item.days===1?"date":"range");onChange(reportPreset(item.days as 1|7|30));}}>{item.label}</button>)}</div>
    <span className="text-xs text-muted-foreground">北京时间 · {value.startDate===value.endDate?value.startDate:`${value.startDate} 至 ${value.endDate}`}</span>
  </div>;
}
