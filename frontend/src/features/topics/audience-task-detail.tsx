"use client";
import type { AudienceTaskAssessment } from '@creatoros/contract';
const routeLabels={record:'可录 · 有用户实测记录',test:'先测 · 尚未证实',research:'观察 / 研究',reserve:'中期储备',unsuitable:'不适合当前观众'};
const sourceLabels={success:'已读取',partial:'部分读取',not_called:'未调用',failed:'读取失败',permission_denied:'权限不足'};
export function AudienceTaskDetail({task}:{task:AudienceTaskAssessment}){
 return <div className="space-y-2 rounded-control border border-border p-3 text-sm" data-testid="audience-task-detail">
  <p className="font-semibold">{routeLabels[task.route]} · {task.evidenceStatus==='hypothesis'?'需求假设':'有问题材料'}</p>
  {task.gridRelationReason?<p>格子关系：{task.gridRelationReason}（网格v{task.gridVersion}）</p>:null}
  <p>帮{task.audience||'待确认观众'}：{task.job||'任务待补充'}</p>
  <p>拿什么演示：{task.input||'输入待确认'}</p>
  <p>怎么做：{task.steps.join(' → ')||'操作待确认'}</p>
  <p>得到什么：{task.output||'输出待确认'}；验收：{task.acceptance||'验收待确认'}</p>
  <p>观众入口：{task.entryUrl?<a href={task.entryUrl} target="_blank" rel="noreferrer" className="underline">打开入口（仍按当前核验状态判断）</a>:'未知，先研究'}</p>
  <p>观众能用：{task.viewerCanUse||'待确认'}；费用与限制：{task.costAndLimits||'待确认'}</p>
  <p>作者备料：{task.estimatedMinutes===null?'未知':`${task.estimatedMinutes}分钟`}；{task.authorCanDo}</p>
  {task.testPlan?<div><p>先测哪一步：{task.testPlan.steps.join(' → ')}</p><p>样例：{task.testPlan.sample}；可见结果：{task.testPlan.visibleResult}</p><p>测试验收：{task.testPlan.acceptance}；失败时能讲：{task.testPlan.failureStory}</p></div>:<p>实测计划待补充</p>}
  {task.verificationNotes.map(n=><p key={n} className="text-muted-foreground">{n}</p>)}
  {task.changeReason?<p>实质改造：{task.changeReason}</p>:null}
  <details><summary className="cursor-pointer">依据与审读版本</summary><div className="space-y-1 pt-2"><p>{task.audienceReason}</p><p>配置版本{task.workspaceVersion}；定位{task.positioningVersionId??'未设置'}；{task.assessedAt}</p><p>格子：{task.cellIds.join('、')||'无'}；问题：{task.problemIds.join('、')||'无'}；作者材料：{task.authorMaterialIds.join('、')||'无'}</p>{task.sourceReads.map(r=><p key={r.id}>{r.name}：{sourceLabels[r.status]} · {r.note} · {r.readAt??'没有读取时间'}{r.url?<a className="ml-1 underline" href={r.url} target="_blank" rel="noreferrer">原来源</a>:null}</p>)}</div></details>
 </div>;
}
