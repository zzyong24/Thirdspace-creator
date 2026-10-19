const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root='/Users/zyongzhu/.codex/worktrees/integrated-frontend-unit/Thirdspace-creator';
const e='/Users/zyongzhu/.codex/worktrees/integrated-dev-acceptance/Thirdspace-creator/docs/verification/t1246/unit-first';
const files=['frontend/src/server/ingestion/chromium-guard.test.ts','ai-worker/src/runtime/browser/chromium-guard.ts','frontend/src/server/ingestion/douyin-throttle-integration.test.ts','frontend/src/server/ingestion/douyin-cdp.ts','contract/src/timeout-policy.ts','frontend/src/components/ui/creator-date-picker-antd.test.tsx','frontend/src/components/ui/creator-date-picker-antd.tsx'];
fs.writeFileSync(e+'/timeout-calendar-fixture-source-binding.json',JSON.stringify({candidate:'533224f334c43cdb81a344424e420cad93784dd1',observedAt:new Date().toISOString(),sourceBindings:files.map(p=>({file:path.join(root,p),sha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(root,p))).digest('hex')})),readonly:true,noRepairsOrReruns:true},null,2)+'\n');
fs.writeFileSync(e+'/TIMEOUT_CALENDAR_FIXTURE_REVIEW.md',`# 超时与日历首次失败的只读因果

冻结533224f，全包原38file/158FAIL保留，没有重新执行/改预算/断言。源SHA见timeout-calendar-fixture-source-binding.json。

## 浏览器启动原测试2例：外层180s先于真实370s内层

chromium-guard.test:224/241各传timeoutMs:20，真实fake deps与永不settle的launch Promise，仍等真实timer。生产worker runtime/browser/chromium-guard.ts:49 DEFAULT_LAUNCH_TIMEOUT_MS=completionWaitMs([180000,180000])=370000，:249取max(DEFAULT, executionTimeoutMs20)=370000。原两it未显式更长，首次CLI外层180000实际各180072/180031ms到限，尚未到BrowserLaunchError和迟到context cleanup断言。这个预算不闭包是已确认消费事实，不能据STACK_TRACE_ERROR称真实Chromium启动挂死，也不能把生产370s降成20ms。

最小候选仅原chromium-guard.test：正观察外层覆盖370000+启动/清理，或测试内部以受控fake timer推进到真实370000政策（仍断言实际调用预算、queue/late-context/close确认），测试clock模拟不能代签真实浏览器。保迟到ctx实际close、live0、人话重试、不放弃原资源所有权。具体预算/模拟与cleanup方式需独评，原公共reader补1PASS是另链，不能代签guard real browser timeout。

## 抖音导出原测试2例：60ms注入被政策调整，真实250s等窗先于180s外层

douyin-throttle-integration.test:544/561以fake context永不下载，deps.downloadTimeoutMs60；没有fake timer。生产douyin-cdp:2814 executionTimeoutMs(60,180000)=120000，:3050 completionWaitMs([executionTimeoutMs5000, downloadTimeoutMs])=250000（debug关闭，本runner清相关env）。fake waitForEvent:473按传入opts.timeout原值设置timer。原两it未显式更长，首次CLI180000各180014/180005ms到限，后续content-error报告尚未执行。不是已经证明平台导出产品失败；不能把政策/点击+等待预算降回60ms。

最小候选仅原douyin-throttle-integration.test：在同fake context上为真实250000等窗保足够外层及串行清理，或受控clock模拟真实传入参数/250000政策并保持success/no-toast/toast分类、acquire只一次与不重发。保所有正文/分类断言。模拟case只核policy/错误映射；真实平台下载仍不能由fixture或已有公共reader烟测签PASS。

## 日历1例：未选日期按真实今天，旧期望固定9月

creator-date-picker-antd.test:11空字符串case期待9月，未冻结Date；前一例Date-only fake固定9月后afterEach恢复真实时钟。生产:43空字符串归null，默认面板锚beijingToday，本轮时刻2026-10-12北京。原实参空日期期望固定历史9月，首次因此找不到9月；它不能证明Invalid Date回归。其它显式September及北京今天高亮原例实际通过。

最小候选仅原date-picker test：该空值case显式冻结Date到明确北京月份、afterEach可靠恢复，并保原Invalid Date不渲染与空值按beijingToday的真实面板锚；可增加午夜边界族，不能改产品固定9月或只删月份断言。尚未修/复验。
`);
console.log(JSON.stringify({sourceBindings:files.length,guardInnerMs:370000,exportDownloadWaitMs:250000,outerFirstMs:180000,productMutation:false}));
