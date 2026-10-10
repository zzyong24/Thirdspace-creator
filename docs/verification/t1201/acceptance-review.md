# T-1201 acceptance 分类独立只读复核

日期：2026-10-10。结论：**PASS：仅 T-1201 的验收分类由 `待验` 校正为 `—` 适用。不是状态转换、测试豁免或 T-1200 UI 验收豁免。**

本代理未修改 BACKLOG、控制文件、Git、产品或测试，未运行状态/迁移命令；仅写本私有评审。

## 分类依据

- T-1201 链接 SPEC `docs/features/t1201-knowledge-graph-error-contract.md` 的精确范围是一个既有图谱单测失败断言校准；不改变页面、按钮、交互、模型/API或用户旅程。SPEC 无 `frontend-journey-contract`，BACKLOG 该行只有这一文档链接。
- `git diff HEAD --` 实际显示该任务只有 `knowledge-graph-view.test.tsx` 一个用例的6条新增断言/1条替换：保原400和缺模型原始error，精确人话、拒绝凭据术语、fetch1次、未调用关系创建、未刷新。图谱产品与 `ai-error-humanize.ts` 无diff。
- 实际 `knowledge-regressions-final.log` 记录19文件148例全部通过。第一次147/148失败证据仍保留；分类改变不能覆盖或改写历史。
- `taskctl.mjs:255–278` 中 `待验` 会触发 frontend UI report 验证/执行；`—` 被明确允许，但若链接文档包含 journey contract 则拒绝。这里不能只凭“没有contract”判断无需UI：同时有单测试写集及没有产品变化的事实支持明确 non-UI 分类。
- `strict-receipts-migrate.mjs` 第9–10行说明默认待验、不猜UI/非UI；第229–232行明确允许显式 `nonUi` ID 把已有strict但尚未验收任务的 `待验` 收窄为 `—`，且不覆盖已有PASS。README同样记录 `--non-ui` 的显式分类机制。因此不是删除门卫，而是纠正默认分类。

## 必须保留的边界

1. 只校正 T-1201 验收元数据，不改它的状态；状态完成仍需由 `taskctl complete` 携带真实评审/测试/检查证据，并守既有收尾流程。
2. 不创建伪造 UI journey report。19文件148例通过仍是单元/组件回归证据，不能变成真实浏览器或真实数据库证明。
3. T-1200 是整页重设计，已实际改变产品页面与操作入口；其 `待验`、独立视觉/操作、UI旅程与其他Gate要求全部保留，不得跟随改 `—`。即便任务工具未检测到该SPEC中的contract，也不消除已确认的产品范围及实际UI验收要求。
4. 一旦 T-1201 范围扩大到产品错误行为、接口或用户旅程，必须重新评审分类及SPEC，不能沿用此次non-UI结论。

SPEC 当前文字仍有“本任务尚未实现”，与实际已实施和通过的进度不一致；建议主会话收尾时补上真实实施/回归记录，但不影响本次仅单测试范围判断，不得补造历史证据。

## 身份绑定

- SPEC SHA256：`e9b1c533488f3600dbb809114dbb0e2ceb347dcdc8fda0af992b7a1338c2c1b4`
- 已校准测试 SHA256：`3df93e25aba9f58d475975ba81236ec2782810731f76ce627f73aa21023db23c`
- 知识全套最终实际日志 SHA256：`8c7e208fc2a241c28e59fbbf835e39bbdf180c947840c1e4195a278ca9189df8`

本结论只确认 T-1201 non-UI acceptance 分类适用，不代替主会话实际执行任何任务状态变更。
