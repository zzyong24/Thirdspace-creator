# Agent 内核参考与糯米饭借鉴

核查日期：2026-09-09。下表是本次阅读后的选型建议，不是固定默认栈。本脚手架的 Agent 产品统一以具备 loop 的内核为基线；模型访问库只能作为内核下的依赖，不能单独成为 Agent 产品内核。项目初始化时核对上游当前版本、许可证和目标平台，不用本表替代实际兼容性验证。

| 候选 | 已有能力 / 适用方向 | 产品仍应负责 |
|---|---|---|
| [Codex App Server](https://learn.chatgpt.com/zh-Hans/docs/app-server) | 以双向协议接入完整 Codex 运行时，适合需要嵌入其执行体验的产品 | 协议适配、安装与认证、宿主授权、业务数据、目标分发方式是否可行 |
| [Pi](https://github.com/earendil-works/pi) | `pi-ai` 是模型访问层，`pi-agent-core` 提供循环，`pi-coding-agent` 是更完整的 coding agent；产品至少采用具备 loop 的层级，`pi-ai` 不单独作为 Agent 内核 | 不同包的能力不可混淆；宿主隔离和权限不能假定内建；版本及扩展兼容性 |
| [OpenAI Agents SDK](https://github.com/openai/openai-agents-python) | Agent/Runner、工具、会话和 tracing，可作为自定义业务执行的基础 | 业务权限、部署、跨进程恢复策略；会话历史不等于可靠业务事务 |
| [LangGraph](https://docs.langchain.com/oss/python/langgraph/overview) | 可显式控制状态与执行流程；[checkpoint 持久化](https://docs.langchain.com/oss/python/langgraph/persistence)支持状态恢复 | 选择实际持久化后端，验证副作用重放和服务重启语义 |
| [DeepAgents](https://github.com/langchain-ai/deepagents) | 更高层的 Agent 组合，先检查其现成能力再决定自建多少 | 适配业务与宿主边界；不要再叠一套等价规划循环 |

[GPT-6 Astra 指南](https://developers.openai.com/api/docs/guides/latest-model?model=gpt-6-astra)与[模型页](https://developers.openai.com/api/docs/models/gpt-6-astra)用于核对模型配置；宿主、SDK 与裸模型能力必须分别确认。没有在本次运行这些内核的线上对照测试，不能推导“谁成功率最高”。

## 糯米饭：借鉴依赖方向和宿主装配

本次只读本机 `既有桌面应用项目`，HEAD `e27bd5de`；本地工作树可能包含改动，该 HEAD 不是所有读取内容均已提交的证明。以下路径用于复查，不是新项目运行依赖。

- `crates/backend/nomifun-ai-agent/src/factory/mod.rs`：工厂根据配置选择 Pi/Codex；`CompanionSummonProvider` 由上层注入。值得借鉴的是用接口给下层所需能力，避免引入上层业务模块形成环。
- `crates/backend/nomifun-ai-agent/src/factory/pi.rs`、`codex.rs`：各自准备内核配置、执行路径与 Skills 环境。可迁移为一个产品执行 port 加选定内核 adapter；第一版只需实现被选中的那个。
- `apps/pi-sidecar/src/nomifun-gateway.ts`：工具发现与 `registerTool`/MCP 调用之间有适配层。可借鉴工具合同转换，不能直接照搬其超时、错误分类与权限假设。
- `docs/architecture/backend-crates.md` 与 `crates/backend/nomifun-app/Cargo.toml`：上层组装具体依赖、后端分领域与基础能力。文档中的数量不作为现状统计，实际边界以源码为准。

这些是代码阅读所得的局部结构，不代表其全部生产质量经过验证。重点迁移“应用装配 → 接口 → 内核适配 / 工具服务”的责任关系；不要求所有项目采用 Rust、多内核、大量 crate 或同款目录。
