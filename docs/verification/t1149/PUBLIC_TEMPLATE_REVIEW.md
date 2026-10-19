# T-1149 公共模板校准独立补充复核

- 时间：2026-10-10T02:44:37+08:00
- 结论：**PASS_CALIBRATION_PENDING_BROWSER_RERUN**

首轮真实 Chrome 的两个用例均在 `setup` 初始 `canvas.save` 返回 404，错误为模板快照不存在或无权访问；尚未进入比例交互，所以该失败不是产品 RED。原 trace、内外日志和旧 E2E 字节均保留。

当前校准删除虚构 `neutral-style` / `other-style`。测试在同一 fresh group 中经公开 `assets.visualTemplates.list` 分别读取 `xhs` 和 `cover` 的 builtin 目录，选择 `visualMode=graphic` 且 `requiredIdentity=false` 的真实模板，并逐字段复制 `id/name/revision→version/prompt/visualMode/requiredIdentity` 到 snapshot。该路径仍经过后端 `resolveTemplateRequirement` 和真实 owner 校验，没有 stub 校验或放宽 contract。

三产品、两个组件测试、runner、PAGE_SPEC、节点/参考图、save/get 与业务断言未改变。校准足以重新运行公共旅程，但本报告不代签尚未发生的 Chrome 成功、截图、旧任务收据恢复、完整 Gate、安装、模型或 native。
