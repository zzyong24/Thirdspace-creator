"use client";
import * as React from 'react';
import {accountGroupBindingStatusResource,type AccountGroupResource,type AccountGroupBindingStatusResource,type GroupMemberResource} from '@creatoros/contract';
import {client} from '@/lib/contract-client';

type ReadState={key:string;value:AccountGroupBindingStatusResource|null;loading:boolean;error:boolean};
/** 每次读取绑定当前组；重叠刷新只保留最后一次，过期响应不覆盖新组。 */
export function useAccountGroupBindingStatus(group:AccountGroupResource|undefined){
 const key=group?JSON.stringify([group.id,group.version,group.members.map(m=>[m.accountId,m.version,m.status,m.leftAt])]):'';
 const [state,setState]=React.useState<ReadState>({key:'',value:null,loading:false,error:false});
 const alive=React.useRef(false),active=React.useRef(false),wanted=React.useRef(false),epoch=React.useRef(0);
 const target=React.useRef({key,groupId:group?.id});
 // eslint-disable-next-line react-hooks/refs -- 仅用于异步响应归属核验。
 target.current={key,groupId:group?.id};
 const refresh=React.useCallback(()=>{
  epoch.current++;wanted.current=true;
  if(active.current||!alive.current)return;
  active.current=true;
  void(async()=>{try{do{
   wanted.current=false;const snapshot=target.current,ticket=epoch.current;
   if(!snapshot.groupId){if(alive.current)setState({key:snapshot.key,value:null,loading:false,error:false});continue;}
   setState({key:snapshot.key,value:null,loading:true,error:false});
   try{
    const value=accountGroupBindingStatusResource.parse(await client.getAccountGroupBindingStatus({params:{groupId:snapshot.groupId},query:undefined,body:undefined}));
    if(value.groupId!==snapshot.groupId)throw Error('状态归属不匹配');
    if(alive.current&&ticket===epoch.current&&snapshot.key===target.current.key)setState({key:snapshot.key,value,loading:false,error:false});
   }catch{if(alive.current&&ticket===epoch.current&&snapshot.key===target.current.key)setState({key:snapshot.key,value:null,loading:false,error:true});}
  }while(wanted.current&&alive.current);}finally{active.current=false;}})();
 },[]);
 React.useEffect(()=>{alive.current=true;refresh();return()=>{alive.current=false;epoch.current++;};},[key,refresh]);
 return {...(state.key===key?state:{key,value:null,loading:Boolean(key),error:false}),refresh};
}
export function AccountGroupBindingStatusCell({platform,members,status}:{platform:string;members:GroupMemberResource[];status:ReturnType<typeof useAccountGroupBindingStatus>}){
 const rows=members.filter(m=>m.platform===platform);
 if(!rows.length)return <span className="text-muted-foreground">未绑定</span>;
 return <div className="flex min-w-40 max-w-72 flex-col gap-3">{rows.map(member=>{
  const item=status.value?.accounts.find(a=>a.accountId===member.accountId&&a.platform===member.platform);
  const binding=member.status==='archived'?'已隐藏':item?.bindingState==='bound'?'已绑定':item?.bindingState==='hidden'?'已隐藏':item?.bindingState==='unverified'?'身份未验证':'绑定待确认';
  const known=member.status!=='archived'&&item?.bindingState==='bound';
  const login=status.loading?'登录状态读取中…':status.error?'登录状态未确认':known&&item?.loginState==='verified'?'最近验证有效':known&&item?.loginState==='needs_login'?'需要重新登录':'登录待验证';
  return <div key={member.accountId}><p className="break-words font-medium">{binding} · {member.accountHandle}</p><p className={`mt-1 text-xs ${login==='最近验证有效'?'text-success':login==='需要重新登录'?'text-destructive':'text-muted-foreground'}`}>{login}</p>{known&&item?.checkedAt&&<p className="mt-1 text-xs text-muted-foreground">验证于 <time dateTime={item.checkedAt}>{new Date(item.checkedAt).toLocaleString('zh-CN',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false})}</time></p>}</div>;
 })}</div>;
}
