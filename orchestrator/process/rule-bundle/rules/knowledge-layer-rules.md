# 产品知识层

仅在 `knowledge.config.json` 存在时启用。一个概念只有一处当前定义；代码生成事实与人工维护的产品含义分开。

## 文档性质

受管文档以性质标记开头，例如 `<!-- truth: canonical -->`。

| 标记值 | 用途 | 默认读取 |
| --- | --- | --- |
| `canonical` | 当前产品含义 | 与任务相关时 |
| `derived` | 确定性生成的代码事实，修改源后重新生成 | 与任务相关时 |
| `evidence` | 支撑决定或验收的原始证据 | 核验时 |
| `archive` | 已失效历史 | 追溯时 |

当前定义不引用归档作为现行依据。生成文档不手改，源哈希变化需重新生成。

## 放在哪里

功能内的业务、数据和界面含义放 `docs/features/<feature>/`；跨功能旅程放 `docs/journeys/`，数据流放 `docs/data-flows/`；平台共性放 `docs/platform/`，研究与验收证据分别放 `docs/research/`、`docs/evidence/`，历史放 `docs/archive/`。根目录只保留全局入口。

按需使用 `README.md`、`BUSINESS.md`、`DATA.md`、`UI.md`、`CONTRACTS.generated.md` 和 `blocks/`。S 类可合在一个功能说明里；只有真实职责或阅读负担需要时才拆分。不要预建空目录和模板。

使用稳定且不复用的 `FEAT-*`、`FLOW-*`、`DFLOW-*`、`AC-*`。重复定义改为链接或 ID，机械索引和统计交给脚本生成。

PLAN 确定目标与验收；CONTRACT 补数据流和契约事实；DESIGN 补界面状态及操作绑定；BUILD 同步受影响定义与证据；SHIP 校验后归档失效内容。

## 校验与维护

- `knowledge-coverage.mjs`：功能入口、性质标记和验收覆盖。
- `docs-health.mjs`：链接、标记、归档引用和根目录卫生。
- `feature-sync.mjs`：生成带源哈希的契约事实。
- `knowledge-drift.mjs`：检测生成事实漂移。

这些脚本共用 `process/knowledge.config.json`；启用后在声明的检查点使用 `--strict`。未启用时不强制创建知识层。

研究保留问题、证据、选项、判定条件和结果，产品规格只链接结论。可复用边界放 Agent 规则，项目事件放证据或历史。修改规则时核实路径和命令、删除冲突旧文；不把事故日记持续堆入常驻上下文。
