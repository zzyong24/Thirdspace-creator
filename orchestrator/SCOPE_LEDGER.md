# Scope Ledger

| 日期 | 任务 | FR 家族 | 新域 | 新表 | 新/变更 operation | 新 role | REV-ADD | Gate |
| --- | --- | --- | ---: | ---: | ---: | ---: | --- | --- |
| 2026-07-26 | T-534 | TSB | 0 | 0 | 1（API-TSB-001 本地只读投影） | 0 | 0 | pass：未触发 0/2/6/1 阈值 |
| 2026-07-26 | T-537 | 537 | 0 | 0 | 5（1 新增、4 变更） | 0 | 0 | blocked：范围预算可接受，但真实双账号 `RAT-537-01` 未通过 |
| 2026-07-28 | T-595 | VIS | 0 | 0 | 4（2 个旧采集入口改为同一 canonical collector；2 个项目级联清理窄操作） | 0 | 0 | pass：0/0/4/0，未触发 0/2/6/1 阈值 |
| 2026-07-29 | T-599 | SCHED | 0 | 0 | 6（calendar list/create/update/delete/transition；dashboard DTO） | 0 | 0 | pass：0/0/6/0，未触发 0/2/6/1 阈值 |
| 2026-07-29 | T-604 | MAUTH | 0 | 0 | 3（settings models list/put/test 行为收窄；0 新增） | 0 | 0 | pass：0/0/3/0，未触发 0/2/6/1 阈值；上游 Gateway 风险独立保留 |

说明：AM activate/status 的 signed `channelConfig` 是上游既有 operation 的消费契约，不在 Creator
新增服务 operation；IssueFeedbackDialog、激活页、设置页与 opener 都是既有 surface 重接线。

| 2026-10-06 | T-1062 安装旧历史机械兼容 | T1062-MIGRATION | 0 | 0（用户库无新增legacy表，仅校验已执行历史；原0128范围不扩） | 0 | 0 | 0 | in-budget：3完整archive+4精确旧身份，无新凭据库；fresh/真实凭证/归属/服务不变，21回归和副本双启已实测，安装待验 |
