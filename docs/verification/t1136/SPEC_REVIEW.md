# T-1136 正式 SPEC 独立首轮评审

- 审查时间：2026-10-09T15:45:32Z
- 结论：**PASS（仅允许进入实施与真实 RED/GREEN 验证）**
- 工作树 HEAD：`de7bc56e758d6301466c7aecde016d349445a1e8`
- SPEC SHA256：`ac95acf574ce5e2170bbf7d65c6dcfb62adb752054a31212642612e460080a4e`
- constitution SHA256：`86bc2c8add6a01ebf5b2ecf9de05d448770ca14a4e0bdbbf376fffc6387e3800`
- modules SHA256：`7df176e7c073c20d3663bca523724c03d9b3f765d546c5b170dfcd093b84053d`

## 独立结论

当前 SPEC、模块写集与验证命令对齐，可以进入后续实施。两处产品改动保持最小：共享 `DialogContent` 只补可收缩的单列网格；排期弹窗只校正 `sm` 断点宽度，并把 `min-w-0/w-full` 限定为实际仍溢出时的同路径补充。它们不改变 Portal、焦点、关闭、服务调用、账号组归属、保存与发布语义。

新增的 `frontend-journey-contract/v2` 与既有测试一致：7 条 watched path 覆盖两个产品源、真实入口与两个共享消费者、E2E 和 runner；4 个检查分别绑定布局、公开保存回读、目标转组和共享弹窗；4 个视口与测试常量逐项一致。`refresh/repeat/back` 由保存后 reload、重新打开/重复读取以及 `/projects`→`/publishing` 返回链落实，没有虚构浏览器原生返回或额外业务行为。

浏览器用例通过正式 dispatch/controller/service 创建隔离的组、账号、项目、计划和素材，验证完整 option 身份、弹窗与控件几何、保存后正式列表回读、reload/返回、账号转组后的重新选择、一次失败后输入保留、共享反馈弹窗和 AssetPicker。故它不是只测 CSS 类名或伪造成功响应。一次 409 仅用于验证失败状态，随后成功保存仍走原公共链。

共享组件影响面已被正确承认。模块同时运行排期相关测试、AssetPicker、反馈弹窗、LED-047 八文件、前后端相关链、类型与边界门；实际截图还必须由主 Agent 查看。`683×450` 仅作为 200% 等效布局检查，SPEC 没有把它冒充原生缩放。

## 边界与未发生事项

- 当前两份产品源码仍与原冻结 SHA 一致：`dialog.tsx` 为 `05ef5474…`，排期控件为 `d0c06075…`。
- 新浏览器测试和 runner 已存在。独立评审期间，根会话已在产品原字节上启动 baseline 命令；截至本次更新，私有 baseline log 仍为空且 receipt 尚未落地。本评审不预判其终态，不把它写成 RED、GREEN、视觉或正式验收通过。若几何断言失败，应保留真实起止与结果，并如实标为正式评审记录前启动的原字节诊断。
- runner 的 2400 秒外层预算覆盖 600+720+600 秒三个串行 case、冷启动与清理余量；各动作/导航为 120 秒，未缩短项目超时规范。
- 当前 39 项全局欠债与 T1135 色差 HOLD 保持独立，不能由本任务证据销账。
- 仓库已经存在 T-1136 `taskctl start` 事件，且 baseline 在本轮评审期间已启动；产品源码仍未改。本评审不把先后顺序补拍为历史 PASS，也不要求盲目重跑 baseline 来制造前置证据。产品改动和实施 GREEN 必须发生在本轮正式评审收据之后。

## reviewctl packet 说明

`spec-review-round/v2` 的真实校验器只接受 `review_kind: initial|recheck`。这是首次完整评审，因此 packet 使用 `initial`；“full-scope”写入摘要，未使用会被 schema 拒绝的 `full` 值。

未发现需要阻断当前 SPEC 的未解决 finding；正式 packet 的 `findings` 为空。
