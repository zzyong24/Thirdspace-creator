# 架构边界检查

> 适用判定与证据格式见 [_GATE_EVIDENCE.md](./_GATE_EVIDENCE.md)。

架构包启用时，在首次依赖该结构的实现和后续相关变更中执行；无配置的小项目不补结构仪式。

- `orchestrator/SYSTEM_ARCHITECTURE.md` 写清目录、依赖方向和写入所有者。
- `boundaries.config.json` 的 `forbidden-paths` / `forbidden-import` 与设计一致。
- 运行 `boundary-scan.mjs`，不允许新增基线外违规。已有债务可逐步收敛；提高基线需用户明确的 accepted-risk 决策，不静默执行 `--update-baseline`。
- 拓扑变化先明确设计，再更新机械规则；检查输出不能替代语义判断。

Agent 初始化/更换内核时，核对当前内核、目录归属和验证场景，Task Zero 提供真实链路证据。普通项目不追补无关字段，S 可保留紧凑说明。
