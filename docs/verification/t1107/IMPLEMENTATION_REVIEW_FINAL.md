# T-1107 实施最终独立复核

## 结论

**有限 PASS**：两个测试校准与 publishing 公共回归已经形成可核验闭环。此前 `IMP-001` 仅就验证证据销账；原错误命令和单文件结果继续保留。

## 实现与聚焦验证

两个目标测试字节与初轮实施审查一致：

- 六个账号操作 ID 使用精确数组，逐个无上下文拒绝、CRUD 和用户隔离断言保留。
- C09 保留原跨账号 publication/revision/list/create/父 output 404；新增 B 事实对 A 仍为 404。不同账号相同 external ID 生成不同记录，B 的 account/output 精确正确且 A 完整 DTO 不变；同一 B 账号另一项目抢占返回精确 409，B 原 DTO 不变。
- 未加入 retry、skip、宽松状态码或删除归属断言。

聚焦公共结果仍为 3 files / 24 tests / 0 skip / exit 0，日志 SHA `903d33996013e98a7b142f8b9faaa638a545e6c8ebba749360913bc63207808a`。

## IMP-001 销账与历史保留

初轮 `publishing-baseline` 错把两个不存在的文件传给 Vitest，实际仅运行 `publishing.service.test.ts`：1 file / 44 tests / exit 0。该事实与原报告保持不变。

新增 `publishing-real-tests.json`（SHA `518ee7682d54631457973b4f7067dbb64786eb9172a1ec39a3cefb167b67f3e0`）实际运行三个真实文件：

- `publishing.repository.integration.test.ts`
- `publishing.contract.test.ts`
- `publishing.acceptance.test.ts`

日志 SHA `436d08d5596d2c17684ac6818bf99cb9588dbcf6b007e65c6d230ab9b617e0ef`，实际 3 files / 27 tests / 0 skip / exit 0，397.738 秒。与先前真实 service 结果合计覆盖 4 个 publishing 文件、71 个测试。

当前 `modules.config.json` SHA `d29f66c84728b3bf1a04c1a77638ceacaf477b3067ae0da941a8757853cac75e` 已绑定四个真实文件名，不再引用不存在的测试路径。

## 边界

本结论只覆盖 T1107 两处测试校准、聚焦公共链和四个 publishing 测试文件。未独立签署双端类型检查，也不代签全局 reconcile、安装或全仓。
