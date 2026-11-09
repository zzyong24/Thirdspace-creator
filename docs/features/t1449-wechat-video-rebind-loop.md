# 视频号扫码后的自动化重连闭环

2026-11-09用户截图显示，月明水清深组的视频号账号“月明Verse”后台数据同步自动化仍提示“需重连账号 · 去扫码绑定”；用户已扫码多次。本次沿用已确认组与账号，先经安装版公开CLI核对真实绑定回执、账号授权检测、自动化规则及最近执行的关系，再按实际证据修复代码并验证。扫码成功不能凭空推断数据同步可用，旧needsAuth也不能永久盖过更新的真实成功证据。

首阶段只读诊断：不要求用户重复扫码，不改真实账号凭据/任务记录，不补提未知任务，不直接读业务DB、私有连接文件或浏览器登录档案。源代码用于工程调用链排查；真实用户状态只从已安装公开CLI取得。当前groupId、accountId均经公开CLI重新核对后绑定。

诊断记录位于docs/verification/t1449与docs/research/t1449-wechat-video-rebind-loop.md。确定根因后补充具体实现路径与RED/GREEN、类型、timeout-policy、boundary及公共调用链验收；若涉及界面修改，追加实际PAGE_SPEC/前端旅程，不虚报安装版或真人扫码验收。

## 已核实的根因与实现

公开CLI证据：月明组grp-5d5290e4-4284的视频号acct-2578f847-5299为月明Verse，绑定成功时间2026-11-09T04:43:59.386Z；对应job-2578f847-5301最近run-c096f12d-fdca-4607-93b5-b7efea5d1171仍停在11月2日needs_reconnect。原AI任务ai-task-de1d5806-78映射exec_26bfeaa8-5ad1-4dbe-a5e2-748f3cd6811b，原执行runtimeStatus=waiting_user、errorCode=FLYWHEEL_LOGIN_REQUIRED，attempt=1/maxAttempts=3、无到期期限。自动化列表直接跳过最新needs_reconnect；绑定bootstrap触发又复用原在途任务而不恢复其执行，形成闭环断点。

在现有application/scheduling/controls组合现有AI、调度、执行service port：仅新扫码成功的onBound回调携带真实binding runId；对同账号self.metrics当前最新needs_reconnect记录，核对其原AI任务/执行归属，只恢复waiting_user且原错误为FLYWHEEL_LOGIN_REQUIRED的执行。通过原tasks.command(resume)和幂等键恢复原execution，再走原dispatch准备/唤醒；保留原AI、job_run、execution和调用账本。无成功扫码回执的普通bootstrap不恢复，未知结果、取消、其他阻塞原因均不因绑定自动重试。禁用任务不抢跑。失败保留真实错误，不能影响已提交的绑定成功。

这不修改公共契约、DB、凭据或前端渲染；自动化状态由真实原任务恢复后的投影更新，不把历史错误手工涂绿。根入口只传执行窄端口和已成功的binding runId。当前用户的这一个已确认登录等待任务可经公开CLI同scope执行一次幂等resume来恢复现场，不创建第二份任务、不补提未知模型调用；此操作属于本次持续修复与恢复的范围，结果必须原ID回读，真实仍失效则如实报告。

实现路径：backend/src/application/scheduling/controls.ts、controls.test.ts；frontend/src/server/persistence-client.ts。验证先以真实PGlite旧任务运行链复现RED，覆盖成功扫码恢复、重复回调、无回执、其他阻塞、禁用与不同归属；再跑既有bootstrap/调度/执行集成、类型、timeout-policy与boundary。现场恢复与代码修复/安装更新分开记录，不用源码通过冒充安装版已自动恢复。

## 现场恢复后的补充事实与最终方案

公开同scope的resume已接受且原exec attempt推进至2；但原nativeReports物理attempt沿用11月2日的预算，立即以“本次数据同步等待结束，已取得数据保留”收口failed。原AI/run/exec均已读回，不把该次恢复记成成功，不反复retry已超时attempt。此事实取代上节“总是resume原执行”的实现方案。

最终处理：成功扫码回调携带真实binding runId；只有同账号self.metrics的最新needs_reconnect所对应原execution明确waiting_user/FLYWHEEL_LOGIN_REQUIRED时，通过原tasks.command(cancel)结束该已确认登录阻塞的旧执行，保留记录/账本。随后通过原triggerScheduledJob启动本次扫码意图的新采集，使用binding runId在原attemptId和幂等字段中定位同一恢复意图；重复回调不会重复建任务/采集。若旧任务仍在执行、未知结果、暂停、其他阻塞或已取消，不因扫码绕过其执行权；普通bootstrap和禁用任务保持原行为。过期原生报表attempt不续期、不重置原预算，新同步拥有新物理attempt。当前旧任务已明确失败，允许以公开runNow发起一次新的确定性视频号同步验收，明确保存返回的新旧ID关系；不是补提未知模型调用。

补充实现路径：backend/src/modules/ai-runtime/scheduled-collection-scheduler.ts及scheduled-collection-scheduler.test.ts；沿用既有幂等与原task/run绑定协议，不新增表、队列、公共operation或UI虚假状态。通过真实PGlite回归验证原失败记录保留、一次新意图、同意图重复以及未知/禁用不重放，聚焦已有公共调度/绑定链与类型回归。具体现场结果和后续安装版交付继续分别记录。
