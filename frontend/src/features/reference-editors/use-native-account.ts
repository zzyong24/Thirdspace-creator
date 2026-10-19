'use client';
import * as React from 'react';
import {CURRENT_ACCOUNT_KEY, CURRENT_GROUP_KEY, readCurrentAccountId, readCurrentGroupId} from '@/lib/http-transport';
function subscribe(refresh: () => void) {
  const storage = (event: StorageEvent) => {if (event.key === null || event.key === CURRENT_ACCOUNT_KEY || event.key === CURRENT_GROUP_KEY) refresh();};
  window.addEventListener('creatoros:accounts-changed', refresh);
  window.addEventListener('storage', storage);
  return () => {window.removeEventListener('creatoros:accounts-changed', refresh); window.removeEventListener('storage', storage);};
}
export function useNativeAccount() {return React.useSyncExternalStore(subscribe, readCurrentAccountId, () => null);}

export function useNativeWorkspace(){
 const key=React.useSyncExternalStore(subscribe,()=>{const group=readCurrentGroupId();return group?`group:${group}`:`account:${readCurrentAccountId()??''}`;},()=>"account:");
 return React.useMemo(()=>key.startsWith('group:')?{groupId:key.slice(6),accountId:null}:{groupId:null,accountId:key.slice(8)||null},[key]);
}
