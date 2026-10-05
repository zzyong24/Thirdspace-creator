'use client';
import * as React from 'react';
import {CURRENT_ACCOUNT_KEY, readCurrentAccountId} from '@/lib/http-transport';
function subscribe(refresh: () => void) {
  const storage = (event: StorageEvent) => {if (event.key === CURRENT_ACCOUNT_KEY) refresh();};
  window.addEventListener('creatoros:accounts-changed', refresh);
  window.addEventListener('storage', storage);
  return () => {window.removeEventListener('creatoros:accounts-changed', refresh); window.removeEventListener('storage', storage);};
}
export function useNativeAccount() {return React.useSyncExternalStore(subscribe, readCurrentAccountId, () => null);}
