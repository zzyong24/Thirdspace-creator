# T-1107 实施独立复核

## 结论

**测试实现本身有限 PASS；验证证据 CHANGES_REQUIRED。** 两个目标测试的差异符合已审 SPEC，未发现归属门被削弱。但 publishing “三原完整文件”证据实际只运行了一个文件，不能据此签完整实现 Gate。

## 测试校准

- 平台账号测试把陈旧数量断言改为六个精确操作 ID，并继续逐项验证无上下文拒绝；原 CRUD 回读和多用户隔离未删除。
- 隔离测试保留原跨账号 publication/revision/list/create/父 output 404。C09 现在验证 A/B 不同账号可以登记相同 external ID，生成不同 ID；B 的 account/output 精确正确，A 完整 DTO 前后相等；A 读取 B 新事实仍为 404。
- 同一 B 账号另一个项目抢占相同 external ID 时仍要求 409、无 data、精确 ConflictError/reason，并复核 B 原 DTO 不变。
- 差异没有加入 retry、skip、宽松状态码或弱化归属断言。

聚焦证据 `public-green.json`（SHA `48f74e354c6f1ec64a600ef479fc50fafc9e22a31ed0a79ad26903d78cb42a03`）与日志（SHA `903d33996013e98a7b142f8b9faaa638a545e6c8ebba749360913bc63207808a`）实际为 3 files、24 tests、0 skip、exit 0，命令带 `--retry=0` 和无文件并行。

## IMP-001：publishing 基线命令未实际覆盖三文件

`publishing-baseline.json` 的 argv 传入：

- `publishing.service.test.ts`（存在）；
- `publishing.repository.test.ts`（不存在）；
- `publishing.transport.test.ts`（不存在）。

实际日志（SHA `c4552ac20cec1ff0120b190427256625d49de4d785df1b8b1bce7cbd651670cf`）只报告 `Test Files 1 passed`、44 tests。因此它只能证明 service 测试通过，不能证明 SPEC 所列 repository/transport 完整公共能力。仓库中实际存在 `publishing.repository.integration.test.ts`、`publishing.contract.test.ts`、`publishing.acceptance.test.ts`。

最小修复是校正模块验证命令，选择真实存在且覆盖 service/repository/transport 的原测试文件，并按原 retry=0、无文件并行和预算重新执行；本次错误命令和单文件结果必须保留。无需修改产品或两个目标测试。

## 边界

本报告不代签共享双端类型/三门卫来源、全局 reconcile、安装或全仓。
