# T1148 当前前端 receipt 漂移独立流程复核

## 结论

**PROCESS_PATH_VALID_WITH_DEFERRED_REVALIDATION**。T1148 记录的补验路径符合当前 `taskctl` 与 `frontend-validation` 的真实实现：保留旧报告、visible-copy 和历史事件；对旧已完成任务执行正式 `taskctl block`，会留下审计并将旧 `PASS:<reportSha>` 自动恢复为“待验”；最终源码稳定后再 `resume`，生成绑定最终 HEAD 的新报告与 visible-copy，并通过 `taskctl complete` 实际执行原 allowlist 旅程。

当前 42 项 canonical 失败可以在补验期间如实保留，不能写成全绿。是否完成各旧任务取决于各自原合同的实际旅程成功及本任务范围失败是否为零；范围外既有全局错误可继续明确保留。剩余源码整合尚未结束时不应提前重签，否则 watched paths 后续变化会再次令 receipt 失效。

## 绑定输入

- 审查 HEAD：`efe9f1ce8a9695354724aad2815cb96304108367`
- `frontend-validation.mjs` SHA-256：`47c79d66e687b913d3d9a848dda50429f551bae071646d5efbed9263e1c38727`
- `taskctl.mjs` SHA-256：`f5d9660c87023b1320ba3703bd3b7ef6df9044356b271f6751d0343ea366e65d`
- T1148 诊断 SPEC SHA-256：`e1c7c7ca28c06a2b2675637d68ac07cc8da989dd2b137ca9ced3f9e781ac5468`
- T1108 合同 SHA-256：`eb800589add497ec7e7815a4dc9e38a63e4fe79ecc3245da84ac36cf4e83e6b7`
- T1117 合同 SHA-256：`3c7720477c882202f0971383405cd82e81c3bba3a0c782043e041dd62b90dc08`
- T1136 合同 SHA-256：`4e772799e2fb3ac36d7b06c534c38f787f5f3e858da02f5bdc86ac4dd624a423`

旧报告保持历史字节：

- T1108 current-main report SHA `e23004d972ea3020eb45e8ec9a5d52da459bd523e29a739fd293c41d47463595`
- T1117 frozen report SHA `6a950246d095eb7514daa975e230ed9444fdcecc3673ad495dbf2651a415bd4f`
- T1136 report SHA `8c46da5df4dc588f535851eab277e627a47441f231e90062cbc8088b4ce1b33a`

## 当前消费者的真实约束

1. `frontend-validation audit` 会把 receipt commit 到当前 HEAD 之间任一 watched path 变化视为失效；它不会因为产品测试曾通过而沿用旧 receipt。
2. `taskctl complete` 要求任务当前为 🔨，报告 `commit_sha` 可解析且精确等于当前 HEAD，所有 watched paths clean，报告命令精确匹配 `frontend_verify_commands`。
3. `complete` 会直接实际执行 allowlist 命令，不能只引用先前输出；成功后才把验收列写成新的 `PASS:<reportSha>` 并记录 command/output SHA。
4. `taskctl block` 接受已完成状态，写 ⏸️；若验收列是旧 `PASS:<sha>`，同一事务改为“待验”，并在事件中保留 `invalidated_acceptance`。旧 event/report 不被删除或重写。
5. `resume` 只接受 ⏸️→🔨，仍核现有正式 review receipt；随后才允许 complete。

因此合法顺序是：

```text
旧 ✅ + PASS:old
  → taskctl block（真实漂移原因；旧报告/事件保留，验收自动待验）
  → 等全部相关源码整合完成并冻结最终 HEAD
  → taskctl resume
  → 在新路径写当前报告与 visible-copy（不覆盖旧工件）
  → taskctl complete --evidence <new report>
  → 每个任务自己的 allowlist 命令实际成功并产生新 event
```

不应把旧报告的 `commit_sha` 原地改成新 HEAD；也不应修改旧 visible-copy 的 commit 字段。推荐新建带 current/final-head 含义的报告和 artifact 路径，保留旧正式路径作为历史证据。

## 三个旧范围必须实际补验的原旅程

### T1108

必须执行原 allowlist `canvas-binding-collection:e2e`：`node docs/verification/t1101/run-journey.mjs`，并生成独立 T1108 报告。

原合同必须覆盖：

- `AC-PERSIST`：Canvas 连线引用保存、正式回读、刷新/返回后仍一致；
- `AC-LEGACY`：旧标记只能用户显式恢复，取消或失败不暗写；
- 1366×900 与 900×900；refresh、repeat、back；
- watched paths：`canvas-editor.tsx`、`canvas-editor.test.tsx`、`creative-canvas.spec.ts`。

T1140 素材选择器旅程没有覆盖连线持久化和 legacy 恢复，不能代签。

### T1117

必须同样通过 `canvas-binding-collection:e2e` 的原命令，但要生成独立 T1117 报告并由 T1117 `complete` 再次实际执行。当前验证器按任务逐次执行，不能拿 T1108 的 completion output 直接复用。

原合同必须覆盖：

- `AC-ERROR`：画布保存失败使用当前中文用户反馈，保留真实失败状态与输入；
- `AC-PREVIEW`：参考素材的已选展示、精确 file、缩略图/预览与取消边界；
- 1366×900 与 900×900；refresh、repeat、back；
- 7 个 watched paths，包括 `asset-picker.tsx`、CanvasEditor、InfiniteCanvas 及原三测试路径。

T1140 验证了新低高度 picker，但没有完整覆盖 T1117 的 Canvas 保存错误和原 Canvas 主旅程。

### T1136

必须执行原 allowlist `calendar-dialog-layout:e2e`：`node docs/verification/t1136/run-layout-journey.mjs`，并生成新的 T1136 报告。

原合同必须覆盖：

- `AC-LAYOUT`：1366×900、900×900、390×900、683×450 的排期布局和关闭回焦；
- `AC-WRITE-READ`：公开保存/list 回读及 refresh/back/repeat；
- `AC-TARGET`：目标转组/重选与原归属；
- `AC-SHARED`：共享反馈与素材选择器相邻消费者，取消零写；
- 7 个 watched paths，包括共享 Dialog、calendar control/view、AssetPicker、issue feedback、原 E2E 与 runner。

T1140 只覆盖 AssetPicker 局部，不能证明排期保存、目标归属、焦点返回或反馈 Dialog。

## 42 项全局失败边界

- 当前 canonical `exit1/42ERROR` 必须保留原始收据，不能改写为本轮通过。
- 新增三项是 receipt watched-path 漂移，不等价于产品旅程运行失败；正式 block + 最终源码原旅程补验是正确修复路径。
- 原 39 项继续作为全局欠债。若各旧任务自己的合同与 scoped Gate 全部通过，且新增 receipt 漂移被新 completion 关闭，可在 evidence 中明确保留其它全局失败；不能声称 reconcile 或全功能通过。
- T1148 是诊断/流程补验任务，不授权新增产品、修改验证器、删除合同或把验收改为 `—`。

## Findings

无新的产品 finding。流程上有两个必须遵守的约束：

- **PROC-001**：等剩余共享源码整合完成后再生成最终 receipt；中间 HEAD 补验会再次失效。
- **PROC-002**：三个任务分别 block/resume/complete，并分别由 taskctl 实际执行原 allowlist；T1140 局部 PASS 不可替代任何一个旧任务的完整合同。

本次未运行浏览器、测试、构建、DB、模型或 App，也未修改 main、任务状态或源码。
