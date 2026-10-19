# T-1074 Agent 工具与提示词调研

2026-10-08实际只读研究；源码基点4eedd433，主树目前fbb861d4。产品尚未改动，以下不作为新功能验收PASS。

## 大白话结论

助手要先知道能做什么，再取具体参数；执行后拿真实回执解释结果。页面推荐工具可以少，但发现入口必须覆盖用户目标。创作操作先给可检查的候选，用户采用后由原功能保存；失败要给原任务及可继续的操作。

```mermaid
flowchart LR
 A[自然语言目标] --> B[简明能力目录]
 B --> C[按需工具合同与功能方法]
 C --> D[原服务读取或提出候选]
 D --> E[用户预览并确认]
 E --> F[正式回执与继续微调]
```

## 官方公开证据

- [Codex工具发现源码](https://github.com/openai/codex/blob/3e544e843713d254dfc22ced37b902235a7573f8/codex-rs/core/src/tools/handlers/tool_search.rs)：检索延迟工具元信息，选中工具供后续模型回合调用。固定commit，不将main变化算进结论。本机Codex0.160.0仅提供JS启动器，未包含Rust核心提示词，故进一步读官方源码。
- [Codex发现实现](https://github.com/openai/codex/blob/3e544e843713d254dfc22ced37b902235a7573f8/codex-rs/tools/src/tool_search.rs)：发现仍受当轮策略与可用工具集合约束。公开提示词模板不能等同产品当前全部有效系统提示词。
- [Coze Studio系统提示词](https://github.com/coze-dev/coze-studio/blob/fefb05ff27be1da939612fbf9faf5db62583b8ae/backend/domain/agent/singleagent/internal/agentflow/system_prompt.go)与[消息装配](https://github.com/coze-dev/coze-studio/blob/fefb05ff27be1da939612fbf9faf5db62583b8ae/backend/domain/agent/singleagent/internal/agentflow/node_chat_prompt.go)：组合人设、变量、时间、知识、工具先执行结果与历史/用户消息。
- [Coze插件工具装配](https://github.com/coze-dev/coze-studio/blob/fefb05ff27be1da939612fbf9faf5db62583b8ae/backend/domain/agent/singleagent/internal/agentflow/node_tool_plugin.go)：版本化插件配置形成名称、描述、参数schema，调用保留用户/项目/会话范围及原插件服务。不能由此声称获取到Coze商业版隐藏提示词。
- [Claude系统提示词配置](https://code.claude.com/docs/en/agent-sdk/modifying-system-prompts)、[自定义工具](https://code.claude.com/docs/en/agent-sdk/custom-tools)、[MCP按需发现](https://code.claude.com/docs/en/mcp#scale-with-mcp-tool-search)：基础提示词、附加提示和自定义提示分开；目录可见性与执行许可分开。
- [Anthropic工具设计实践](https://www.anthropic.com/engineering/writing-tools-for-agents)：用真实任务评估工具选择、参数、结果可理解性和错误恢复，避免含混工具描述。

用户提到的“Coze X、Coze Code”对应关系未获得确认。研究覆盖可确认的Coze Studio，以及Codex、Claude Code官方公开材料；不把三者混称为已核实同一产品。旧prompt.md、OpenCode部分main路径404，未用于结论。

## 落地判断（本项目设计推断）

1. 保留正式契约完整性；目录默认可选简明摘要、筛选和分页，按需describe，旧完整list保持兼容。
2. 工具描述写用途、输入来自哪里、前置条件、结果形态、后续采用/查询方法。不得宣传冻结目录之外的操作。
3. 统一政策、功能Skill、当前真实目标、当轮工具合同分层装配；场景推荐不冒充全系统授权。
4. 运行中沿用原task/lease/deadline；原请求未知时查询同一任务，不自动重发。
5. 创作保持候选—预览—采纳—读回；排队不称完成，失败不称空库。
6. 独立验收模型任务、确定性边界和真实UI；不据源码存在或mock供应商称安装版成功。

这些是参考公开设计后结合CreatorOS既有owner、execution账本与候选机制的推断，不是照抄外部系统提示词。
