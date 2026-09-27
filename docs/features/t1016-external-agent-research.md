# T-1016 外部本地 Agent 接入调研

## 用户需求与阶段

用户希望 CreatorOS 支持本地 Codex、WorkBuddy 等外部 Agent，参考 ChatCut 已落地的连接方式。2026-09-27 本轮授权范围为调研与方案设计。阶段为 DISCOVER / DESIGN；不修改产品运行时，不把方案建议当成已批准架构。

## 交付与验收

- 阅读 CreatorOS 当前执行、工具、CLI 边界，区分已实现能力与 T-1003 后续待办。
- 查阅 ChatCut、Codex、WorkBuddy 及通用协议的官方资料；核实产品控制 Agent 与 Agent 调用产品两个方向。
- 给出协议比较、接入位置、用户流程、账号与项目归属、取消恢复、工具权限和验证清单。
- 形成含来源链接和架构图的中文报告；未知能力明确标记，不能将 MCP 支持推断为可嵌入运行时。
- 只读检查本机可用命令；不启动真实模型任务，不修改登录凭据或全局 Agent 配置。

## 交付位置

`docs/research/2026-09-27-external-local-agents.md`。产品实现须在用户确认方向后补齐正式契约、架构及独立评审，再进入 BUILD。

## 与已有任务关系

复用 execution_tasks 唯一执行权、现有 worker/service port、候选采纳边界；与 T-1004/1006/1007 的契约、工具网关和工作空间合并规划，不另建任务调度器。T-957 既有验收结论不因本调研改变。

## 调研验收证据

- 已交付报告：`docs/research/2026-09-27-external-local-agents.md`，包含官方来源、现有源码接缝、双向入口、架构图、权限边界及实施验收矩阵。
- 只读本机检查：`docs/research/evidence/t1016-local-probe.json`；Codex 0.144.5 的协议 schema 导出成功。未启动模型任务，未声明实连通过。
- 独立只读审查 `/root/external_agent_local_audit` 完成，已补齐外部 MCP 采纳授权、外部认证续期限制和环境变量白名单说明。此为调研审查，不代替实施前架构 Gate。
- `git diff --check` 通过；`pmem sync` 完成。全局对账结果在报告收尾记录，不能用本任务完成状态代替产品整体通过。
