# T1199 最终增补源码与当前证据独立复核

结论：PASS（当前源码与下述隔离公开历史/错误边界证据；不代表真实媒体采集、真机安装或全部Gate已过）。只读审计，未修改仓库、控制文件或Git，没有读真人库/凭据或执行真人任务。

## 表单新代次守卫

formAlive 挂载置真、卸载置假并增加 formEpoch；open 与上次提交的实际 open 状态变化时增加代次。新打开清旧error与pending，并按新job/prefill初始化输入。submit 固定 originalEpoch，在 await 后 success关闭、catch错误、finally清pending均要求 alive && 相同epoch。旧请求继续原目标、无重发或偷偷取消。Dialog Root 原 if(!submitting)onOpenChange(v) 和取消 disabled 仍保留。

新两例 deferred 外部强制关闭→新目标重开→旧resolve/reject测试对应合法组件props生命周期，未再把用户topClose/Escape能绕保护当成事实。源码新守卫能保证新的已打开表单不被旧回调关闭或写旧错误；再次submit的pending不会被旧epoch finally清除。生产group key卸载以及parent alive/accountRef保护继续存在。没有发现新增effect依赖循环或纯组write扩权。

form-late-red.log 实际总结1文件失败、2例FAIL、17例PASS（重复错误块不是6个不同失败用例）；绿日志 automations-reviewed-final.log 当前实结束8文件159例PASS。日志仅汇总文件数，未列完整命令/测试名，本审计不冒称独立重跑全部159例。原错评与各首轮FAIL继续保留。

## 隔离公开HTTP证据

已读 public-final.json 和 public-seed.json，核实际返回结构：

- archived历史 jobRuns.listByJob、jobRuns.get、真实 AI parent steps 各200，steps内容明确“隔离历史验收记录；没有执行真实采集或模型调用”。
- 对上述三条相同真实ID改组，均404 OwnershipError。
- archived setEnabled 原account header404，details.reason=account_archived，active当前身份写门未放宽。
- 当前选A查询同组小红书B readiness200，DTO planEvidence=missing、collectAvailable=true；证明目标错误ctx误拒绝已消失，但该样例没有合法凭据，因此绝不能称 verified、真人绑定或现登录通过。
- 原seed的5个任务与final回读对应，逐项比较 id/accountId/sourceKind/schedule/target 全部不变。final共6条，额外1条为明确离线归档历史夹具，不冒称原任务自动补齐。小红书任务改名和启停为明确隔离操作，可从回读看结果；原ID/cron/target未改。

archive-fixture.json fixtureOnly=true；archive-fixture.mts 通过既有后端service/AI repo端口创建中性父任务+步骤+run，run标failed且明确未采集，再归档账号。它是构造历史的fixture，不是实际调度/模型/真人登录结果，不可作为那些链路完成证据。

本组public-final只呈现跨组拒绝，未呈现异用户HTTP请求。后端已有异用户守卫与service回归不因此被删；若最终验收声称HTTP跨用户已验，需补真实对应结果，不能从3个跨组404推导跨用户现场发生过。

## 仍需诚实保留的范围

当前4处源码审计缺口已关闭，原首次code-review FAIL及错评记录保存不覆盖。本次隔离公开链确认可读取归档历史并保持写拒绝，没触真实账号任务。新包还未经本报告的安装入口验证，不得称已安装修复。全组规模性能、完整Gate/类型/静态欠债和真实平台调度继续依root实际证据，不能将159例局部PASS升级为全功能可用。

## 快照

时间：2026-10-10T21:14:37.042293+08:00。

- `/Users/zyongzhu/Workbase/Thirdspace-creator/docs/features/t1199-bound-platform-scheduled-visibility.md`：`b454ecc6a9103416520f87ef89d091c58df19a2c3d2d51ca7def3227739b2c13`
- `/Users/zyongzhu/Workbase/Thirdspace-creator/frontend/src/features/automations/automations-island.tsx`：`9e169de1531ed007e2c2bbf816b32f6cf781a90ee7dd391feea6048b77dff9b8`
- `/Users/zyongzhu/Workbase/Thirdspace-creator/frontend/src/features/automations/automations-edit.test.tsx`：`fadc75c3bb75e71dd6087d09e3968d83aff08240997a6b3b419ac4ed519e74de`
- `/Users/zyongzhu/Workbase/Thirdspace-creator/backend/src/modules/platform-account/platform-account.service.ts`：`ada9f6f2b51fe80baa4c6267fe7a4e13666f769185720c24652852395fb1a599`
- `/Users/zyongzhu/.codex/creatoros-verification/t1199-20261010/public-final.json`：`411ba8c0fcbe00f52b8af9344a8ad103619948aa44b0ac7b74e78015f9f33e01`
- `/Users/zyongzhu/.codex/creatoros-verification/t1199-20261010/public-seed.json`：`2949ad5be5c1a5dcc0b0929853b1533ab459b6e86da6e918322c88ac1a10c706`
- `/Users/zyongzhu/.codex/creatoros-verification/t1199-20261010/archive-fixture.json`：`bb51e510c1bd275c06845d253ec3d5cef675f388ec77256a09c09473907048de`
- `/Users/zyongzhu/.codex/creatoros-verification/t1199-20261010/form-late-red.log`：`5a67664a1248e0bf17e8e9a8b9f2166046473ebd391b02847742aed0f24ca526`
- `/Users/zyongzhu/.codex/creatoros-verification/t1199-20261010/automations-reviewed-final.log`：`fdd0aebd40d4e0605919207f94f9bbf798d52a29820a547394ceebe147d3abd6`
