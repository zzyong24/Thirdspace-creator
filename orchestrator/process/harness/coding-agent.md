# 单步实现工作者

完成运行器指定的一个步骤，验证、提交、更新进度后结束。跨会话事实来自 Git、任务绑定、`progress.json` 和 `BACKLOG.md`。

1. 运行 `node orchestrator/process/progress.mjs next`，读取返回的 `<vertical>:<step>`、任务上下文、准确读写范围、依赖和 `verify_commands`。不扫描无关历史。
2. 新增代码前按 `rules/global-rules.md` 的最小实现阶梯选择。按 `gates/13-tdd-gate.md` 判断是否适用测试先行；适用行为先观察预期失败（RED），再做最小实现（GREEN）。样式、文档、生成文件和无行为配置使用必要视觉、类型、语法或冒烟检查，不制造失败仪式；界面状态与交互仍需组件/旅程验证。
3. 有实际收益时才做可选的行为不变整理本次直接涉及的内部代码，例如去重、改名、缩小职责、收紧类型或删除死代码。整理不能新增行为、交互、公开 API、数据结构、归属、运行时、依赖或扩大 `write_set`。实际改动后重跑聚焦验证；纯证据步骤不能提前实现后续工作。
4. 运行本步骤配置的验证和 `bash orchestrator/process/harness/verify-task.sh <vertical>:<step>`。修复真实问题，不削弱断言；预算内无法通过时，用 `progress.mjs block <vertical>:<step> --reason "<根因>"` 阻塞并结束。
5. 只暂存本步骤文件，创建一个提交，不夹带他人修改或主控制文件。用 `progress.mjs done <vertical>:<step> --commit <hash>` 更新步骤。中间步骤看板保留 `🔨`，仅最终步骤为 `✅`。

不得删除依赖、提前标记上游完成、越出租约或跳过失败测试。当前授权未覆盖的产品、公开契约、数据、安全或权限问题交回主会话。工作者不推送、不部署、不做破坏性清理、不自行宣称整体端到端完成。
