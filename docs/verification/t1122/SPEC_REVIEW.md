# T-1122 SPEC 独立初审

结论：**PASS（仅实施准入）**。

当前公共旅程 2 PASS 只证明右侧大预览完成加载；900px 截图的左侧选中卡仍为空，因此不能签全面视觉通过。SPEC 没有把空白解释成永久产品缺陷，原因继续标为 UNKNOWN，事实边界正确。

唯一允许的改动是在 normal 与 narrow 原截图前，对同一次真实正式上传素材对应的 `previewButton` 内部 `img`：

- 等待元素可见；
- 用既有 `observe.poll` 和 120 秒预算核 `complete && naturalWidth > 0`；
- 保留右侧大预览加载断言、隐藏文件名/尺寸、ARIA、取消零写、键盘确认、精确文件、保存/回读、防重复和三平台流程。

这不是固定 sleep，也不改变 DOM、lazy 策略、图片源或生产代码。图片若持续加载失败，断言会真实失败并要求另行诊断，不会继续产空白截图后写视觉 PASS。模块正式命令包含原两条公共 journey、前后 typecheck、pmem/reconcile；实际截图仍须独立看图。

绑定：SPEC `adac35f8781737cc8208d5cae20e1a994b19227e72c724c8dd9278ee42e47c45`；modules `b7f1bfbdf39fc069b925d9721624cbcdaf3ee6a9d2bdcab12870c56a402cc7d7`；constitution `86bc2c8add6a01ebf5b2ecf9de05d448770ca14a4e0bdbbf376fffc6387e3800`。本结论不代签 T1117 最终视觉、T1119、安装、全局 Gate 或加载原因。
