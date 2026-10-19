import * as React from 'react';
import {createRoot} from 'react-dom/client';
import {flushSync} from 'react-dom';
import {AICopilotContent} from '@/features/copilot/ai-copilot-content';
import {ChatScriptDraftCard} from '@/features/copilot/chat-script-draft-card';
import {ChatThesisCard} from '@/features/copilot/chat-thesis-card';
import {ChatPublishPackageCard} from '@/features/copilot/chat-publish-package-card';
import {ScriptReviewGate,ReviewSoftGateHint} from '@/features/draft-workbench/script-review-gate';
import {useProjectUpgradeQueue} from '@/features/intelligence/use-project-upgrade-queue';
import {defaultApi} from '@/features/intelligence/intelligence-workbench-api';
import {CURRENT_GROUP_KEY} from '@/lib/http-transport';
import '@/app/globals.css';
import './style.css';

localStorage.setItem(CURRENT_GROUP_KEY,'group-a');
const oldReport={id:'old',projectId:'witness',artifactId:'fixture-artifact',artifactVersion:1,verdict:'pass',summary:'上个版本已审核',lintFindings:[],llmFindings:[],modelLabel:'合成回执',reviewedAt:'2026-10-07T00:00:00Z'};
async function control(action:string){await fetch('/witness/control',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action})});}
function Radar({group}:{group:string}){
 const api=React.useMemo(()=>defaultApi({groupId:group}),[group]);
 const queue=useProjectUpgradeQueue({api,groupId:group,positioningVersionId:null,setNotice:()=>{}});
 return <section><h2>雷达升级队列</h2><p data-testid="radar-count">已读 {queue.tasks.length} 条 / 服务端总量 {queue.total} 条</p><p data-testid="radar-external">{queue.byItem.has('external-original')?`外部原任务：${queue.byItem.get('external-original')!.status}`:'等待发现外部新增任务'}</p><div className="actions"><button onClick={async()=>{await control('add');window.dispatchEvent(new Event('focus'));}}>外部新增并聚焦</button><button onClick={async()=>{await control('complete');window.dispatchEvent(new Event('focus'));}}>完成原升级任务</button></div></section>;
}
function App(){
 const [group,setGroup]=React.useState('group-a'),[status,setStatus]=React.useState('succeeded'),[review,setReview]=React.useState(0),[metrics,setMetrics]=React.useState<any>(null);
 async function metricsNow(){setMetrics(await fetch('/witness/metrics').then(response=>response.json()));}
 async function switchGroup(){const next=group==='group-a'?'group-b':'group-a';localStorage.setItem(CURRENT_GROUP_KEY,next);window.dispatchEvent(new Event('creatoros:accounts-changed'));setGroup(next);}
 return <main><header><h1>T-1073 前端资源验收</h1><p>合成回执 · 实际组件与公共 HTTP adapter · 不连接真实账号、模型或数据库</p><div className="actions"><button onClick={switchGroup}>切换账号组</button><strong data-testid="workspace">当前：{group}</strong><button onClick={metricsNow}>读取请求计数</button></div>{metrics&&<pre data-testid="metrics">{JSON.stringify(metrics,null,2)}</pre>}</header>
  <div className="grid"><div><section><h2>已完成历史任务恢复</h2><div className="actions"><button onClick={()=>setStatus('succeeded')}>成功回执</button><button onClick={()=>setStatus('failed')}>失败回执</button></div><ChatScriptDraftCard key={`script-${status}`} taskId={`${status}-script`} projectId="witness" error={null}/><ChatThesisCard key={`thesis-${status}`} taskId={`${status}-thesis`} error={null}/><ChatPublishPackageCard key={`publish-${status}`} taskId={`${status}-publish`} projectId="witness" error={null}/></section>
  <Radar group={group}/><section><h2>同项目双消费点慢审核</h2><div className="actions"><button onClick={async()=>{await control('hold');flushSync(()=>setReview(value=>value+1));window.dispatchEvent(new Event('focus'));}}>开始慢读取</button><button onClick={async()=>{await control('release');await metricsNow();}}>释放原回执</button></div><div key={review}><ScriptReviewGate projectId="witness" projectTitle="验收稿" outputId={null} currentVersion={2} initialReport={oldReport as any}/><ReviewSoftGateHint projectId="witness" currentVersion={2} report={oldReport as any}/></div></section></div>
  <section><h2>实际 Copilot 会话与历史恢复</h2><AICopilotContent/></section></div>
 </main>;
}
createRoot(document.getElementById('root')!).render(<App/>);
