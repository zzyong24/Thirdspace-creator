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

| 2026-10-06 | T-1062 安装合同初始化机械修复 | T1062-BOOTSTRAP | 0 | 0 | 0（原定义/ID/schema/注册不变） | 0 | 0 | in-budget：42源+1真实入口回归；仅contract内部依赖拆叶，原公共导出及原18保留，新包待验 |

| 2026-10-06 | T-1062 安装 CLI 失败回执装配候选 | T1062-CLI-RECEIPT / 原 FR-CLI-05/06 | 0 | 0 | 0（只传原 public receipt，不改 operation/DTO） | 0 | 0 | pending：静态六路径准入待根会话复核；原592/283/45保持，原状态机与安全边界不改；未实现、未签测试或新包 |

T-1062 installed-overlay-capture：既有空组共享创作的叠层捕获内部落实，1既有生产+1既有测试+1实施说明；新增领域/表/公开操作/DTO/角色均0。原各step与801历史保持，当前独立write_set共3，不使用旧18签新字节。


| 2026-10-06 | T-1062 安装渲染冻结归属实现 | T1062-INSTALLED-RENDER-OWNER | 0 | 0 | 0（server-only sibling，公共操作签名/权限规则不变） | 0 | 0 | 静态准入exact4；旧daemon注释预算，不新增runtime/process；实现/新包/成片未验 |
