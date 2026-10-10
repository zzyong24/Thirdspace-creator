# T208 最终实现与真实验证

唯一 Host 修复补齐原图集分类汇总和已确认后处理 applied/reason 步骤说明。初版固定 summary ID 的同 execution 公开 retry 缺口已先真实 RED；精确获准 summary-only 修正保初代 ID、后续锁内 attempt 后缀及历史排序，同代终态回放不新增。原 source/store 编号、owner/workspace/fence、账本、正文、deadline admission/settlement 区分和公共状态/wire 未改。

最终 Node v25.9.0、maxWorkers=1、retry=0、原 timeout。原两标题先 RED 2FAIL，初版聚焦20PASS；新增 retry 真实 RED 1FAIL 保在 summary-retry-typed-red.*，首次新增 tuple 类型诊断和修正后 typed RED 分开保留。最终聚焦22PASS/0FAIL：原目标2、新Worker1、新Host19，标题筛选未执行52不计通过。attempt2 summary 实际 CHECK 插入失败时两表/receipt/旧汇总及工件版本全回滚；去准确故障后原键恢复，同代 complete 深回读相同，零新供应商请求。

| 实际集合 | 原库存 | 本任务新增 | 结果 |
| --- | --- | --- | --- |
| 原30 | 21PASS / 9FAIL / 0skip | Worker1PASS | exit1 |
| 原170五文件 | 161PASS / 9FAIL / 0skip | Worker1PASS | exit1 |
| postprocess/ledger/worker相关10文件 | 113PASS / 0FAIL / 0skip | Host19PASS | 132PASS、exit0 |
| backend typecheck | — | — | exit0 |
| boundary原门 | — | — | exit1；7违规，登记基线5，额外2条本轮前相同Copilot SDK import |

原30 testcase body逐字相等，原24 integration case未改；只新增明确 import 和默认保持原行为的 optional extraIds fixture。原170的9个失败标题与初版完全相同；#8合法性、冷却、partial与退役fixture等其它任务未借T208改预期或生产。各集合重叠，不能将这些数字相加称总独立覆盖。

原 reconcile 最终真实 exit1：22ERROR / 1WARN / 64OK。完整输出、原错误及SHA见同名JSON和私有日志。LED052缺显式隔离PG配置保持未通过，未查询其它库、获取未知role/secret或重启服务；LED018桌面浏览器门与历史receipt/manifest控制债原样保留。未忽略错误、更新baseline或改门。仅按主控精确授权记录生成telemetry SHA后恢复原缓存字节，原finding/status/receipt未写。

旧 Mother、AGENTS、T915正式审核事件/packet、旧dirty全文逐字保护；DEC/events旧前缀、BACKLOG旧行以及去T208后的modules/progress对象均相同，旧summary/stage不变。ID_REGISTRY任务前干净，以HEAD全文前缀证明仅新增T208行。原context首次缺binding exit2保留，经授权仅新增任务binding后真实compile0。全部raw证据目录0700、文件0600，未stage旧控制或备份。

本任务只实际验证真实合成 Host/Worker/事务和步骤表回读，未执行主UI、安装版或线上UAT；不声明整仓、整体T188或生产验收通过。当前未commit/complete，交Root独立核准确写集及最后结果后裁决。本报告不授T210/T211/T213或Mother partial wire实现权。

源码及完整diff：`t208-final-source.json`、`t208-final-implementation.diff`、`t208-final-write-set.json`。最终 freeze及每条命令/完整测试JSON/exit/raw日志：Creator `docs/verification/t208/final-*`；初版及两类RED保原独立文件。准确SHA和保护证明均在本报告同名JSON。
