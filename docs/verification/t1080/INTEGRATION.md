# T1080本地来源整合实证

main工作台与客户端账号组、原生剪辑、AI候选卡普通合并后，再并入资源回收、期限继承、设备入口及双端出包流水线。原评审链逐字节单独归档，不重签历史Gate。39个已审核覆盖/适配/替代的旧头通过35个最小父保留历史，前后tree完全相同；27个闲置worktree普通remove，2个实际活跃目录保留，来源分支不删除。

本轮实际通过：迁移25项（PGLite与隔离PostgreSQL公共createDb）、Worker88项、期限继承52项、backend兼容115项、助手67项、desktop runtime31项、会话消费者/服务流/控制41项、设备入口12项、原账本服务35项。backend/contract/worker/mcp/frontend完整类型检查exit0；出包4基本suite45项通过。原失败与随后限定兼容后的同命令成功分开保存，测试成功不代签安装或模型验收。

完整timeout-policy实际exit1：原main/client14处短执行/有限观察以及13处调度/动画/取消回收/TTL/已floor误报，逐项来源SHA和消费者判断保留，根因T1081待处理。原三方组合账本测试复用请求号仅改3个fixture键，35项成功且生产SHA前后不变；严格命令回执来自client04ca，旧错误来源metadata和纠正都保留。

本次pre-main全局reconcile运行约十余分钟后为优先出包主动终止，真实exit-15，不称通过；包含额外Rust debug测试构建的完整53教训复测将于出包后继续。既有3.29流程receipt/暂停池迁移与历史看板撞号欠债不删除、不冒签。独立orphan扫描exit0；边界初测新增4项仅两SDK测试目录，原失败保留，限定搬到运行时测试区后再次公共4条suite45项通过，完整前端类型检查和boundary均exit0；原production baseline5保持，不调guard或基线。

52行完整看板详情外置保留SHA和原行全文，前6列（ID/任务/状态/审核/验收/文档）逐字不变，0任务删除、0状态改变；看板58974bytes低于60KiB失控线。30KiB硬限、历史重复/归档复用ID旧债仍如实报告；外置不洗绿这些Gate。

外部完整argv、退出码、日志和原失败见`/Users/zyongzhu/CreatorOS-local-acceptance/worktree-main-integration-20261008`。冻结本地main后仅固定入口`CREATOROS_LOCAL_SKIP_INSTALL=1 pnpm -C frontend desktop:package-local`；不做App或真实数据构建备份、不自动安装、不推送/tag/Release。产物成功与全功能验收分别记实证。

本轮main实际出包和镜像/签名/包内运行时核验已完成，详[出包报告](PACKAGE.md)。此前主动中断只属于pre-main检查；出包后已重启显式55422隔离PG并重跑完整reconcile，实际完整终态exit1、44错误/1告警，耗时992.15秒，原日志和终态保留。独立数据审计闭合44条：18条更早review债务、7条合并后新增评审/验收归属缺口、19条教训失败；不能全部归为旧债。7项登记T1082，原1告警在concise日志中被隐藏，保留未知不编造。

原LED060聚焦38PASS/2FAIL，限定测试合同兼容后原完整命令40PASS/0FAIL/0skip、exit0；LED061原341PASS/3FAIL，经3个精确fixture修复后343PASS/1FAIL且1个未接住拒绝，实际exit1。剩余失败发生在取消测试的vi.waitFor默认1秒正观察，finally提前stop触发WORKER_EXITED；尚未执行取消断言，本轮不称通过。历史内存证据由原finally恢复逐字相等。正观察等待候选独评通过后，原完整资源verifier实跑344PASS/0FAIL/0skip、exit0，104.13秒；无unhandled error，历史IPC前后仍逐字相等。原RED和不足外层的候选拒绝记录全部保留。产品源码与构建0480无变化，失败不影响已经真实生成的安装包。

等待测试兼容后完整timeout-policy再次实跑exit1、29.05秒；7组165测试全部PASS、零跳过，唯一失败为原静态27条，保留T1081来源分类。没有删除检查器/vendor或任何强断言。本文明确区分原完整44错误/1告警与后来两门限定实证，不重写全局对账原结果，也不冒称最终全仓绿。
