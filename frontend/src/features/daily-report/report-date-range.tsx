"use client";

import * as React from "react";
import {CreatorDatePicker,beijingToday,type CreatorDateRange} from "@/components/ui/creator-date-picker";
/** 日期字符串只作日历运算，不按浏览器时区把午夜换算成其他日期。 */
export function shiftReportDate(date:string,days:number){const value=new Date(`${date}T00:00:00Z`);value.setUTCDate(value.getUTCDate()+days);return value.toISOString().slice(0,10);}
export function reportPreset(days:1|7|30,today=beijingToday()):CreatorDateRange{return {startDate:shiftReportDate(today,-days),endDate:shiftReportDate(today,-1)};}
export function ReportDateRange({value,onChange,disabled=false}:{value:CreatorDateRange;onChange:(range:CreatorDateRange)=>void;disabled?:boolean}){
  return <div className="flex min-w-0 flex-wrap items-center gap-3" aria-label="报表日期范围">
    <CreatorDatePicker mode="range" label="报表起止日期" value={value} disabled={disabled} onChange={range=>{if(range)onChange(range);}}/>
    <div className="flex flex-wrap items-center gap-1" role="group" aria-label="快捷日期范围">{([{days:1,label:"昨天"},{days:7,label:"近 7 天"},{days:30,label:"近 30 天"}] as const).map(item=>{const preset=reportPreset(item.days),selected=preset.startDate===value.startDate&&preset.endDate===value.endDate;return <button key={item.days} type="button" disabled={disabled} aria-pressed={selected} className={`rounded-control px-2.5 py-1.5 text-sm text-brand hover:bg-brand-soft disabled:opacity-50 ${selected?"bg-brand-soft font-medium":""}`} onClick={()=>onChange(preset)}>{item.label}</button>;})}</div>
    <span className="text-xs text-muted-foreground">北京时间</span>
  </div>;
}
