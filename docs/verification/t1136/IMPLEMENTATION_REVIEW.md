# T-1136 最终实施独立复核

- 复核时间：2026-10-09T16:19:21Z
- 复核结论：**PASS_LIMITED_T1136_IMPLEMENTATION_PENDING_FULL_AND_STRICT**
- HEAD：`393ce00a0e03db4f80bdfda3102b0c990b93bf82`
- SPEC SHA256：`4e772799e2fb3ac36d7b06c534c38f787f5f3e858da02f5bdc86ac4dd624a423`
- 产品提交：`f7331d3765f81240ff7ad962f827fceba478774f`
- 后续测试证据提交：`393ce00a0e03db4f80bdfda3102b0c990b93bf82`

## 源码结论

两处产品改动严格落在已审范围：

1. `DialogContent` 只增加 `grid-cols-1`，让共享网格列成为 `minmax(0,1fr)`；Portal、overlay、focus scope、关闭、footer、间距、颜色和动画均未改变。
2. 排期控件只把弹窗宽度改为 `sm:max-w-md`，并用既有 `DialogTrigger asChild` 包裹原按钮、删除冗余 `onClick`。原按钮文案、variant、size、图标、受控 `open/onOpenChange` 与 pending 守卫保持；服务调用、归属、失败恢复和保存流程没有改变。

最终产品 SHA256：

- `frontend/src/components/ui/dialog.tsx`：`ef0a8b1da82a5079c59979e364c69cd7051e6c6992cea5ffaf02530b6566f2e5`
- `frontend/src/features/content-calendar/group-calendar-planning-control.tsx`：`fc077641187ad628fea074927919bccbb8bfe0908a3280dbd73bb1bfb6da4377`

## 实际验证

- 冻结源码真实 Chrome：3/3 PASS、0 retry，82.565 秒。四个排期视口、Esc 回焦、正式保存/list 回读、reload/返回、账号转组重选、空目标、一次 409 后输入保留，以及共享反馈与素材选择器均实际经过。
- 共享素材取消前后正式 `canvas.get` 的 revision 均为 2，document 完全相同，未采纳素材、未调用模型。
- 聚焦 UI：6 文件 41 PASS；calendar backend：1 文件 3 PASS；LED-047：8 文件 174 PASS。合计 218 个聚焦断言通过。
- frontend type、boundary、semantic、orphan 均 exit 0。
- timeout-policy 当前 exit 1；静态 27 项与原记录逐项相同，公共消费者均通过。本复核保留其失败，不写成全绿。

## 视觉复核

已实际逐张查看 `reviewed-images/` 八图并核对 SHA。排期弹窗在 1366×900、390×900、683×450 下保持左右边距、完整表单层级和可见操作；长项目与长账号没有撑破父框。保存错误与空目标文案留在触发位置，反馈弹窗在 900 宽可操作。共享素材在 900 宽左右预览清楚。

683×450 的共享素材图中，缩略区与大图预览的主体可视高度明显不足。该布局属于未修改的 `asset-picker.tsx`（SHA `ab1b7323…`），T1136 前后相同，已登记 T1140。它不推翻本轮排期弹窗、共享 Dialog 收缩边界和取消无写的有限通过；同时意味着不能宣称共享素材的低高度视觉体验已经优化完成。

## 历史失败与边界

- 原 baseline 只完成 1366 截图后在 Esc 回焦等待 120 秒失败；没有完成四视口，所以不冒称原几何 RED。
- T1138 的原 selector 未命中与 T1139 的 900 视口即时 bounding box 失败均保留。最终测试分别改为真实 combobox 可访问角色，以及最多 120 秒的有限边界观察；原边距、按钮上下界和取消无写断言仍在，没有用固定 sleep、重试或删除断言洗绿。
- 当前完整 canonical 仍在运行，taskctl strict 尚未执行。本报告不代签两者，也不代签安装、原生 App、AI、真实扫码/发布或全功能。

## Findings

当前 T1136 两处产品实现和已完成的聚焦验证没有未解决 finding。T1140 是真实、已登记且不由本轮两处产品变更造成的相邻视觉欠债；完整 canonical 与 strict 是待发生 Gate，不是已通过事实。

因此当前仅可确认 **T1136 实现及聚焦浏览器/组件/服务范围有限通过**；是否完成任务仍须等待真实 canonical 与 strict 终态。
