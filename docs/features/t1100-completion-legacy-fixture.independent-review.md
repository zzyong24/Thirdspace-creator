# T1100 正式 SPEC 独立初审

评审时间：2026-10-09（Asia/Shanghai）。结论：**PASS，可进入实现**。本结论只批准当前测试夹具校准方案，不代表实现、测试、真实 Pi、安装版或全功能通过。

## 结论依据

- 正式 SPEC SHA256：`ca93215f233cd710a742ee245cda1a3e85e1a3c180321c14e68624cb5f3880c7`；`modules.config.json` SHA256：`936b677a6ec9f72e7701cfcde6211a9e9e6a080bdfbd493b24bfe1da82bdcdcc`；产品定位 SHA256：`86bc2c8add6a01ebf5b2ecf9de05d448770ca14a4e0bdbbf376fffc6387e3800`。
- 当场 T1099 core regression 的结构化结果 SHA256 为 `bd079a7ca5d7019e07d1a22c09555aa24fdce06c9a835b691ed60444abde21d4`，原日志 SHA256 为 `d43604176fe0e9f514f6af4df1ea36524f468e28f07d03dff1ebb3d54a2f24d3`。实际为 16 文件、284 例，282 PASS、2 FAIL；失败仅是 `different-tool` 与 `different-code` 的结果由旧断言期望 `succeeded` 变为当前可信规则产生的 `partial`。
- 当前提交服务把 `toolFailureReceiptVersion:1` 冻结在新任务 payload 外层；completion 仅在该标记和可信 settled stop 条件下启用新的工具失败投影。现有 fixture 通过当前提交服务创建任务，因此原三场景若不显式声明历史格式，实际测到的是新任务语义。
- 方案只在隔离 fixture 中加入默认 `false` 的 `legacyToolFailureReceipt`，并仅对原三场景删除 payload 外层的新版本标记。该字段不在 `modelInput` 内，因此无需重算 `modelInputDigest`；SPEC 同时禁止改变 payload 其余字段、账本、预算、历史、权限、回放与原断言。这能够真实表达旧任务，而不是把新任务的 `partial` 改回虚假成功。
- `single-corrected` 与另两场一起显式采用旧格式，可保留这组三场的原兼容矩阵；新增的当前格式直接 completion 用例则负责证明末次合法失败、无 proposal/committed、settled stop 的 `partial`、卡片、正文、唯一 notice 和同请求回放。两类语义不会混用。
- 正式产品写集为零，测试写集只有 `backend/src/modules/ai/chat-turn-completion.service.test.ts`。T1099 的 8 个产品路径、工具定义、owner/lease/digest/stream/期限和公共 Worker 三例均保持原边界；本任务没有用 helper 或夹具代签公共 Worker。

## 可执行性与验收边界

实现时应机械核对：布尔默认值为 `false`；只有原三场景传入 `true`；删除的唯一字段是任务 payload 顶层 `toolFailureReceiptVersion`；原三个 test body 的关键 expect、错误码、调用数、parts、ledger、replay 和单例 1200000ms 预算不变；新增当前格式测试不能传 `terminalToolFailureCallIds` 冒充重复同参失败，也不能减少 T1099 父规格的完整 Gate。

`modules.config.json` 已绑定唯一测试文件、backend typecheck、boundary scan 与 reconcile。命令行的 180000ms 是默认预算，不覆盖原用例显式 1200000ms。T1099 完整 backend/Worker/frontend 回归仍由父规格验收；若后续完整 Gate、timeout 或 reconcile 失败，应按实际结果保留，不得由本 PASS 消除。

## Findings

无 open finding。当前 SPEC 对真实失败的归因、历史/新格式隔离、最小写集和验证边界一致，可以实施。
