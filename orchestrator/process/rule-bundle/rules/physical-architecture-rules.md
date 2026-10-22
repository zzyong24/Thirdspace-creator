# 物理架构边界

M/L 项目或已显式启用边界配置的项目使用本规则。S 类不为形式建立架构文件；一旦声明了边界配置，仍必须遵守。

`orchestrator/SYSTEM_ARCHITECTURE.md` 说明目录职责、允许依赖和数据写入归属；`orchestrator/process/boundaries.config.json` 是可执行映射。拓扑变化先明确实际边界，再同步配置，避免两处各说一套。

扫描器支持：

- `forbidden-paths`：指定目录禁止出现匹配文件。
- `forbidden-import`：`scopeDirs` 下禁止导入指定包或路径；`allowSameModule: true` 可保留同模块导入。
- 匹配规则：`pkg/` 是前缀，`.suffix` 是路径后缀，普通名称匹配包本身及子路径，不做任意子串匹配。

`boundary-scan.mjs` 将违规与 `boundary-baseline.json` 比较。新增违规阻塞；已有违规减少时收紧基线。不能用 `--update-baseline` 掩盖新违规；接受风险需要具体用户决定。

按项目实际结构声明非扫描约束：契约层不依赖上层；工作进程通过所属服务写入数据；需要用户采纳的 AI 候选不能直接当成已采纳业务数据。纯前端或无持久化项目不因此添加后端、数据库或审批流程。

CONTRACT/首次 BUILD 使用 `gates/02-architecture-boundary-gate.md`。`reconcile.mjs` 在存在配置时运行扫描，没有配置时跳过；文字规则不能冒充已部署的机器校验。
