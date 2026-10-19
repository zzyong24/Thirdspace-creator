# T1302 新候选实际画面自检

依据项目 oil-ui-pro 0.10.0 与既有工作台方向，仅做当前窄改自检，无新风格或评分。构建源码 `2168294fef3f62bc8e0b4ca3254652b935daeb0d`。以下图均实际查看；不冒独立视觉评审完成，整体仍有待修问题。

1366×900 画面显示文章侧栏已集中为会话、附件和自然语言输入，候选摘要留外卡，选择区在原预览内。空值、真实引用类型/数量能阅读，原标签/事实数量未被造假。仍有三个与可用性相关的问题：联合 ready 预览的绿色模板含六占位、采用后却为无占位石墨版；成功采用的联合历史卡仍提示待核对；文章 editor 在未开预览的刷新首次挂载缺恢复提示。功能事实和原 HTTP/任务/版本详见 FRONTEND_VALIDATION，不因截图变好签整体成功。

代表画面（绝对路径）：

- [文章 ready 预览：六占位真实可见](/Users/zyongzhu/Workbase/Thirdspace-creator/docs/verification/t1302/acceptance/runs/final-2168294-a-ui/a/artifacts-A1302ADOPT-attempt1/11-joint-adopt-A1302ADOPT-真实两候选modal选择与采纳并恢复丢失响应原请求/joint-article-selection-ready.png)
- [同稿采用后：石墨预览与侧栏精简，同时仍有历史待核对](/Users/zyongzhu/Workbase/Thirdspace-creator/docs/verification/t1302/acceptance/runs/final-2168294-a-ui/a/artifacts-A1302RECOVER-attempt1/12-joint-recover-A1302RECOVER-原联合候选经脚本页采纳与同请求恢复，零新模型/joint-article-refreshed-ready.png)
- [文章 editor 原采纳已在服务器成功，刷新外卡缺恢复名](/Users/zyongzhu/Workbase/Thirdspace-creator/docs/verification/t1302/acceptance/runs/final-2168294-a-ui/a/artifacts-A1302EDITRECOVER-article-attempt1/22-editor-recover-A1302EDITRECOVER-article-原编辑候选预览采纳刷新与真实状态/test-failed-1.png)
- [640×900 真实窄屏编导入口后的图文预览](/Users/zyongzhu/Workbase/Thirdspace-creator/docs/verification/t1302/acceptance/runs/final-2168294-a-ui/a/artifacts-A1302RESPONSIVE-attempt1/30-responsive-A1302RESPONSIVE-两owner真实窄屏编导入口与200百分比排版和焦点/graphic-narrow-640-modal.png)

683×450 CSS 视口是 1366×900 基准的一半可用空间，未注入 CSS zoom；DPR=1、visualViewport.scale=1。两 modal 均 top=16/bottom=434/height=418，文章 scrollHeight=966、图文=696；标题、关闭可见，内部可滚动，Tab 留 modal、Escape 回原触发按钮。只证明等效空间布局，不称浏览器菜单/native 200%。

![文章等效可用空间：标题、关闭和选择可达](/Users/zyongzhu/Workbase/Thirdspace-creator/docs/verification/t1302/acceptance/runs/final-2168294-a-ui/a/artifacts-A1302EFFECTIVE200-attempt1/31-effective-200-A1302EFFE-12c9e-3乘450有效CSS视口两原owner预览可达，零模型/article-effective200-title-close-visible.png)

![图文等效可用空间：标题、关闭和原导出可达](/Users/zyongzhu/Workbase/Thirdspace-creator/docs/verification/t1302/acceptance/runs/final-2168294-a-ui/a/artifacts-A1302EFFECTIVE200-attempt1/31-effective-200-A1302EFFE-12c9e-3乘450有效CSS视口两原owner预览可达，零模型/graphic-effective200-title-close-visible.png)

原先 CSS zoom 2 采样的 modal top=-418，标题/关闭被裁切，原图和 metrics 保留。它与上述未注 zoom 的等效空间结果分列，不能用其中之一伪装原生缩放验收。首次窄窗导致宽侧栏卸载并使旧 modal 消失，页面存在真实“打开编导”入口；后续从该入口/历史重开验证成功，未恢复旧 UI 或修改布局。
