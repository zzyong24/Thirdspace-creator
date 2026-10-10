# T1199 独立只读 SPEC 复评

结论：PASS（仅 SPEC 与实现边界评审；不是实现、测试或安装验收通过）。

审稿对象：docs/features/t1199-bound-platform-scheduled-visibility.md
审稿 SHA256：5c94501638b4eb12c77402c5600d81ddb13c16e02e86c318f9694d7bf3da8415
日期：2026-10-10
审稿角色：独立辅助审稿；只读源码与 SPEC，未修改 repo、任务状态或 Git。

## 复评依据

首次审稿对象 SHA 4684569541119cc206ff6998f3a803307c6968f768afdd1b98b28eed18d72294 存在三项合同缺口，已向root实时报出。当前再次完整读取的新稿对三项均作明确修正：

1. 保原普通创建白名单。总览只手工新建 topic.daily；抖音普通只 self.metrics/comments，其他已支持媒体只 self.metrics。self.traffic/self.detail/intelligence.sync 均系统托管，只保已有管理/编辑，不扩大后端 systemManaged 权限。符合真实 scheduling.service/intent/CreateJobDialog 消费者。
2. 私有新增资格必须 planEvidence===verified && collectAvailable===true，missing/unknown/null/失败均不新增；保已有任务操作与真实错误。
3. 共享按 group+kind 识别去重，包含旧 accountId 非空行；新共享创建才使用null账号，既有任何作业仍沿原job.accountId与页group冻结，保原ID/归属/关闭/排期。当前实际抖音组共享行非空账号兼容已覆盖。

## 边界与合同核对

- accounts.collectionPlanReadiness：effect只读，DTO仅真实账号/平台/status、能力布尔或null、证据三态。显式当前group且member.group一致，user ownership守卫；纯组可读同组目标，跨组/无组拒绝。凭据内容、目录、secretReference不出公开DTO。
- readiness历史实际绑定/持久proof/旧抖音文件证据仅表示默认计划资格，绝不声明当前仍登录；缺端口unknown、能力未知null，真实读取失败抛错而非missing。归档状态可返回且不进行外部凭据读。复用owner服务port与startup同一函数，结构边界明确。
- 页面默认全组；平台与实际账号筛选不改变全局group。已有任务不因资格不足隐藏，列表失败/资格失败/无任务/无run与真实failed区分。
- 所有操作/详情冻结原group+jobaccount；打开创建表单冻结明确目标，筛选不改该目标；切scope/unmount/迟到响应禁止回写，保单在途和原task/run ID。
- nextRunAt缺失诚实未计算，原cron保留；最近状态取真实run，null时间不冒称从未运行。
- 写集仅合同/platform-account owner、现有composition证据port、自动化route/page/island与对应测试；不新增后端业务至frontend，不动worker/Schema/数据库或调度创建授权。
- 用户真实组禁止新建/启用/运行/补齐，暂停真人研究保留；代码实现和安装包验收仍分开报告。T1083控制失败不放宽，本评审不领取Packet。

## 实现必须兑现的验证项

- readiness公开dispatch/实际owner service/schema：跨user、group不匹配、无group、纯组真实目标、archived、missing/unknown/null/port异常；不得以静态capability代签实际账号证据。
- 组成员/任务全量分页遵守pageSize<=100，至少101条跨页样本；后页失败不冒称完整，真实空组和读失败分开。
- 同组多平台、同平台多账号、共享旧nonnull与新null去重，原ID/cron/target/enabled/history保留；系统kind普通创建仍不可用。
- 详情/编辑/开关/运行逐原job冻结，空组切换及过期readiness/run结果不回写；recent-run接口失败与无历史分别渲染。归档账号保历史，不给新增假操作。
- frontend既有全部自动化测试与新增group scope、backend startup/bootstrap、LED047、type/boundary等实际运行；不能只测helper，不删既有真实操作断言掩盖失败。
- 当前新包未验收；最终隔离真实UI和安装版公开回读才证明已修复，当前没有真实同组多平台样本必须诚实保留。

当前没有剩余阻断实现的SPEC缺口。具体实现仍需按上述合同独立复核；该PASS不把测试待验、源码未实现、现有全局失败或T1083漂移标为绿。
