# T-1107 独立 SPEC 初审

- 结论：**CHANGES_REQUIRED**
- SPEC SHA-256：`73b1d7ab7235953252275c5228bcd7d3c59809e199c983a637a8fe3651871e74`
- Constitution SHA-256：`86bc2c8add6a01ebf5b2ecf9de05d448770ca14a4e0bdbbf376fffc6387e3800`
- modules.config SHA-256：`9fd4ece9fb38d1bb81fa542f9e89335c5eb31b916cd765fbbab45f4e33ced966`

## 已确认

修订后的事实判断成立：平台登记锚是 `user + account + platform + externalId`，不是用户级唯一。实际隔离探针保留旧 C09 失败，同时证明 B 账号得到独立新记录 `pub-p-60`，其 `accountId/outputId` 指向 B，A 的完整 DTO 不变。因而两个测试的校准边界合理：保留六个真实操作 ID、全部旧跨账号 404；不同账号同 externalId 合法；同账号跨项目冲突仍为 409，并继续验证原锚不变。

证据绑定：

- `ownership-diagnostic.log`：`372cfe65c55f8c6906f48417c70ee1b50995d3d0624c94e41090b9731c69638b`，实际 exit 1、1 FAIL/18 skip，未冒充 GREEN。
- `ownership-public-result.json`：`0c2040c02355ecf09cfb5c08ce51bb37e50f19709047aeefad54d1265d7c96c2`。

## 阻断项 REV-001

当前 `orchestrator/process/modules.config.json` 完全没有 T-1107 条目。SPEC 要求先独立评审和 `taskctl start`，并把写入限定为两个测试；缺少模块绑定时，context compile 无法执行这项限定，也无法约束第20行列出的真实验证命令。

最小修正是在实施前增加 T-1107 精确模块：产品写集为空；测试写集仅包含 SPEC 第17–18行的两个文件；控制/证据路径单列；验证命令覆盖 retry=0 聚焦运行、platform-collection、publishing service/repository/transport、类型和静态门。此修正不改变产品合同，也不扩大产品范围。

本报告没有代签后续 GREEN、实现、安装或完整 Gate。


# T-1107 SPEC 复审

- 结论：**PASS**
- 复审范围：仅销账首轮 `REV-001`。
- SPEC SHA-256：`73b1d7ab7235953252275c5228bcd7d3c59809e199c983a637a8fe3651871e74`（未变化）
- modules.config SHA-256：`a1d4797a942b93efc60a14210689807fe3942216838b84ee42fece3e1ec07cda`

## REV-001 销账

`modules.config.json` 现有唯一 `T-1107` 模块。其业务测试写入仅包含：

- `frontend/src/server/__module_integration__/account-isolation.acceptance.test.ts`
- `frontend/src/server/__module_integration__/platform-account.persistence-client.test.ts`

其余写入均为本任务控制或证据文件，没有产品源码路径。验证命令准确绑定：

- 两个目标测试加 `platform-collection.persistence-client.test.ts`，`retry=0`、无文件并行、180000ms；
- publishing service/repository/transport 三个完整测试；
- backend/frontend typecheck；
- boundary、semantic-boundary、orphan 三门卫及 reconcile。

因此首轮关于无法约束精确写集和验证命令的阻断已消除。首轮 finding 的 anchors、evidence_ref、风险与建议字段保持冻结，只把状态改为 `resolved` 并绑定当前模块哈希。

本复审不表示测试已经修改或运行，不代签实现 GREEN、安装或完整 Gate；当前只具备正式 `taskctl start` 的控制条件。
