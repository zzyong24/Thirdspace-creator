'use client';
import * as React from 'react';
import {client} from '@/lib/contract-client';
import {fetchCreatorApi,readCurrentAccountId} from '@/lib/http-transport';
import {createAnalysisSession,emptyAnalysis,type AnalysisState} from './analysis-session';
import type {DailyReport} from './report-metrics';
export function useDailyReportAnalysis(report:DailyReport){
 const [state,setState]=React.useState<AnalysisState>({...emptyAnalysis,status:'loading'});
 const session=React.useRef<ReturnType<typeof createAnalysisSession>|null>(null),generation=React.useRef(0);
 React.useEffect(()=>{
  const ticket=++generation.current;let disposed=false;
  const current=createAnalysisSession(report,{api:client,send:body=>fetchCreatorApi('/api/chat',{method:'POST',headers:{'content-type':'application/json'},body}),assertScope:()=>{if(disposed||readCurrentAccountId()!==report.accountId)throw Error('账号已切换');}});session.current=current;
  setState({...emptyAnalysis,status:report.accountId?'loading':'idle'});
  async function read(){try{const next=await current.refresh();if(!disposed&&generation.current===ticket){setState(next);}}catch(e){if(!disposed)setState(s=>({...s,status:'failed',error:e instanceof Error?e.message:'分析读取失败，可刷新重试。'}));}}
  if(report.accountId)void read();
  return ()=>{disposed=true;generation.current++;};
 },[report]);
 const invoke=async(kind:'start'|'cancel'|'refresh')=>{
  const current=session.current,ticket=generation.current;if(!current)return;
  if(kind==='start')setState(s=>({...s,status:'running',error:null}));
  try{const next=await current[kind]();if(ticket===generation.current)setState(next);}catch(e){if(ticket===generation.current)setState(s=>({...s,status:'failed',error:e instanceof Error?e.message:'分析操作未完成，请刷新状态。'}));}
 };
 // 提交后启动轮询；离页只清定时器，后台原任务继续。
 React.useEffect(()=>{if(state.status!=='running')return;const timer=setTimeout(()=>void invoke('refresh'),3000);return()=>clearTimeout(timer);},[state]);
 return {...state,start:()=>invoke('start'),cancel:()=>invoke('cancel'),refresh:()=>invoke('refresh')};
}
