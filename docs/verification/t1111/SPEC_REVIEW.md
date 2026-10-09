# T-1111 独立 SPEC 初审

- 结论：**CHANGES_REQUIRED**
- SPEC SHA-256：`558e557902aeea3628aebdd50a4444ad210ea81f8a52ad279df7118b472f55f1`
- modules.config SHA-256：`4010dd9eeb7ba433427d6d0d8e6343e472e58a2d22325af59f71b096dde210d3`

## 已确认

根因准确：`freeze-source.py` 第21行把 `findings == []` 当成唯一通过形式，而 T1107 最终报告的 verdict 是已认可的有限PASS，且唯一 `IMP-001` 明确为 `resolved`、含非空 `id` 与 `resolution`。原三文件27PASS与service44PASS证据闭合；删除 finding 或把报告重写为空数组会破坏审计历史。

拟议校验边界合理：只对T1107要求精确有限PASS verdict；findings必须是数组；空数组或所有项均明确resolved且具备id/resolution才通过；open、缺字段和未知状态继续拒绝。其余任务的空findings要求、源SHA、安全扫描、clean main、版本和正式Gate都保持不变。

原冻结预检实际exit1，JSON SHA `45587dd134fa715a32911d5322536ad70d7610cf22dde7f91561011cfd86aaf1`、日志 SHA `f03c26b90fa2379a7521ff4e4ba788a92b23433cedcddcb30692dea2fb608226`，不能记成已修复或PASS。

## REV-001

当前 `orchestrator/process/modules.config.json` 没有 T-1111 条目。SPEC明确要求独评后再 `taskctl start`，但缺少模块绑定时无法约束：产品/测试/构建脚本零写、仓库仅控制与证据写入、私有helper单点修订，以及同一冻结入口真实复验。

实施前应补T-1111精确模块绑定，再进行recheck。此项不改变helper设计，也不扩大产品范围。

本报告不代签helper修复、冻结PASS、打包、安装或全局Gate。
