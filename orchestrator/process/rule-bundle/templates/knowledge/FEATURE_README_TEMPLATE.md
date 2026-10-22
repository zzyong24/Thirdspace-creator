<!-- truth: canonical -->
# <模块名>(FEAT-xxx)— 模块导航

> 这是模块的**唯一入口页**:新 agent 进这个模块,先读这一页,再按导航跳。
> 只回答四件事:这模块是什么 / 对用户值什么 / 现在做到哪 / 细节在哪。
> **不写实现细节**(那在 BUSINESS/DATA/UI 里),**不写跨模块流程**(那在 `docs/journeys/` 的 FLOW-xxx 里,这里只引 ID)。
> S 类小模块可把 BUSINESS/DATA/UI 三件套直接合并进本页(见 `rules/knowledge-layer-rules.md` 的 S/M/L 分级),合并时 AC 表必须保留。

## 定位(一句话)

<这个模块在产品里是什么角色。对照项目根目录 PRODUCT_SPEC.md 的 Module map，一句话，不许超两行。>

## 用户价值

<用户用它解决什么问题;没有它用户会怎样。2-4 行。>

## 当前状态

| 维度 | 状态 | 说明 |
|---|---|---|
| 整体 | <✅ 已上线 / 🔨 建设中 / 📋 规划中> | <一句话> |
| 已交付 | <一句话概括已能用的能力> | 收据见 `blocks/` |
| 已知缺口 | <一句话,或"无"> | <引 BACKLOG 任务 ID> |

## 入口导航

| 想知道什么 | 去哪 |
|---|---|
| 业务规则 / 状态机 / 验收标准(AC-xxx) | [BUSINESS.md](./BUSINESS.md) |
| 数据从哪来 / 谁写 / 血缘(DFLOW-xxx) | [DATA.md](./DATA.md) |
| 页面 / 四态 / 控件↔API 绑定 | [UI.md](./UI.md) |
| 合同代码事实(脚本生成,**禁手改**) | `CONTRACTS.generated.md`（CONTRACT 阶段首次生成后再改成链接） |
| 历次任务完成收据 | [blocks/](./blocks/) |
| 参与的跨模块旅程 | <FLOW-xxx, FLOW-yyy>(见 `docs/journeys/`) |
| 参与的数据工作流 | <DFLOW-xxx>(见 `docs/data-flows/`) |
