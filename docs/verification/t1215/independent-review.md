# T1215 未登录说明测试范围独立复核

2026-10-11，先读 `orchestrator/context/T-1215.md` 与本任务 SPEC，再只读现有测试、runner、真实账号管理/扫码绑定源码。当前为前置范围评审，尚未修改测试或运行新验收。结论 **PASS：可做仅测试文案校准**，不是产品恢复或新扫码能力证明。

## 代码证据

- `backend/src/modules/ai-runtime/scheduled-collection-runner.ts:135` 的现有固定说明为“平台登录态未连接或已过期，请到「账号管理」对应平台重新扫码绑定后再采集。”；未登录 catch 分支将原 run 状态设为 `needs_reconnect`，使用这条固定说明，并保原 AI 等待用户/失败投影。
- `frontend/src/app/(creator)/accounts/page.tsx` 实际渲染 `AccountManagerPage`；`frontend/src/features/platform-account/account-group-manager.tsx:147` 的扫码绑定对话框实际渲染 `AccountBindingPanel`。`account-binding-panel.tsx:52` 调用正常 `client.startAccountBinding`，第 61 行按钮为“扫码绑定{平台}账号”。这是存在的业务入口；本次没有点击、扫码或访问真人账户。
- 原测试第 138/168 行仍断言“设置 → 账户”，第 139 行断言“扫码登录”，与上述当前固定合同不符。已保存的 e5c 与当前两条失败支持其为既有测试文案欠账，不需为了旧断言改回产品字符串。

## 准入范围与验证

仅在 Packet 写集内修改 `scheduled-collection-runner.test.ts`：两例的旧入口文案断言改核“账号管理”，第一例扫码动作断言改核“扫码绑定”；可以同步这两例的标题及解释注释。应继续分别断言入口和动作，不用无关宽泛“扫码”代替明确指引。

保留原 collector 错误构造、`isNotLoggedInError` 分类、`needs_reconnect`、AI 错误收口、评论未抓取 `itemsNew=0`、已登录返回 0 仍成功，以及其它所有状态/错误/计数/归属断言和预算。不要改 runner 产品、旧 error 原文、fixture 身份、skip 或测试配置。runner 内旧注释及另一个导出错误分支仍有旧入口字符串，属于本次精确测试写集外，不顺带修改或声称全部文案已清理。

改后需真实运行 Packet 的单文件 runner 回归与 `git diff --check`，检查产品差异为空、原其它断言未减。本轮只给范围 PASS，不预签 GREEN、Task Packet 总门或实际扫码结果；既有全局失败保留。

## 2026-10-11 实现与实测最终复核

结论 **PASS**。已只读当前 `git diff`、本任务 `before.log` / `after.log`，并做原 HEAD 与当前文件的精确文本比较：差异仅前置批准的三处旧入口/扫码动作断言、第一例标题及注释；按这些明确字串替换得到的文件与当前文件全文相同。原 `expect(...)` 数量均为 68，所有其它测试及断言逐字保持，包括 `needs_reconnect`、AI 错误收口、评论 `itemsNew=0` 和已登录 0 条成功族，没有删用例或改 fixture/预算/guard。

当场日志：before 为 **22 例，20 PASS / 2 FAIL**，两条失败确为旧“设置 → 账户”指引断言；after 为 **22/22 PASS**。本人另跑这两精确测试路径的 `git diff --check`，实际 exit0。本轮未修改产品或原测试，只追加本评审记录。

本结论只签 T1215 测试合同校准及其实际 runner 单文件结果。context binding 的补齐与旧 T1026 progress generate 阻断属于另存流程记录；未据此签全局 GREEN、旧 validator 已通过、pending 条目已 done 或 E2E 通过。原全局债继续保留。
