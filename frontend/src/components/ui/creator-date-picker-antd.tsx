"use client";

import * as React from "react";
import DatePicker from "antd/es/date-picker";
import ConfigProvider from "antd/es/config-provider";
import theme from "antd/es/theme";
import zhCN from "antd/es/locale/zh_CN";
import dayjs from "dayjs";
import "dayjs/locale/zh-cn";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import type {CreatorDatePickerAntdProps,CreatorDateRange} from "./creator-date-picker";
import {beijingToday} from "./creator-date-picker";

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.tz.setDefault("Asia/Shanghai");
dayjs.locale("zh-cn");
function readTheme(){
  const root=document.documentElement,style=getComputedStyle(root);
  const color=(name:string,fallback:string)=>style.getPropertyValue(name).trim()||fallback;
  return {dark:root.classList.contains("dark"),brand:color("--creatoros-brand","#7953ff"),surface:color("--creatoros-surface","#ffffff"),text:color("--creatoros-text","#171a25"),muted:color("--creatoros-text-muted","#667085"),border:color("--creatoros-border","#e6e8f0")};
}
export default function CreatorDatePickerAntd(props:CreatorDatePickerAntdProps){
  const [colors,setColors]=React.useState(readTheme);
  React.useEffect(()=>{const observer=new MutationObserver(()=>setColors(readTheme()));observer.observe(document.documentElement,{attributes:true,attributeFilter:["class","data-theme","style"]});return()=>observer.disconnect();},[]);
  const range=typeof props.value==="object"?props.value:null;
  const selected=typeof props.value==="string"?props.value:range?.startDate;
  const common={
    open:props.open,onOpenChange:props.onOpenChange,disabled:props.disabled,allowClear:props.allowClear??false,
    minDate:props.minDate?dayjs(props.minDate):undefined,maxDate:props.maxDate?dayjs(props.maxDate):undefined,
    className:props.className,"aria-label":props.label??"选择日期",size:"large" as const,
    style:{maxWidth:"100%",minWidth:0},inputReadOnly:true,
    styles:{popup:{root:{maxWidth:"calc(100vw - 24px)",overflowX:"auto" as const}}},
  };
  function changePeriod(date:dayjs.Dayjs|null){
    if(props.mode!=="week"&&props.mode!=="month")return;
    const unit=props.mode;
    props.onChange(date?{startDate:date.locale("zh-cn").startOf(unit).format("YYYY-MM-DD"),endDate:date.locale("zh-cn").endOf(unit).format("YYYY-MM-DD")}:null);
  }
  const renderPicker=()=>{
    if(props.mode==="range")return <DatePicker.RangePicker {...common} id={props.id?{start:props.id,end:`${props.id}-end`}:undefined} value={range?[dayjs(range.startDate),dayjs(range.endDate)]:null} defaultPickerValue={[dayjs(range?.startDate??beijingToday()),dayjs(range?.endDate??beijingToday())]} format="YYYY-MM-DD" placeholder={["开始日期","结束日期"]} onChange={dates=>{const value:CreatorDateRange|null=dates?.[0]&&dates[1]?{startDate:dates[0].format("YYYY-MM-DD"),endDate:dates[1].format("YYYY-MM-DD")}:null;props.onChange(value);}}/>;
    if(props.mode==="week"||props.mode==="month"){
      const anchor=dayjs(selected??beijingToday()).locale("zh-cn");
      // 只有首尾覆盖完整自然周期才视为已选中。自定义范围切换模式时，
      // 保留原日期作为面板锚点，但不能让 Ant 吞掉“选择同月/同周”的确认。
      const isCompletePeriod=range?.startDate===anchor.startOf(props.mode).format("YYYY-MM-DD")&&range?.endDate===anchor.endOf(props.mode).format("YYYY-MM-DD");
      return <DatePicker {...common} id={props.id} picker={props.mode} value={isCompletePeriod?anchor:null} defaultPickerValue={anchor} format={props.mode==="month"?"YYYY年MM月":date=>`${date.startOf("week").format("MM月DD日")} 至 ${date.endOf("week").format("MM月DD日")}`} placeholder={props.mode==="week"?"选择一周":"选择月份"} onChange={changePeriod}/>;
    }
    return <DatePicker {...common} id={props.id} value={selected?dayjs(selected):null} defaultPickerValue={dayjs(selected??beijingToday())} showNow={false} format="YYYY-MM-DD" placeholder={props.placeholder??"选择日期"} onChange={date=>{if(props.mode===undefined||props.mode==="date")props.onChange(date?date.format("YYYY-MM-DD"):null);}}/>;
  };
  return <ConfigProvider locale={zhCN} theme={{algorithm:colors.dark?theme.darkAlgorithm:theme.defaultAlgorithm,token:{colorPrimary:colors.brand,colorBgContainer:colors.surface,colorBgElevated:colors.surface,colorText:colors.text,colorTextPlaceholder:colors.muted,colorBorder:colors.border,borderRadius:8,fontFamily:"inherit"},components:{DatePicker:{zIndexPopup:1100}}}}>{renderPicker()}</ConfigProvider>;
}
