# T1199 独立只读 SPEC 评审

结论：FAIL（待修正明确合同冲突，未授权实现）。

审稿对象：docs/features/t1199-bound-platform-scheduled-visibility.md
SHA256：4684569541119cc206ff6998f3a803307c6968f768afdd1b98b28eed18d72294
日期：2026-10-10
评审角色：独立辅助审稿，不修改 repo、任务状态或 Git。

## 必须修正

1. **共享及系统任务普通创建权限冲突**。当前 SPEC 模板段把 intelligence.sync 与 topic.daily 都表述为共享可新建，抖音四类也有可新建歧义；但真实 scheduling.service.ts:217–223、intent.ts、CreateJobDialog 的普通白名单仅 self.metrics/comments/topic.daily。self.traffic/self.detail/intelligence.sync 仅系统创建。应明确保原白名单：总览共享仅 topic.daily 可新建；原 intelligence.sync/traffic/detail 保管理与编辑，不能开放新建、伪造 systemManaged 或新增后端授权。

2. **未确定资格的处理不明确**。DTO 显式包含 planEvidence=unknown 与 collectAvailable=null；模板段只说证据缺失不新增私有，尚未定义 unknown/null/读取失败。应明确仅 verified + collectAvailable===true + active 明确目标可新建私有；missing/unknown/null/失败不给新增，提供诚实恢复/重试，不影响原已有操作。

3. **共享存量非空账号与新纯组创建冲突**。真实安装的抖音组共享 kinds（topic.daily/intelligence.sync）存量 accountId 非空，小红书组为null。SPEC 一边要求逐job沿原account，一边说共享job accountId=null，再按 accountId+kind 去重会把旧非空shared与新nullshared当两项。应按kind识别共享，组+kind 查重含旧非空行，新建共享scope为空账号；所有既有作业保持原真实job.accountId与group，不迁移原行目标。

## 可保留的正确部分

- accounts.collectionPlanReadiness 为真实只读、脱敏 DTO；真实user/显式group与member.group一致，纯组可读取真实目标，跨组/无组拒绝，archived状态诚实保留。
- historical verified binding / 持久proof / legacy profile 文件证据明确不等于当前登录；端口缺失unknown、能力未知null、失败抛真错误，不把错误当missing。
- root组合复用既有服务port和startup函数；不新增frontend后端业务、worker直写或凭据读绕路。
- 页面全组默认、平台/账号筛选保持工作区；既有任务不由readiness隐藏；最近run失败与空历史区分；原cron/ID/历史/暂停研究不变。
- 根串行产品实现、独立只读辅助无产品写权；T1083控制失败不放宽，不以本评审替代Packet/Gate。

## 需纳入实际验证（可在现有测试写集内补足）

- 组任务与成员超过100的分页读，遵守公共 pageSize<=100，不用现有pageSize200或默默只取首页；后页失败不能标整个组空表或全量成功。
- shared旧nonnull与新null同组同kind只识别既有原job，不重复创建、不开用户关闭任务。
- readiness missing/unknown/null、实际读取失败、archived、无组/跨组/跨用户，服务+真实dispatch/schema覆盖；不只helper。
- 目标打开时冻结，筛选/切组/卸载、迟到readiness与run响应均不回写新组；原详情/编辑/开关/运行测试断言保留，不删测试掩失败。

完整写集对只读证据合同与页面修复基本可行；不应增加 scheduling.create 权限写集。上述修正并冻结新SHA后可快速复评，当前报告不是通过证据。
