# v3 · Stage 3 — DESIGN

## 目标

把已确认的产品信息架构和服务契约收敛为可实现、可验证的界面合同。核心约束是 **No API, no UI**：每个真交互必须绑定已确认操作；否则明示为规划中、走契约变更，或不呈现。

## 输入与产物

- 输入：已签核的 `PRODUCT_SPEC.md` 信息架构与 `SERVICE_CONTRACT.md`。
- `UI_RULES.md`：已有视觉方向或授权内的可逆默认、样式变量、组件与无障碍约束。
- `PAGE_SPEC.md`：页面状态、用户动作、可见反馈及 `控件 → operation | planned | static` 绑定。

## 执行

1. 从产品语言、用户路径和契约推导页面，不引入未确认功能。
2. 复用用户已给出的视觉方向；普通可逆样式可自行选择。重大未决偏好按 `_COMMON.md` 处理，候选稿不扩大范围。
3. 逐页闭合 normal / empty / loading / error / permission 状态，以及 intent → feedback → settled state → next action。
4. 设计工具和视觉风格只在项目 `context pack` 或 Task Packet 显式选择时加载；默认不推断供应商、工具或品牌风格。
5. S 类可把本阶段压缩为 `PRODUCT_SPEC.md` 内的 IA/界面草图，由 DEC-000 和 manifest 的 `compact` 状态记录；这不是 gate 风险接受。

## 门与证据

> **检查：** `gates/05-ui-gate.md` + `gates/06-page-spec-gate.md`

PASS 必须引用当前 `UI_RULES.md` / `PAGE_SPEC.md` hash、视觉方向来源或可逆默认值、逐页状态覆盖和无悬空绑定检查。骨架见 [`_COMMON.md`](_COMMON.md)。通过后进入 BUILD。
