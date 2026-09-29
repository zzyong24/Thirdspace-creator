"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { SectionCard } from "@/components/project/section-card";
import { client } from "@/lib/contract-client";

type Status = Awaited<ReturnType<typeof client.getReportingStatus>>;
type Item = Status["diagnostics"];

export function ReportingConsentCard() {
  const [status,setStatus] = React.useState<Status|null>(null);
  const [selected,setSelected] = React.useState<Record<string,boolean>>({});
  const [pending,setPending] = React.useState<string|null>(null);
  const [error,setError] = React.useState<string|null>(null);
  React.useEffect(()=>{
    let live=true;
    void client.getReportingStatus({params:undefined,query:undefined,body:undefined}).then(next=>{
      if(!live)return;
      setStatus(next);
      setSelected(Object.fromEntries([next.diagnostics,...next.accounts].map(item => [`${item.scope}:${item.accountId??""}`,item.enabled || item.needsReconsent || (item.accountActive && item.changedAt===null)])));
    }).catch(()=>{if(live)setError("授权状态暂时无法读取，请稍后重试。");});
    return ()=>{live=false;};
  },[]);
  const change = async(item:Item,enabled:boolean) => {
    const key=`${item.scope}:${item.accountId??""}`;
    setPending(key);setError(null);
    try {
      const next=await client.setReportingConsent({params:undefined,query:undefined,body:{scope:item.scope, ...(item.accountId?{accountId:item.accountId}:{}),enabled,consentVersion:status!.consentVersion,consentChangeId:crypto.randomUUID()}});
      setStatus(next);
      setSelected(current=>({...current,[key]:enabled}));
    } catch {setError("保存授权失败，当前上报状态没有改变，请重试。");}
    finally {setPending(null);}
  };
  const clear = async(item:Item) => {
    const key=`${item.scope}:${item.accountId??""}`;
    setPending(key);setError(null);
    try {setStatus(await client.clearReportingPending({params:undefined,query:undefined,body:{scope:item.scope,...(item.accountId?{accountId:item.accountId}:{})}}));}
    catch {setError("清除待发数据失败，请重试。");}
    finally {setPending(null);}
  };
  const row=(item:Item) => {
    const key=`${item.scope}:${item.accountId??""}`;
    const checked=selected[key]??(item.enabled||item.needsReconsent||(item.accountActive&&item.changedAt===null));
    const title=item.scope==="diagnostics"?"故障诊断":`${item.platform??"平台"} · ${item.accountLabel??"账号"}${item.accountActive?"":"（已归档）"}`;
    return <div key={key} className="rounded-lg border px-4 py-3" data-slot="reporting-consent-row">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div><div className="font-medium">{title}</div><div className="text-sm text-muted-foreground">{item.enabled?(status?.preparationAvailable?"已在本机授权":"已授权，本机准备暂停"):item.needsReconsent?"字段已更新，需要重新确认":item.accountActive?"未开启，待确认":"账号已归档"} · 待发 {item.queuedCount} 条</div></div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={checked} disabled={pending!==null||!item.accountActive} onChange={event=>{
          const value=event.target.checked;setSelected(current=>({...current,[key]:value}));
          if(!value)void change(item,false);
        }} aria-label={`${title}上报偏好`} />愿意共享</label>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {checked && !item.enabled && item.accountActive && <Button size="sm" disabled={pending!==null||!status?.preparationAvailable} onClick={()=>void change(item,true)}>同意并开启</Button>}
        {item.enabled && <Button size="sm" variant="outline" disabled={pending!==null} onClick={()=>void change(item,false)}>停止上报</Button>}
        {item.queuedCount>0 && <Button size="sm" variant="ghost" disabled={pending!==null} onClick={()=>void clear(item)}>清除待发数据</Button>}
      </div>
    </div>;
  };
  return <SectionCard title="诊断与创作数据共享" description="可按用途和账号分别管理；未确认前不会采集待发数据。">
    <div className="space-y-3" data-slot="reporting-settings">
      <p className="text-sm text-muted-foreground">诊断仅包含故障分类、参考编号和时间；创作数据仅包含公开作品的随机别名、播放与互动数字、采集来源和时间。账号级粉丝总量只在有可信来源时提供，目前显示不可用。不会自动发送正文、标题、素材、提示词、账号原始 ID、Cookie 或原始日志。</p>
      <p className="text-sm text-muted-foreground">用途是帮助定位故障、查看账号采集健康与公开作品趋势。计划接收方为 Growth 运营服务；接收服务尚未接通。开启后只在本机加密准备待发数据，最长保留 7 天；此版本不会向外发送。未来启用云端接收前会明确告知云端保留期并请你重新确认。</p>
      {status&&!status.preparationAvailable&&<p role="status" className="text-sm text-amber-600">本机加密密钥未就绪，请从桌面应用正常启动后再启用。</p>}
      {!status?error?<Button size="sm" variant="outline" onClick={()=>{
        setError(null);
        void client.getReportingStatus({params:undefined,query:undefined,body:undefined})
          .then(next=>{setStatus(next);setSelected(Object.fromEntries([next.diagnostics,...next.accounts].map(item=>[`${item.scope}:${item.accountId??""}`,item.enabled||item.needsReconsent||(item.accountActive&&item.changedAt===null)])));})
          .catch(()=>setError("授权状态暂时无法读取，请稍后重试。"));
      }}>重试读取</Button>:<div className="text-sm">正在读取授权状态…</div>:<>{row(status.diagnostics)}{status.accounts.length?status.accounts.map(row):<div className="text-sm text-muted-foreground">暂无可授权的平台账号。</div>}</>}
      {error&&<div role="alert" className="text-sm text-destructive">{error}</div>}
    </div>
  </SectionCard>;
}
