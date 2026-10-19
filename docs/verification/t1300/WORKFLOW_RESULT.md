# T1300 必要流程前置结果

独立方案初轮与增量复审均由原reviewctl登记：REV48ecebc6b6af、REVade4b655f14a。taskctl真实start后T1300保持🔨，未完成产品任务、未修改生产或测试源码。

已执行的数据变更：两已终态且无依赖/活动/lease的T1111/T1125原定义迁至非执行归档，保原config完整字节/SHA、完整module JSON、最后complete原行及canonical终态行。原其余206个module在归档时不变。下一层真实发现T1294/T1295尾星不符合原路径规则，经同任务round2独评后各收窄为现存SPEC/邻接review两个明确文件；原其他204个module及旧任务状态/审核/文档不变。另新增T1300自身四步骤精确DAG。未改任何通用校验器或其版本来源。

| 实际检查 | 结果与证明范围 |
| --- | --- |
| 原progress generate | exit2：T1111绝对write路径，原RED保留 |
| 归档后首次generate | exit2：T1294尾星，`workflow-green-progress.log`名字不表示通过 |
| 收窄后的generate attempt2/3 | 均exit0；207模块/312步骤，既有done标记按工具保留，不新造e2e_verified |
| 原三文件流程测试 | exit1：57例，50PASS/7FAIL；7项context-compile夹具把读取根固定为缺规则文档的仓库orchestrator，未进入成功packet断言 |
| 同原字节脚本/断言完整环境验证 | exit0：57/57，81个脚本逐字节相同，临时skill布局只提供真实3.29.0规则读取目录，已清理；不覆盖原7FAIL，不改vendor |
| 额外原路径/归属负例 | exit0：9项，含精确文件正例、绝对路径/父穿越/中间glob/尾星拒绝，以及原治理真实路径拒绝越界符号链接；保留首次诊断脚本因macOS路径别名未进入CLI的失败，修脚本传真实路径后attempt2通过 |
| 归档ID不能执行 | 两ID的claim/context-compile四次全部拒绝，progress原字节不变；未执行旧命令或重发旧任务 |
| 本项目context-plan/compile | 实际安装skill根下exit0，生成`orchestrator/context/T-1300.md`；另保workflow阶段packet快照。不是临时测试布局替代真实入口 |

workflow首次claim因宽泛文档写集把已冻结历史原文当新增机制而exit1，原输出保留。后续仅将已经创建并审定的快照/评审/原锁等列为只读输入，当前workflow写集收窄到结果/脚本与控制面；既有归档创建授权和真实写入事实仍保留。未改扫描器、原文、预算或增加虚假授权。真实claim attempt2已exit0，执行归属为C单writer；产品后续沿共享checkout严格串行B→A→独立分模块验收。

历史与当前范围分明：原全量reconcile33/29及20审核基线不在此前置重跑，本结果不声称全局绿。源码/候选构建、真实模型、40公开条目/56能力键的功能与性能验收均尚未开始，继续按已锁SPEC/矩阵执行。完成前置不等于用户的Codex不可用已修复。
