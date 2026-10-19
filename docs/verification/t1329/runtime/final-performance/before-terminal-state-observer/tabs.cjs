'use strict';
const assert=require('node:assert/strict');
exports.measure=async({page,context,b,c,s,metrics,expect,remaining,save})=>{
 const t=b.tabTiming;assert(t&&t.projectId&&t.groupId&&t.initialStage);
 const stages=['script','article','image','production','review'];assert(stages.includes(t.initialStage));
 assert.equal(new URL(t.initialURL,c.baseURL).origin,c.baseURL);
 assert.equal(new URL(t.initialURL,c.baseURL).pathname,`/projects/${encodeURIComponent(t.projectId)}/${t.initialStage}`);
 await context.addCookies([{name:'creatoros_current_group',value:encodeURIComponent(t.groupId),url:c.baseURL}]);
 await page.evaluate(group=>{localStorage.setItem('creatoros:current-group',group);localStorage.removeItem('creatoros:current-account');},t.groupId);
 await page.goto(t.initialURL,{timeout:Math.min(300000,remaining())});await metrics.install(page);
 const samples=[];
 for(const stage of stages.filter(x=>x!==t.initialStage).concat(t.initialStage)){
  const trigger=`[data-testid="stage-segment-${stage}"]`,link=page.locator(trigger),spec=t.readiness[stage];
  assert(spec&&typeof spec.main==='string'&&typeof spec.content==='string'&&typeof spec.control==='string');
  await expect(link).toHaveCount(1,{timeout:Math.min(120000,remaining())});
  assert.equal(await link.getAttribute('aria-current'),null);
  const budget=remaining();if(budget<120000)throw Error('NEW_TAB_OPERATION_HAS_LESS_THAN_TWO_MINUTES');
  const clock=await metrics.call(page,'armTransition',stage,{trigger,...spec},budget);
  await link.click({timeout:Math.min(120000,remaining())});
  const result=await metrics.waitTransition(page,clock,remaining());
  save('TAB_'+stage,{stage,...result,metric:'单次click→明确内容及可用控件可见；非TTI/p95',scope:{groupId:t.groupId,projectId:t.projectId}});
  assert.equal(result.comparableClock,true);assert.equal(result.timedOut,false);assert.equal(result.triggerCount,1);assert(result.readyAt!==null);
  assert.notEqual(await link.getAttribute('aria-current'),null);samples.push({stage,...result});
 }
 return {samples,statistics:'每个目标一次样本，不计算p95/TTI',writes:0,modelSubmissions:0};
};
