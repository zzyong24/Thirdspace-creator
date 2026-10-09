"use client";
import * as React from "react";
import {useRouter} from "next/navigation";
import {CalendarDays,LoaderCircle} from "lucide-react";
import {Button} from "@/components/ui/button";
import {Dialog,DialogContent,DialogDescription,DialogFooter,DialogHeader,DialogTitle,DialogTrigger} from "@/components/ui/dialog";
import {CreatorDatePicker} from "@/components/ui/creator-date-picker";
import {client} from "@/lib/contract-client";
import type {GroupMemberResource} from "@creatoros/contract";
import type {CalendarProjectOption} from "./content-calendar-page";
const labels:Record<string,string>={douyin:"抖音",xiaohongshu:"小红书",wechatOfficial:"微信公众号",wechatVideo:"微信视频号",bilibili:"哔哩哔哩",youtube:"YouTube",x:"X"};
export function GroupCalendarPlanningControl({groupId,projects,today,entryId}:{groupId:string;projects:readonly CalendarProjectOption[];today:string;entryId?:string}) {
 const router=useRouter(),[open,setOpen]=React.useState(false),[projectId,setProjectId]=React.useState(""),[date,setDate]=React.useState(""),[target,setTarget]=React.useState(""),[members,setMembers]=React.useState<GroupMemberResource[]>([]),[pending,setPending]=React.useState(false),[loading,setLoading]=React.useState(false),[archived,setArchived]=React.useState(false),[error,setError]=React.useState<string|null>(null);
 const generation=React.useRef(0),inflight=React.useRef(false);
 React.useEffect(()=>{generation.current++;setOpen(false);setError(null);return()=>{generation.current++}},[groupId]);
 React.useEffect(()=>{if(!open)return;const current=++generation.current;setLoading(true);setError(null);
  client.getAccountGroup({params:{groupId},query:undefined,body:undefined}).then(group=>{if(generation.current!==current)return;setMembers(group.members.filter(m=>m.status==="active"&&!m.leftAt));setArchived(group.status==="archived");}).catch(()=>{if(generation.current===current)setError("读取账号组失败，请关闭后重试。")}).finally(()=>{if(generation.current===current)setLoading(false)});
  return()=>{generation.current++};
 },[open,groupId]);
 async function save(){if(inflight.current||loading||archived||(!entryId&&(!projectId||!date)))return;if(!entryId&&date<today){setError("请选择今天或之后的日期。");return}
  inflight.current=true;setPending(true);setError(null);const current=generation.current;
  try{if(entryId)await client.setCalendarEntryTarget({params:{entryId},query:undefined,body:{targetAccountId:target||null}});else await client.createGroupEntry({params:{groupId},query:undefined,body:{projectId,plannedDate:date,targetAccountId:target||null}});
   if(generation.current!==current)return;setOpen(false);setProjectId("");setDate("");setTarget("");router.refresh();
  }catch{if(generation.current===current)setError("保存失败。项目可能已发布或账号归属已改变，请检查选择后重试。")}finally{inflight.current=false;if(generation.current===current)setPending(false)}
 }
 return <Dialog open={open} onOpenChange={value=>{if(!pending)setOpen(value)}}>
  <DialogTrigger asChild><Button type="button" variant={entryId?"outline":"default"} size="sm"><CalendarDays aria-hidden="true" className="size-4"/>{entryId?"重新选择目标":"安排创作"}</Button></DialogTrigger>
  <DialogContent className="sm:max-w-md"><DialogHeader><DialogTitle>{entryId?"选择发布目标":"安排创作日期"}</DialogTitle><DialogDescription>计划保存在当前账号组。未绑定平台账号也可以安排创作；这里保存计划，实际发布需另行确认。</DialogDescription></DialogHeader>
   {archived?<p role="status" className="text-sm text-muted-foreground">已归档账号组仅能查看历史，请恢复后再安排创作。</p>:null}
   {!entryId?<><label className="flex flex-col gap-2 text-sm">共享项目<select aria-label="共享项目" value={projectId} onChange={e=>setProjectId(e.target.value)} disabled={pending||loading||archived} className="h-10 rounded-control border border-border bg-surface px-3"><option value="">选择项目</option>{projects.filter(p=>p.schedulable!==false).map(p=><option key={p.id} value={p.id}>{p.title}</option>)}</select></label>
   <div className="flex flex-col gap-2 text-sm"><span>创作日期</span><CreatorDatePicker value={date} onChange={value=>setDate(value??"")} minDate={today} placeholder="选择日期" label="创作日期" disabled={pending||loading||archived}/></div></>:null}
   <label className="flex flex-col gap-2 text-sm">发布目标（可选）<select aria-label="发布目标（可选）" value={target} onChange={e=>setTarget(e.target.value)} disabled={pending||loading||archived} className="h-10 rounded-control border border-border bg-surface px-3"><option value="">稍后选择平台账号</option>{members.map(m=><option key={m.id} value={m.accountId}>{labels[m.platform]??m.platform} · {m.accountHandle}</option>)}</select></label>
   {loading?<p role="status" className="text-sm text-muted-foreground">正在读取当前组的平台账号…</p>:!members.length?<p className="text-sm text-muted-foreground">当前组未绑定平台账号，可先安排创作。</p>:null}
   {error?<p role="alert" className="text-sm text-destructive">{error}</p>:null}
   <DialogFooter><Button variant="outline" disabled={pending} onClick={()=>setOpen(false)}>取消</Button><Button onClick={save} disabled={pending||loading||archived||!!error&&error.startsWith("读取")||(!entryId&&(!projectId||!date))}>{pending?<LoaderCircle className="size-4 animate-spin" aria-hidden="true"/>:null}{pending?"保存中…":"保存计划"}</Button></DialogFooter>
  </DialogContent>
 </Dialog>;
}
