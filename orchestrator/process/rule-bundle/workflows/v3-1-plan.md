# v3 · Stage 1 — PLAN

产出 `PRODUCT_SPEC.md` 产品总纲：一套语义真相，可按功能模块拆成多个物理文件。

## 目标与输入

把用户想法、已有笔记/设计和可验证事实收敛为可交付目标；Scale Triage 已由初始化记录。

## 产物

- 用 `templates/PRODUCT_SPEC_TEMPLATE.md` 写全局问题、目标用户、场景、范围、模块地图、FR/NFR、FLOW、ENT、IA、HARD、假设、AC、Future possibilities 与成功信号。
- S 类保持内嵌且短；DESIGN 可降为 IA 草图。
- M/L 用 `tools/init-module.sh` 建 `docs/features/<module>/`；局部行为/数据/UI/AC 不复制回总纲。跨模块旅程放 `docs/journeys/`。
- 在产品总纲保留稳定 ID；追溯 guard 激活或项目已有 `ID_REGISTRY.md` / `TRACEABILITY_MATRIX.md` 时同步登记，尚未实现的链路标 `PLANNED`。

## 深度与规则

- 先写用户结果，再拆需求；普通可逆细节使用有依据的默认值。
- 只有高影响假设、未知外部能力、复杂状态、不可逆数据、安全/合规或可行性疑点需要加深或进入 Research-First Gate。
- 评审新增标 `[REV-ADD]` 并逐项确认；建议可进入 Future possibilities，不自动扩张范围。
- 通用问题预算、假设和禁令见 [`_COMMON.md`](_COMMON.md)。M/L 多模块确认前才运行 `prompts/spec-cross-audit.md`。

## 门与确认①

> **检查：** `gates/01-product-gate.md`；发现新增 actor/平台/域时再进入 `gates/03-scope-budget-gate.md`。

沿用用户已明确的产品目标和范围；未决的重要产品选择按 `_COMMON.md` 确认。`buildout` 的新项目按需做用户确认，不运行 spec-review、不生成 review sidecar；先把模块实现与真实链路铺开。只有项目经 `delivery-phase.mjs promote` 进入 `maintenance` 后，对稳定产品面、架构或数据归属的变更才加载 `prompts/spec-reviewer.md`，由 `reviewctl.mjs` 记录 hash-bound 结果。总纲及其模块集合对齐已有授权后继续 CONTRACT，不把阶段切换当作重复确认点。
