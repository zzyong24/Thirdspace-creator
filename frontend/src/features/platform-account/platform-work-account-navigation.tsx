import Link from 'next/link';
import type {AccountGroupResource} from '@creatoros/contract';
import {PLATFORM_LABELS} from './platform-account-labels';

/** 只渲染当前组真实有效成员；每个链接重新开始该账号的目录选择。 */
export function PlatformWorkAccountNavigation({group,selectedId,showManagement=true}:{group:AccountGroupResource;selectedId?:string|null;showManagement?:boolean}){
 const members=group.members.filter(member=>member.status==='active'&&member.leftAt===null);
 return <nav aria-label="平台作品账号" className="flex min-w-0 flex-col gap-3">
  <p className="text-sm text-muted-foreground">{group.name} · 平台账号</p>
  {members.length?<div className="flex min-w-0 flex-wrap gap-2">{members.map(member=><Link key={member.id} href={`/accounts/works?${new URLSearchParams({accountId:member.accountId})}`} aria-current={selectedId===member.accountId?'page':undefined} className={`inline-flex max-w-full items-center rounded-control border px-3 py-2 text-sm transition-colors hover:bg-surface-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ${selectedId===member.accountId?'border-brand/40 bg-brand-soft text-brand':'border-border bg-surface text-foreground'}`}><span className="min-w-0 break-words">{PLATFORM_LABELS[member.platform]} · {member.accountHandle}</span></Link>)}</div>:<p className="text-sm text-muted-foreground">当前账号组尚未绑定平台账号。</p>}
  {showManagement&&<Link href="/accounts" className="self-start text-sm text-brand hover:underline">管理平台账号</Link>}
 </nav>;
}
