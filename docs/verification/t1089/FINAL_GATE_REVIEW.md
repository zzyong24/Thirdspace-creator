# T1089 最终 Gate 独立补充复核

- 复核时间：2026-10-09（Asia/Shanghai）
- 复核方式：只读新增结果与原冻结源码；未修改仓库，未运行测试、数据库、模型、API 或安装版
- 原实施复核保持原字节：`t1089-implementation-review.md` SHA-256 `a42e62857a8746457612560711b3acc9256e1478babfe86c2bf2055a152cfc59`
- 结论：**T1089 专项 backend 全文件 Gate PASS；扩大 owner/recovery 回归仍有一个未归因失败，当前不能宣称全 scope PASS 或任务完成。**

## 新增事实

### T1089 专项最终回归

`backend/src/legacy-source-migration.test.ts` 最终冻结 SHA-256 仍为 `a4e200cc778fbe75295d3dbf5f6ad871334de892886221bdfefc5f831caea535`。完整单文件实际结果：

- 31 PASS / 0 skip，exit 0
- 耗时 202.736 秒
- 结果文件：`full-backend-final.json`
- 结果 SHA-256：`d73e562cb8f6f5d2e6fabaeba90b4181e57c82e04d26c0c039dab1fd2d555cd0`
- 日志 SHA-256：`dcac4832a350b83337c57c3f09931c356d948a45a59e14313cda0c9975bd4be8`

该结果补齐原报告中 pending 的 backend 31 项全文件 Gate，覆盖最终源码中的来源行 NOWAIT、取消回滚、下一次正常迁移、父/来源锁以及反向 group-migration 串行族。结合原报告列出的 frontend 4 PASS、现有迁移 36 PASS、类型与边界扫描，T1089 自身已运行的专项 Gate 没有新增失败。

### 扩大 owner/recovery 回归

八文件扩大回归实际为 131 PASS / 1 FAIL，exit 1：

- 结果 `ownership-recovery-regression.json` SHA-256 `4884d5129211fdf3ac1e04849c852584ae366be885da32168c817d3d69df3752`
- 日志 SHA-256 `0bc45a96ae5d99520dbb3aa2f6f3a1272ea6ee25c1b8b9877ea7a74c11d1a570`
- 唯一失败：`chat-turn-completion.service.test.ts` 的 `T1088 commitResult严格拒绝worker额外 'tools' 且零完成写`
- 实际错误：`ConflictError: 会话来源已变化`，定位到 `chat-turn-completion.service.ts:38`

随后完整单跑该文件仍为 59 PASS / 1 FAIL，exit 1：

- 结果 `completion-regression-recheck.json` SHA-256 `54a091c9ffded8620b96c69dd6b65b388cf4ecf23e6b0d1576bb69692b94a33e`
- 日志 SHA-256 `59e8f5391da430b3860d8d85e1422007b4130476c56a5709e30fb224090b2f9e`

失败稳定可复现，不是一次性超时，也不能用其余 131/59 项通过掩盖。

## 范围归因判断

T1089 没有修改 completion、submission 或 repository 产品文件，失败 fixture 使用的 account 也没有满足 T1089 迁移盖章条件；这些事实说明它**可能**是既有 T1088 fixture/同时间消息排序或 baseline 行为，而非 T1089 新 SQL 的直接回归。然而“相关产品文件未改”本身不足以证明范围外：依赖、迁移后数据库形状或测试装配仍可能改变可观察行为。

因此，本补充复核不把该失败判定为 T1089 范围外，也不将它计为 T1089 已接受欠债。当前唯一诚实状态是：

1. T1089 精确专项 31 项全 PASS；
2. 扩大回归存在一项真实、可重复失败；
3. 已登记 T1090，只读 baseline 对照尚未给出最终归因；
4. 在 baseline 与 T1090 诊断闭合前，不能宣称全 scope PASS、不能 `taskctl complete`，也不能因重跑局部绿而删除原失败。

## 可执行后续条件

最终归因至少需要使用冻结的原 backend baseline，在相同测试文件、相同 argv、相同数据库初始化与相同 Node/pnpm 环境下复现，并比较失败前的 conversation/source/message 排序与 fixture account 是否一致。若 baseline 同样失败，可按实际证据登记为既有 T1090 欠债；若 baseline 通过，则必须回到 T1089 当前树定位实际差异，不能仅凭 Git diff 排除回归。

本报告不验证安装版、UI、Codex、真实模型、真实用户库或原生交互，也不替代仍在运行或尚未归因的 reconcile/global Gate。
