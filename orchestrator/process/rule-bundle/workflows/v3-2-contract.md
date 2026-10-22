# v3 · Stage 2 — CONTRACT(契约与可行性)

先明确真实操作与数据可行性，再把正式界面绑定到契约。视觉探索可以提前，但候选稿不能冒充已实现或已验证能力。

## 目标

为每个 FR 敲定:数据从哪来 → 怎么存 → 怎么读回显。产出全量核心路径契约 + 可行性判定。

## 输入

签核的 `PRODUCT_SPEC.md`(FR/FLOW/ENT/HARD)。

## 产物(模板:`templates/SERVICE_CONTRACT_TEMPLATE.md`,后端细则可用 `BACKEND_SPEC_TEMPLATE.md`)

- `SERVICE_CONTRACT.md` — 核心路径操作全量:入参/出参/错误码/权限/幂等/状态迁移;每操作标注 `Source: FR-xxx`。
- **每个涉及数据的 FR 一行「数据链路可行性」判定**(写入契约附录或矩阵):`FR → 数据来源(真实可得?) → 存储 → 读回显路径 → 判定 feasible / HARD / cut`。判 `HARD` 的进 HARD 表;判 `cut` 的走显式变更回改 PLAN。无数据需求说明理由，不因此虚构存储。
- 有持久化需求时明确数据模型与归属，重要取舍记录在现有决定中。

## 规则

- 后端复杂度评估在此做(旧 13/14 的实质);实现不做——实现在 BUILD 切片里。
- 仅在新增重大组件/runtime/外部依赖，或 build-vs-reuse 真正不确定时，核对最小相关的现成能力；实际声称“已有/没有”必须给检索证据。
- 骨架规则见 [`_COMMON.md`](_COMMON.md)。

## Agent 产品初始化

新建 Agent 产品或首次接入/替换执行内核时，应用 [Agent 初始化架构设计](../prompts/agent-architecture-initialization.md)，所有 Agent 均以具备 loop 的内核为基线，在本阶段确定内核、目录职责、依赖复用与验证场景。决定写回现有架构/契约/DEC；Task Zero 复用，不另设阶段或增加常驻上下文。普通业务迭代不加载。

## 门与范围授权

> **检查：** 先用 `gates/03-scope-budget-gate.md` 核对新增范围的必要性和已有授权，再用 `gates/15b-contract-completeness-gate.md` 核对操作及数据链路。仅需跨任务追踪范围增长时建立累计记录。
