'use client';
import * as React from 'react';
import {useRouter} from 'next/navigation';
import {Button} from '@/components/ui/button';

/** 刷新服务端区域保留当前编辑器实例，不用整页重载丢掉未保存输入。 */
export function DeferredReadError({message,label='发布信息'}:{message:string;label?:string}) {
  const router=useRouter();
  const [pending,startTransition]=React.useTransition();
  return <div role="alert" className="text-sm text-muted-foreground">
    <p>{message}</p>
    <Button variant="outline" size="sm" disabled={pending} onClick={()=>startTransition(()=>router.refresh())}>{pending?'正在重新读取…':`重新读取${label}`}</Button>
  </div>;
}
