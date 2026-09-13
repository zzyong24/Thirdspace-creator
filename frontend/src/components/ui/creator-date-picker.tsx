"use client";

import * as React from "react";
import {CalendarDays} from "lucide-react";
import {cn} from "@/lib/utils";

export type CreatorDateRange = {startDate:string;endDate:string};
type CommonProps = {
  id?:string;
  label?:string;
  placeholder?:string;
  disabled?:boolean;
  className?:string;
  allowClear?:boolean;
  minDate?:string;
  maxDate?:string;
};
export type CreatorDatePickerProps = CommonProps & (
  | {mode?:"date";value:string|null;onChange:(value:string|null)=>void}
  | {mode:"range"|"week"|"month";value:CreatorDateRange|null;onChange:(value:CreatorDateRange|null)=>void}
);
export type CreatorDatePickerAntdProps = CreatorDatePickerProps & {open:boolean;onOpenChange:(open:boolean)=>void};
let pickerPromise:Promise<typeof import("./creator-date-picker-antd")>|null=null;
function loadPicker(){
  if(!pickerPromise)pickerPromise=import("./creator-date-picker-antd").catch(error=>{pickerPromise=null;throw error;});
  return pickerPromise;
}
export function beijingToday(now=new Date()){
  const parts=new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Shanghai",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(now);
  return ["year","month","day"].map(type=>parts.find(part=>part.type===type)!.value).join("-");
}
function valueLabel(props:CreatorDatePickerProps){
  if(!props.value)return props.placeholder??"选择日期";
  if(typeof props.value==="string")return props.value;
  return props.value.startDate===props.value.endDate?props.value.startDate:`${props.value.startDate} 至 ${props.value.endDate}`;
}
/** 首屏仅渲染轻量按钮；用户打开日历时才请求 Ant Design 及中文日期模块。 */
export function CreatorDatePicker(props:CreatorDatePickerProps){
  const [Picker,setPicker]=React.useState<React.ComponentType<CreatorDatePickerAntdProps>|null>(null);
  const [open,setOpen]=React.useState(false),[loading,setLoading]=React.useState(false),[error,setError]=React.useState<string|null>(null);
  const mounted=React.useRef(true);
  React.useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  async function show(){
    if(props.disabled||loading)return;
    setError(null);setLoading(true);
    try{const module=await loadPicker();if(mounted.current){setPicker(()=>module.default);setOpen(true);}}
    catch{if(mounted.current)setError("日历加载失败，请重试");}
    finally{if(mounted.current)setLoading(false);}
  }
  return <div className={cn("inline-flex min-w-0 max-w-full flex-col gap-1",props.className)}>
    {Picker?<Picker {...props} className="w-full" open={open} onOpenChange={setOpen}/>:<button id={props.id} type="button" aria-label={props.label??"选择日期"} aria-haspopup="dialog" aria-expanded={false} aria-busy={loading} disabled={props.disabled||loading} onClick={()=>void show()} className="inline-flex min-h-9 min-w-0 items-center gap-2 rounded-control border border-border bg-surface px-3 py-2 text-sm text-foreground hover:bg-surface-subtle disabled:opacity-50">
      <CalendarDays className="size-4 shrink-0 text-muted-foreground"/><span className="truncate">{loading?"正在加载日历…":valueLabel(props)}</span>
    </button>}
    {error&&<span role="alert" className="text-xs text-destructive">{error}</span>}
  </div>;
}
