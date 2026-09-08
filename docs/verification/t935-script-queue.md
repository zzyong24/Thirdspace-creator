# T-935 整稿任务排队

公开 CLI 2026-09-08 确认 ai-task-8933b989-127 为 script.draft，14:47:28 UTC 入队，无 executionTaskId 和 startedAt。父任务 ai-task-939f9996-d042-439e-9f71-529c829e9964 约18秒完成。需定位子任务准备/唤醒/重启恢复，不能将卡片转圈认作模型生成中。

## 确认根因与修复范围

2026-09-08 解密应用诊断日志显示每约2秒 PREPARATION_RECOVERY_REJECTED，任务没有进入模型生成。独立排查使用真实公开工具输入，在隔离 PGlite 中经过 JSONB 存储重排 schema.properties 后复现：生产参数解析序列为 mode/topic/angle，恢复重建后变为 mode/angle/topic；agentic-tool-binding 的旧摘要使用 JSON.stringify，导致同内容不同键序被误判篡改。

修复不修改历史摘要算法，也不取消来源校验。恢复时注入原生产解析器，先验证工具版本、执行位置、副作用、schema 与冻结定义一致，再按原解析顺序核对原摘要。继续原子任务和原工具回执，不新建替代任务。所有恢复前置错误仍需可诊断，不再只吞成泛化代码。

独立实现与回归：`pnpm -C backend exec vitest run src/modules/execution/execution-chat-script-draft.service.test.ts` 15/15通过。完整内存PGlite父/子事务重现旧恢复失败；生产resolver使同一子任务prepare一次成功，原digest不变、子任务仍只有一条，伪造schema仍拒绝。frontend tsc通过。实际用户任务尚待安装后恢复。

## 安装结果

候选 `4806dcab` 已由干净隔离工作树固定本地入口构建并安装（exit 0），PID24309，sidecar启动日志 SIDECAR_STARTUP_VERIFIED。DMG SHA256 `f87a14fa28deaadb08c17a079952390280239f29487f7aaeefcfa59d3c9e5b7f`；安装和候选sidecar同为 `ea68fea6b5da6d8e8a14ec419ddb081aea71cbd31941a343ab6d89580cdafb14`。签名及hdiutil校验通过。日志 `/tmp/t935-package.log`。

新启动诊断日志暂未出现此前反复的 PREPARATION_RECOVERY_REJECTED；这不等于脚本已生成。CLI授权因安装重启失效，原任务最终结果尚待公开CLI回读，T-935仍保持进行中。搜索业务验收仍失败，见T-934记录。

## 原任务期限继承补修

恢复排队后，公开CLI确认同一业务任务建立执行任务 `exec_4522f002-446e-4cba-85e8-d21c2fa615c1`，但立即失败“原任务截止时间已到”。原因是子任务模型准备仍使用旧默认10分钟预算，且从原入队时间起算；父聊天continuous只覆盖准备重试，未传入模型执行。

修复通过已验证的父来源向业务准备端口传递父预算；旧任务的恢复严格限制为旧默认script.draft预算、EXECUTION_DEADLINE、没有模型调用/回执/证据/候选/租约/检查点，保留相同业务和执行ID及payload，并记录原预算/错误的修复审计。其他失败任务不自动修改。19项针对性恢复测试通过；扩大旧原子任务套件有历史deadline断言与新continuous行为冲突，不能报告全套通过。

最终19/19通过，包含真实StructuredBusinessExecutionService在入队一小时后绑定continuous/null deadline。日志 `/tmp/t935-budget-tests-final-script.log`。独立复核恢复条件与审计通过。

## 原任务真实恢复结果

候选 `1a79d186` 安装并启动后，CLI 自动连接 full（安装证据见 T-936）。同一业务任务 `ai-task-8933b989-127`、同一执行 `exec_4522f002-446e-4cba-85e8-d21c2fa615c1` 从 queued 进入 running，最终 runtimeStatus=succeeded、业务状态 awaiting_confirmation、errorMessage=null。公开 ai.tasks.results.list 返回一个可采纳的 artifact_version，24 段分镜；两次模型调用分别生成口播与分镜，总输出4594 tokens。未新建替代任务、未代用户采纳。

执行恢复通过，内容验收未通过：输入明确要求无凭证时占位，结果却断言“卡了三天”、具体驳回理由“经营场景与主体不匹配”和“两天被打回”。结构 validationStatus=valid 不能代表事实可靠。待修复口播 Skill 对已知事实、用户计划和缺失凭证的处理，不能通过硬编码词表判断创作内容。T-934 搜索质量复验也仍未通过，因此 T-935 不标全量完成。公开结果留存 `/tmp/t936-script-results.json`。
