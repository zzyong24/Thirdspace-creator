"use client";
import {useEffect,useState} from "react";
import {SectionCard} from "@/components/project/section-card";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {client} from "@/lib/contract-client";
export function RedfoxConfiguration(){
 const [configured,setConfigured]=useState(false),[key,setKey]=useState(""),[pending,setPending]=useState(true),[error,setError]=useState("");
 useEffect(()=>{let alive=true;client.getRedfox({params:undefined,query:undefined,body:undefined}).then(r=>{if(alive)setConfigured(r.configured);}).catch(()=>{if(alive)setError("暂时无法读取 RedFox 配置，请重新打开设置。");}).finally(()=>{if(alive)setPending(false);});return()=>{alive=false;};},[]);
 async function save(remove=false){setPending(true);setError("");try{const result=remove?await client.deleteRedfox({params:undefined,query:undefined,body:undefined}):await client.putRedfox({params:undefined,query:undefined,body:{secret:key.trim()}});setConfigured(result.configured);setKey("");}catch{setError("RedFox 配置未保存，请稍后重试。");}finally{setPending(false);}}
 return <SectionCard title="RedFox 数据服务" description="让 AI 助手按需要查询热点、研究对标作品和提取文案。使用官方模型或自己的模型都可以配置。"><div className="grid gap-3"><p className="text-sm text-muted-foreground">{configured?"已保存密钥":"尚未配置"} · 查询费用由你的 RedFox 账户承担</p><label className="text-sm" htmlFor="redfox-key">API Key</label><Input id="redfox-key" type="password" autoComplete="new-password" value={key} onChange={e=>setKey(e.target.value)} placeholder={configured?"输入新密钥以替换":"填写 RedFox API Key"}/><div className="flex flex-wrap gap-2"><Button disabled={pending||!key.trim()} onClick={()=>void save()}>保存密钥</Button>{configured&&<Button variant="outline" disabled={pending} onClick={()=>void save(true)}>移除密钥</Button>}<a className="self-center text-sm text-primary" href="https://redfox.hk/settings/api-keys" target="_blank" rel="noreferrer">获取 API Key ↗</a></div>{error&&<p role="alert" className="text-sm text-destructive">{error}</p>}</div></SectionCard>;
}
