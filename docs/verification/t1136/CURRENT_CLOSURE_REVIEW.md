# T1136 当前范围收尾独立复核

- 审查时间：2026-10-09T16:41:43Z
- 仓库 HEAD：`393ce00a0e03db4f80bdfda3102b0c990b93bf82`
- 结论：`PASS_LIMITED_PENDING_STRICT_PUBLIC_JOURNEY`

## 实际 canonical 结果

本轮完整 canonical 于 `2026-10-09T16:18:27.265560Z` 开始、`2026-10-09T16:39:56.199561Z` 结束，耗时 `1288.923668708012s`，真实 `exit 1`。日志 SHA-256 为 `0beb0a580f27749084acfab128b80c5f90200ab6e06bb97ecaa42a1c39b215a6`。

与上一轮 39 项错误清单逐项比较，当前仍为 39 项，`added=[]`、`removed=[]`、`sameList=true`、告警为 0。七个 T1136 watched 产品、测试及 runner 文件 SHA 全部未变。因此没有证据表明 T1136/T1137/T1138/T1139 引入了新的 canonical 错误；同样不能把本轮结果写成全局 PASS。

## 分任务边界

- **T1136**：此前局部实现、三条真实 Chrome 旅程、聚焦回归、类型和静态门卫证据仍有效；canonical 没有新增本任务错误。只有在 `taskctl` 要求的严格公共旅程再次真实成功后，才具备限定完成条件。
- **T1137**：可与同一次严格公共旅程中的 Esc 关闭后焦点回到 trigger 证据一起限定闭合；尚未发生的 strict 不能预签。
- **T1138**：属于可访问选择器校准，未改变产品语义。严格公共旅程真实成功后可限定闭合，仍需保留首轮选择器失败历史。
- **T1139**：最终有限等待观察已经保留原边界，但即时 bbox 失败的根因仍为 `UNKNOWN`。严格公共旅程成功后只能按“观察时机校准、未复现产品缺陷”限定闭合，不能写成产品根因已经修复。

T1140 与 T1141 在 canonical 期间新增的是治理与诊断活动，不改变上述七个 watched 文件，也不由本报告代签。原有 39 项全局欠债继续保留。

## 准入判断

当前证据允许在 **严格 taskctl 公共旅程实际成功之后**，分别完成 T1136/T1137/T1138/T1139 的已审范围，并在完成证据中明确保留 39 项旧全局失败。当前还不能执行或声称这些任务已经完成，也不能声称安装、原生 App、全功能或全局 Gate 通过。

## 证据绑定

- `docs/verification/t1136/full-reconcile-canonical.json`: `076c40b867bfc55ba26e57870391af27b549fb73f778106d1bec562fec848988`
- `docs/verification/t1136/canonical-comparison.json`: `94975432a082a18f4ea7faf83875f726cd87d66ede40c8be1b11c2da533e9dcb`
- 既有独立实现评审 MD: `961cbc93b8bdfb3391717ad21687a851ee575bdd5a11e159bbe0d5cca2535d52`
- 既有独立实现评审 JSON: `52fef11e31124ba3d5672489e47490f484885b762780f06844eb5818fa49707f`

