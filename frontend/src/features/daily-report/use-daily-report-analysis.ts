'use client';
import * as React from 'react';
import {client} from '@/lib/contract-client';
import {fetchCreatorApi,readCurrentAccountId,readCurrentGroupId} from '@/lib/http-transport';
import {createAnalysisSession,emptyAnalysis,type AnalysisState} from './analysis-session';
import {hasReportScope} from './analysis-protocol';
import type {DailyReport} from './report-metrics';
export function useDailyReportAnalysis(report:DailyReport){
 const [state,setState]=React.useState<AnalysisState>({...emptyAnalysis,status:'loading'});
 const session=React.useRef<ReturnType<typeof createAnalysisSession>|null>(null),generation=React.useRef(0);
 const scopeCurrent=React.useCallback(()=>report.groupId?readCurrentGroupId()===report.groupId:readCurrentAccountId()===report.accountId,[report]);
 React.useEffect(()=>{
  const ticket=++generation.current;let disposed=false;
  const invalidate=()=>{if(disposed||ticket!==generation.current)return;generation.current++;session.current=null;setState({...emptyAnalysis});};
  const assertScope=()=>{if(disposed||generation.current!==ticket||!scopeCurrent())throw Error('账号组或账号已切换');};
  const current=createAnalysisSession(report,{api:client,send:body=>fetchCreatorApi('/api/chat',{method:'POST',headers:{'content-type':'application/json'},body}),assertScope});session.current=current;
  async function read(){try{const next=await current.refresh();if(!disposed&&generation.current===ticket){if(scopeCurrent())setState(next);else invalidate();}}catch(e){if(!disposed&&generation.current===ticket){if(scopeCurrent())setState(s=>({...s,status:'failed',error:e instanceof Error?e.message:'分析读取失败，可刷新重试。'}));else invalidate();}}}
  // 组切换通知先清旧分析；后续路由刷新读新组。后台原任务继续在冻结上下文运行。
  const changed=()=>{if(!scopeCurrent())invalidate();};
  window.addEventListener('creatoros:accounts-changed',changed);window.addEventListener('storage',changed);
  void Promise.resolve().then(()=>{if(disposed||ticket!==generation.current)return;if(!scopeCurrent()){invalidate();return;}setState({...emptyAnalysis,status:hasReportScope(report)?'loading':'idle'});if(hasReportScope(report))void read();});
  const expire=()=>{generation.current++;session.current=null;};
  return ()=>{disposed=true;expire();window.removeEventListener('creatoros:accounts-changed',changed);window.removeEventListener('storage',changed);};
 },[report,scopeCurrent]);
 const invoke=React.useCallback(async(kind:'start'|'cancel'|'refresh')=>{
  const current=session.current,ticket=generation.current;if(!current)return;
  if(!scopeCurrent()){generation.current++;session.current=null;setState({...emptyAnalysis});return;}
  if(kind==='start')setState(s=>({...s,status:'running',error:null}));
  try{const next=await current[kind]();if(ticket===generation.current){if(scopeCurrent())setState(next);else{generation.current++;session.current=null;setState({...emptyAnalysis});}}}catch(e){if(ticket===generation.current){if(scopeCurrent())setState(s=>({...s,status:'failed',error:e instanceof Error?e.message:'分析操作未完成，请刷新状态。'}));else{generation.current++;session.current=null;setState({...emptyAnalysis});}}}
 },[scopeCurrent]);
 // session 内部合并单个在途读取；离页与切组只停止UI轮询，后台原任务继续。
 React.useEffect(()=>{if(state.status!=='running')return;const timer=setTimeout(()=>void invoke('refresh'),3000);return()=>clearTimeout(timer);},[state,invoke]);
 return {...state,start:()=>invoke('start'),cancel:()=>invoke('cancel'),refresh:()=>invoke('refresh')};
}
