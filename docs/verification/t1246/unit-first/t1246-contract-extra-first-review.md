# T1246 额外 Contract 首轮覆盖独立复核

准许准备并执行所述额外临时 /tmp ESM Vitest config，只选择两份冻结原测试；不修改原 config/assert，不替代原 76 文件 /43 FAIL 首轮。

真实 root：/Users/zyongzhu/.codex/worktrees/integrated-frontend-unit/Thirdspace-creator/contract，HEAD=533224f334c43cdb81a344424e420cad93784dd1。独立静态 import/export 闭包 103 个冻结输入（102 TS +1 golden JSON）全部逐文件匹配 git show 533:path，外部 import 仅 vitest、zod，无网络/SQL/进程/用户库写消费者。详见 /tmp/t1246-contract-extra-inputs.json。

| 输入 | SHA256 |
|---|---|
| contract/src/assistant-system.test.ts | fff4016197b673c7e79b0eb83901d8b14da165650e8fd787e35da34bafd9bf9f |
| contract/src/internal/execution-worker.test.ts | a8ed36dd8d5678b717f36d420ad8cbdb8da7b050452ae918d46a6b0e83bf9f65 |
| docs/verification/t1086/system-read-v1.definition.json（62317 bytes） | 84145f6994f3d35899b2bc07dcec9667e9532bd2f43e9f61cf246a8c508e7cd1 |

assistant-system 测试只有 schema parse/safeParse/toJSONSchema 与普通严格相等断言；唯一 IO 为动态 node:fs readFileSync 该 golden（测试 import.meta.url 的 ../../docs 精确解析到 unit 树内同路径）。golden 真实存在且属于 533 冻结原版本，不能另造空/新 schema JSON。execution-worker 测试只构造原冻结 input、parse union 与 workerCallRequestId 纯函数，无执行 Worker 或 SDK 的入口。schema 字段名 execute/port 只是合同字符串，不执行这些业务。

临时 ESM config 的 test.root/或顶层 root 指真实上述 contract 目录，environment=node、include 仅 src/assistant-system.test.ts 和 src/internal/execution-worker.test.ts，不继承原 config 排除或修改原文件。testTimeout/hookTimeout/teardownTimeout=180000、retry=0、bail=0；不使用 passWithNoTests 或过滤 it.each 参数。Vitest 可使用独立 /tmp cacheDir、reporter 日志路径与 private TMPDIR，避免增加原源码写入。执行前核该 config 与实际 CLI/环境并保存回执，源 SHA 再核无漂移。

清除真实 CREATOROS/GROWTH/TAURI/PG/secret/native 探针环境，不加载真实凭据、不使用 native PG；这是环境护栏，不是测试输入替换。实际 CLI 新进程的 root 决定 include 相对路径，不能在 integration 或用户主工作树错误 root 运行。无需 App、Keychain、系统认证、收费 Codex/API 调用。只有两测试及静态合同闭包，不等价于公共产品运行或 T1086 真实 E2E。

当前仅运行前纯 schema/输入真实性复核，未执行测试/计 runtime count；额外首轮应独立归档真实 list、结果和失败，历史 76/43 原红保留。
