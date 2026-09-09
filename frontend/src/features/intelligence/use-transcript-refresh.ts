"use client";
import * as React from "react";
import type {RadarApi, RadarItemDetail, RadarItemRow} from "./intelligence-workbench-types";

/** 只刷新已加载的在途作品；不重新读取整页，不把界面寿命当任务寿命。 */
export function useTranscriptRefresh({api,detail,rows,setDetail,setRows,activeItemId}:{
  api:RadarApi;detail:RadarItemDetail|null;rows:RadarItemRow[];
  setDetail:React.Dispatch<React.SetStateAction<RadarItemDetail|null>>;
  setRows:React.Dispatch<React.SetStateAction<RadarItemRow[]>>;
  activeItemId:React.MutableRefObject<string|null>;
}) {
  const latest=React.useRef({detail,rows});
  latest.current={detail,rows};
  React.useEffect(()=>{
    let disposed=false,reading=false,cursor=0;
    const refresh=async()=>{
      if(disposed||reading)return;
      const current=latest.current;
      const pending=current.rows.filter(row=>row.transcriptState==="processing"||row.progressState==="transcript_processing").map(row=>row.item.id);
      const ids=new Set<string>();
      if(current.detail && ["queued","running"].includes(current.detail.transcript.status))ids.add(current.detail.item.id);
      for(let n=0;n<Math.min(4,pending.length);n++)ids.add(pending[(cursor+n)%pending.length]!);
      cursor+=4;
      if(!ids.size)return;
      reading=true;
      try{
        await Promise.all([...ids].map(async id=>{
          try{
            const value=await api.getItem(id);
            if(disposed||value.item.id!==id)return;
            if(activeItemId.current===id)setDetail(old=>old?.item.id===id?value:old);
            const status=value.transcript.status;
            const transcriptState:RadarItemRow["transcriptState"]=status==="done"?"extracted":["queued","running"].includes(status)?"processing":["failed","blocked"].includes(status)?"attention":"not_extracted";
            setRows(old=>old.map(row=>row.item.id===id?{...row,transcriptState,progressState:transcriptState==="processing"?"transcript_processing":transcriptState==="attention"?"attention":value.transforms.length?row.progressState:transcriptState==="extracted"?"pending_topic":"pending_transcript"}:row));
          }catch{/* 单次网络抖动继续追踪同一任务。 */}
        }));
      }finally{reading=false;}
    };
    const timer=window.setInterval(()=>void refresh(),2000);
    const focus=()=>void refresh();
    window.addEventListener("focus",focus);
    return()=>{disposed=true;window.clearInterval(timer);window.removeEventListener("focus",focus);};
  },[api,activeItemId,setDetail,setRows]);
}
