# T-1049 SPEC 限定增量复核记录

- 复核类型：`spec-review-round/v2` / `recheck`
- 前轮：Round 1 `CONCERNS`，receipt `REV:6bcb60845027`
- 当前 SPEC：`docs/features/t1049-open-source-publishing-workbenches.md`
- 当前 SPEC SHA256：`3a7152a62fbc08325b909791790cb341eac68dee8abce2cab1da398457599d90`
- 前轮 SPEC SHA256：`20c5494d8d05f6713a200b80ed8516e596960307081fad15068eeff178a45280`
- Constitution：`orchestrator/SYSTEM_ARCHITECTURE.md`
- Constitution SHA256：`3efbb0394b8bcc9eb3c9ad7e8c9364df51e336006b862e02ac71fd6c9327971e`
- Recheck context SHA256：`b868251b019b588dc1990da24fc04ad703a932218fc96781d43008f6a08da285`
- Revision patch SHA256：`d1e03c5a9df2b74f41e032c539acb28611bfe4cf2daf2fa1cddf3689db054156`

本轮只检查前轮 `REV-001`、`REV-002` 的销账和新增两段的增量风险。两个 finding 除 `status` 与 `resolution_evidence` 外保持前轮字段不变，均标为 `resolved`。

新增状态约束明确了正式真值、草稿与候选保留、局部失败、未知回执、冲突后的重新读回与 CAS 保存，以及禁止新旧内容静默拼接；这与系统架构 2.2 的当下真值原则一致。新增交付物约束分别给出小红书整组图片与 ZIP、公众号 HTML 与图片 ZIP 的最低工件和可读回断言。新增 diff 未发现需要创建 `changed-lines` finding 的明确失败。

这是规格静态增量复核。未运行候选仓库、构建、UI、保存、导出或集成流程，不构成任何真实运行通过证据。
