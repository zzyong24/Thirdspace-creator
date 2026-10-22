# GPT-6 Astra 脚手架审计

审计日期：2026-09-05（America/Los_Angeles）。目标版本：3.26.0。

## 官方依据

实际检索并打开的官方页面：

- [GPT-6 Astra model guidance](https://developers.openai.com/api/docs/guides/latest-model?model=gpt-6-astra)：指令敏感性、已有授权、自主完成、按任务校准测试和委派。这里采用适合当前脚手架的原则，不复制整段宿主提示词。
- [Build skills](https://learn.chatgpt.com/docs/build-skills)：技能的准确触发和按需披露。
- [AGENTS.md](https://learn.chatgpt.com/docs/agent-configuration/agents-md)：项目指令入口；避免把运行时细节和所有条件规则堆进启动文件。

本次是流程与提示词优化，未更改全局模型配置、推理档位或 API 参数。仓库没有可供直接迁移的 OpenAI 请求执行层。性能最大值不能从文档推导，需同模型、同任务、同环境的对照运行。

## 覆盖与处理

| 层 | 发现 | 处理 |
|---|---|---|
| SKILL / AGENTS / router | 高影响变更一律再确认；初始化拓扑参数被等同于必须询问 | 复用已有授权，按意图推断拓扑，仍显式传参；重大未决选择才询问 |
| BUILD / context planner | 入口只在交接时编译包，BUILD 却强制编译；项目上下文路径被漏写 | 统一条件编译；明确两个读取根；具体依赖可扩展读取 |
| 公共规则 / 五阶段流程 | 固定确认节奏、重复证据规则、阶段终点易被理解为停工 | 公共授权策略单一维护；沿用已定方向并继续执行 |
| TDD / bootstrap / worker | 强制整理、无变化重测、人为制造后删除失败测试 | 整理按收益，重测按变化；关键行为保留 RED，低影响变更按需验证 |
| 变更 / PLAN | 每次变更都建报告；PLAN 无条件创建原本休眠的追溯材料 | 使用现有决策路径；复杂影响或实际 guard 触发时才加材料 |
| 派发协议 | 断言子代理完全没有上下文；固定二次失败阈值；父代理重复全部测试 | 依宿主能力传递上下文；按证据停止无效重试；整合产生风险时验证 |
| 兼容路径 | 三个 redirect 指向已不存在的小节名称 | 对齐实际公共策略小节 |
| 自治 harness | run.sh 实际执行 claude -p，模型变量不接受 OpenAI 语义 | 标注适配器边界；保留已测试的执行引擎，不伪造 Astra 接入 |
| 初始化 / 更新 / guards | 已有 adaptive context、vendor hash、状态锁、隔离、风险触发和项目状态保护 | 保留实现，由完整引擎与 harness 回归验证 |

审计重点为可执行脚手架、活跃上下文、初始化/更新入口及测试覆盖。历史 output 媒体和业务复用资产未重写，未声称逐个业务模块的正确性。没有把官方委派建议解释为任何宿主下都必须开子代理。

## 体积与行为验证

以修改前 Git HEAD 为基线，统计 UTF-8 文件字节（不是 tokenizer 计数）：

- 默认 BUILD 的 core + build 五份必读文件：11,179 → 10,602 bytes，减少 5.2%。
- 条件派发契约：3,349 → 1,947 bytes，减少 41.9%。
- 三个入口总计略增，新增内容用于明确授权与项目路径；各自仍在现有上下文预算内。未通过提高预算隐藏增长。

这些数据说明文本成本变化，不等于端到端延迟、token 或成功率提升。没有付费模型 A/B 数据。

验证命令：`bash tools/selfcheck.sh`、官方 `skill-creator/scripts/quick_validate.py .`、`git diff --check -- .`。完整自检含 Node 引擎用例、shell/JS 语法、harness 失败关闭语义、植入故障探针及新模板 reconcile。已有两处文本回归断言随新契约更新：取消强制十分钟整理；允许任务相关上下文扩展，仍约束条件编译与读取范围。状态锁、权限、隔离、发布和运行时 guards 未削弱。

最终结果：256/256 引擎测试通过；完整 selfcheck、harness 语义、技能校验与 diff 空白检查通过。首次验证发现旧文本断言和 router 超出预算 1 word；已更新契约断言并缩短 router，完整复验通过。

## 应用边界

当前技能源码已更新。新项目使用新 AGENTS 模板；已有项目的 `--update` 故意保留项目自有 AGENTS.md，需要按项目实际指令合并相关差异，不能靠覆盖消除冲突。本次没有批量修改其他项目。

Codex/Astra 可在当前会话使用技能和 process CLIs。独立无人值守 Astra runner 仍需单独设计宿主适配和行为验证，不能把 `CODER_MODEL` 改为 OpenAI 模型 ID 就宣称可用。
