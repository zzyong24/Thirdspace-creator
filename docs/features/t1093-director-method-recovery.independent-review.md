# T1093 当前完整 SPEC 独立重新初评

- 审查时间：`2026-10-08T23:37:42.237388+00:00`
- SPEC SHA-256：`9cceae8d6f01f5d5c4089748a8adb3e7c432b9f0650c5cea5b4caeabbbc81a72`
- 产品宪法 SHA-256：`86bc2c8add6a01ebf5b2ecf9de05d448770ca14a4e0bdbbf376fffc6387e3800`
- 评审类型：`initial`；验收分类：非 UI（`—`）。
- 结论：**PASS，findings=[]**。
- 历史边界：原正式 `REV:44eab8bc6aaa` 及其事件/回执保留；本报告不覆盖或改写历史。正式新记录由 root 的 `reviewctl` 生成。

## 全量结论

原初审对产品问题、单点写集、冻结链和真实安装验收的判断继续成立。当前新增的“当场流程适用性校准”与实际技能规则一致，也没有降低产品或验证范围。

### 1. 交互式单人流程适用

`product-to-code-orchestrator/workflows/v3-4-build.md` 与技能入口都明确：普通交互式 BUILD 运行 `context-plan.mjs`；只有派发、并行或自治交接时才运行 `context-compile.mjs`。本任务由 root 串行完成唯一产品文件和新增测试，独立评审者只做只读辅助，因此不生成 Task Packet 是受支持路径。它不构成越过写集、租约或独立评审。

实际 `context-plan --task T-1093 --step implementation --json` exit 0。显式 step 解决多步骤任务的选择，不修改旧 progress 或 glob。

### 2. 两个失败被诚实保留

- `context-compile` exit 2：当时 `progress.json` 缺 T1093 绑定；本任务现在不需要用失败命令生成派发包，不能把它补写成成功。
- 官方 `progress generate` exit 2：既有 T1026 非规范 glob 被当前路径门拒绝，已由 T1083 保留；不得为 T1093 手改旧 glob 或 progress 洗绿。

这两个失败是流程证据，不是 T1093 产品实现 PASS。SPEC 对此表述准确。

### 3. 产品和冻结边界没有变化

产品仍仅修改 `backend/src/modules/ai-runtime/assistant-functional-prompt.ts`，新增 `assistant-director-methods.test.ts`。未来新任务的功能方法进入真实 assembly 并随 modelInput/digest 冻结；旧 task/system/tool definition/version/hash、消息、账本、checkpoint及同键回放不重算。严格 JSON number、首次 creation read 空对象、成功 read 后复制 digest、仅 `invalid_input + sideEffect:none` 的同任务改参纠正，以及成功 propose 前不得称候选就绪，均保持。

工具 description/schema、Worker循环、公开合同、owner、采纳、超时和权限没有扩展。未成功、unknown或旧运行中任务不得换键重发。

### 4. 验收没有因流程校准缩减

仍须真实 RED→GREEN、assembly/submission 冻结回归、原 Worker/public message/类型/门卫，独立实施复核、main提交、固定入口打包、安装/HTTP首页/CLI，以及新的 Pi native和creation正式候选回执、base/script refs、DTO不变、零采用、原key恢复。提示单测不代真实Pi；若仍失败必须保留事实并重新独评最小落点。

旧探针误报、原Pi失败、native preview 409、Code Mode外部提示、T1092和旧42项全局欠债均继续保留，不能冒充全功能或UI验收。

## 实际流程证据绑定

- `context-compile.json` SHA-256 `a60f00554b5c207e93e416d147c25c7b15eb0b22c540567114bcb60b050395a8`，exit 2。
- `progress-generate.json` SHA-256 `42b52a13e32fad1eac4edd81810873abede0f17a2964d841c824df545d8c1d69`，exit 2。
- `context-plan.json` SHA-256 `f693bd107709646bf9447604289a46dda40624574f3fc0510b9723caa7207f82`，显式 implementation，exit 0。
- `spec-review-record.json` SHA-256 `68df1733de481490ab5bcdb512281fb96392efba6080f3e0b84867a4cd7e0cc1`，原正式review记录 exit 0。
- `task-start.json` SHA-256 `5e6526258053d8fe4d0737e147573fa786b33519ed8e6d6d2742662931dec27b`，原start exit 0。

## Reviewctl 输入

当前 `docs/features/t1093-director-method-recovery.review-input.json` 为 `spec-review-round/v2`、`review_kind=initial`、`findings=[]`。root只能记录已知 `gpt-6` 家族，不猜具体变体。此结论不代签 context-compile 成功、实现、测试、真实 Pi、安装或 task complete。
