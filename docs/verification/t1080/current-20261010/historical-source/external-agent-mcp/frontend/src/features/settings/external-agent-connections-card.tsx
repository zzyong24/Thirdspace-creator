"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { SectionCard } from "@/components/project/section-card";
import { fetchCreatorApi, readCurrentAccountId } from "@/lib/http-transport";

type Connection={connectionId:string;clientKind:string;accountId:string;projectId:string|null;allowedOps:string[];revision:string;status:"active"|"revoked"|"credential_expired";lastInvocationAt:string|null};
const READ=["projects.list","projects.get","candidates.list","candidates.get","scheduledJobs.list","ingestion.runs.get"];
const PROJECT_READ=["projects.get","projects.outputs.list","projects.activity.list","analytics.projects.get"];
const GENERATE="projects.scripts.generateCandidate";

export function ExternalAgentConnectionsCard(){
  const [connections,setConnections]=React.useState<Connection[]>([]);
  const [kind,setKind]=React.useState("codex");
  const [projectId,setProjectId]=React.useState("");
  const [grantGenerate,setGrantGenerate]=React.useState(false);
  const [busy,setBusy]=React.useState(false);
  const [error,setError]=React.useState("");
  const [created,setCreated]=React.useState<Connection|null>(null);
  const [installed,setInstalled]=React.useState<string|null>(null);
  const [accountId,setAccountId]=React.useState<string|null>(null);
  const refresh=React.useCallback(async()=>{
    const response=await fetchCreatorApi("/api/v1/external-agent/connections");
    if(!response.ok)throw Error("连接列表暂不可读取");
    const data=await response.json() as {connections:Connection[]};
    setConnections(data.connections);
  },[]);
  React.useEffect(()=>{void refresh().catch(e=>setError(String(e)));},[refresh]);
  React.useEffect(()=>{
    const update=()=>setAccountId(readCurrentAccountId());
    update();window.addEventListener("storage",update);
    return()=>window.removeEventListener("storage",update);
  },[]);
  const create=async()=>{
    if(!accountId){setError("请先选择业务账号");return;}
    setBusy(true);setError("");
    try{
      const allowedOps=[...(projectId.trim()?PROJECT_READ:READ),...(grantGenerate?[GENERATE]:[])];
      const response=await fetchCreatorApi("/api/v1/external-agent/connections",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({idempotencyKey:crypto.randomUUID(),clientKind:kind,accountId,projectId:projectId.trim()||null,allowedOps})});
      const data=await response.json() as {connection?:Connection;code?:string};
      if(!response.ok||!data.connection)throw Error(data.code||"连接创建失败");
      setCreated(data.connection);await refresh();
    }catch(e){setError(e instanceof Error?e.message:String(e));}finally{setBusy(false);}
  };
  const revoke=async(connection:Connection)=>{
    setBusy(true);setError("");
    try{
      const response=await fetchCreatorApi(`/api/v1/external-agent/connections/${encodeURIComponent(connection.connectionId)}`,{method:"DELETE",headers:{"content-type":"application/json"},body:JSON.stringify({expectedRevision:connection.revision})});
      if(!response.ok)throw Error((await response.json() as {code?:string}).code||"撤销失败");
      await refresh();
    }catch(e){setError(e instanceof Error?e.message:String(e));}finally{setBusy(false);}
  };
  const install=async(connection:Connection)=>{
    setBusy(true);setError("");
    try{
      const response=await fetchCreatorApi(`/api/v1/external-agent/connections/${encodeURIComponent(connection.connectionId)}/install`,{method:"POST"});
      const data=await response.json() as {message?:string;code?:string};
      if(!response.ok)throw Error(data.message||data.code||"无法配置 Codex");
      setInstalled(connection.connectionId);
    }catch(e){setError(e instanceof Error?e.message:String(e));}finally{setBusy(false);}
  };
  const snippet=created?created.clientKind==="codex"
    ?`codex mcp add creatoros-${created.connectionId} -- creatoros mcp serve --paired ${created.connectionId}`
    :JSON.stringify({mcpServers:{[`creatoros-${created.connectionId}`]:{command:"creatoros",args:["mcp","serve","--paired",created.connectionId]}}},null,2):"";
  return <SectionCard title="外部 Agent 连接" description="让 Codex、WorkBuddy 等本机 MCP 客户端读取所选业务账号并生成待确认候选。采纳仍在 CreatorOS 完成。">
    <div className="space-y-3 text-sm">
      <div className="flex flex-wrap gap-2">
        <label>客户端 <select aria-label="外部 Agent 客户端" value={kind} onChange={e=>setKind(e.target.value)}><option value="codex">Codex</option><option value="workbuddy">WorkBuddy</option><option value="manual">其他 MCP 客户端</option></select></label>
        <label>项目 ID（可选） <input aria-label="限定项目 ID" value={projectId} onChange={e=>setProjectId(e.target.value)} placeholder="留空则按当前账号授权" className="rounded border px-2" /></label>
      </div>
      <label className="flex gap-2"><input type="checkbox" checked={grantGenerate} onChange={e=>setGrantGenerate(e.target.checked)}/>允许生成项目文案候选（不会自动采纳）</label>
      <Button onClick={()=>void create()} disabled={busy||!accountId}>创建连接</Button>
      {!accountId&&<p>请先在页面选择业务账号。</p>}
      {error&&<p role="alert" className="text-destructive">{error}</p>}
      {created&&<div><p>连接已创建。{created.clientKind==="codex"?"点击下方按钮可合并到 Codex 配置；也可复制命令手动配置。":"将以下配置加入客户端的 stdio MCP 设置："}</p><pre className="overflow-auto rounded bg-surface-subtle p-2 select-all">{snippet}</pre><p>配置只包含连接 ID，短期凭据保存在 CreatorOS 当前用户私有目录。若客户端不支持 stdio MCP，请使用兼容客户端。</p></div>}
      <ul className="space-y-2">{connections.map(connection=><li key={connection.connectionId} className="rounded border p-2"><div>{connection.clientKind} · {connection.accountId} {connection.projectId?`· 项目 ${connection.projectId}`:""} · {connection.status}</div><div className="text-muted-foreground">权限：{connection.allowedOps.join("、")}</div>{connection.status!=="revoked"&&<div className="flex gap-2">{connection.clientKind==="codex"&&<Button variant="outline" disabled={busy} onClick={()=>void install(connection)}>{installed===connection.connectionId?"已写入 Codex 配置":"写入 Codex 配置"}</Button>}<Button variant="outline" disabled={busy} onClick={()=>void revoke(connection)}>撤销</Button></div>}</li>)}</ul>
    </div>
  </SectionCard>;
}
