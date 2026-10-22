<!-- truth: canonical -->
# 产品知识索引

`PRODUCT_SPEC.md` 是产品总纲与语义真相源；这里是按功能模块组织的导航，不复制总纲内容。

## 功能模块

每个模块放在 `features/<module>/`：

- `README.md`：模块边界、负责人、状态与文档导航
- `BUSINESS.md`：模块内需求、业务规则、状态与验收标准
- `DATA.md`：模块拥有的数据、来源与流向
- `UI.md`：页面、状态与交互绑定
- `*.review.md`：紧邻被审核文档，不放回项目根目录

新增模块运行脚手架的 `tools/init-module.sh`；它会生成四件套、登记本页与知识配置。

## 跨模块知识

- `journeys/`：跨模块用户旅程（`FLOW-xxx`）
- `data-flows/`：跨模块数据流（`DFLOW-xxx`）
- `platform/`：架构、部署、集成等横切能力
- `evidence/`：验收证据
- `archive/`：已被取代的历史文档
