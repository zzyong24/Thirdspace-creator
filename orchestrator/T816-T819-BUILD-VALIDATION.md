# T-816 / T-819 BUILD 验证记录

> 日期：2026-08-13
> 结论：实现与聚焦自动化验证通过；真实项目浏览器旅程尚未执行，任务保持进行中，不补写 PASS。

## 已完成

- `context.artifact.text` 返回 `projectId / artifactId / currentVersionId / versionNumber / contentHash / truthPriority / sections[]`，结构稿正文优先于旧 transcript/contentText 派生快照。
- `context.artifacts` 的当前版本号跟随 `currentVersionId`；恢复到较低版本后不再取最大版本号冒充当前稿。
- 项目对话写明“本轮明确要求 > 当前确认稿 > 当前段落 > 事实证据 > Brief/历史”，普通对话可先读当前稿再按语义选择唯一 `sectionRef` 产 `script.patch` 候选。
- 按钮锚点路径保持最小参数；失效快捷命令不强制、不阻断普通对话。
- 工具、候选卡、backend apply 三层拒绝 no-op。
- 项目内容配图执行时重读当前稿并把版本、hash、目标段落正文与视觉职责冻结进 prompt 和 task snapshot。
- `information_card` 与 `fact_capture` 拒绝自由文生图；封面继续走专用链，并冻结当前稿快照，当前稿主张优先于 Brief。

## 本轮实际验证

- backend typecheck：通过。
- frontend typecheck：通过。
- backend 聚焦回归：6 个文件，420 项通过。
- frontend 聚焦回归：5 个文件，115 项通过。
- `git diff --check`：通过。
- boundary scan：通过；剩余 5 条均为基线，新增 0。
- 两份 SPEC 均经独立模型两轮收敛评审，结果：
  - T-816 `PASS[REV:fb03de3a57d7]`
  - T-819 `PASS[REV:0425ab7b87b8]`

## 未冒充通过的项目

- 尚未在真实项目 UI 中完成“自然语言点名段落 → 模型语义定位 → 候选卡 → 用户采纳 → 刷新只改一段”的浏览器旅程。
- `reconcile` 全局失败：BACKLOG 超限、T-770/T-765/T-746 旧评审回执漂移，以及多项历史 frontend receipt 因当前工作树或更早代码变化失效。本任务的类型检查、聚焦测试和边界门均通过，但不能把全局 reconcile 写成通过。
- T-732 的 516 项相关自动化已通过，但 `taskctl` 要求当前 HEAD 的真实 UI journey receipt；本轮没有伪造该 receipt，因此仍未转 ✅。
- T-716 还缺附件/sidecar/0.3.0 本地包验收，保持进行中。
