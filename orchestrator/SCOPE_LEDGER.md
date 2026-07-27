# Scope Ledger

| 日期 | 任务 | FR 家族 | 新域 | 新表 | 新/变更 operation | 新 role | REV-ADD | Gate |
| --- | --- | --- | ---: | ---: | ---: | ---: | --- | --- |
| 2026-07-26 | T-534 | TSB | 0 | 0 | 1（API-TSB-001 本地只读投影） | 0 | 0 | pass：未触发 0/2/6/1 阈值 |
| 2026-07-26 | T-537 | 537 | 0 | 0 | 5（1 新增、4 变更） | 0 | 0 | blocked：范围预算可接受，但真实双账号 `RAT-537-01` 未通过 |

说明：AM activate/status 的 signed `channelConfig` 是上游既有 operation 的消费契约，不在 Creator
新增服务 operation；IssueFeedbackDialog、激活页、设置页与 opener 都是既有 surface 重接线。
