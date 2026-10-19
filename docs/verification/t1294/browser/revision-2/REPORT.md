# 200% 等效布局测试候选修订

只修改已准入同一E2E文件，未应用正式测试或生产、未运行新模型。原v1镜像SHA `0030682098515ea1873bc2f1e4ea003a98a04cbba72752d8105a0dc4c6b23b36`、原9P1F、CSS html zoom=2裁切图与640×450初始发送越界FAIL全部保留。

新镜像以 `page.setViewportSize(640×450)` + 原同context的CDP `Emulation.setDeviceMetricsOverride(deviceScaleFactor=2,mobile=false)` 表达1280×900物理视口的200%等效CSS布局；不改变html zoom。复用原group fixture与全网络守卫，不创建另一套未保护context。实际读回innerWidth/height/devicePixelRatio/htmlZoom=1，无横溢。

助手允许原内部滚动：先对原发送按钮scrollIntoViewIfNeeded，再对标题、输入、发送、关闭逐一toBeInViewport({ratio:1})，截真实viewport图并附实际几何值。桌面/窄窗同样验证这四个控制；没有要求初始无滚动一屏容纳全部，也没有隐藏真实未配置提示。

候选只通过TypeScript transpile语法0diagnostics与git apply --numstat解析；未代类型检查/测试PASS。Root可应用 `01-viewport-equivalent.patch`，源与补丁摘要见BINDING.json。后续如仅复验布局，可grep“设置与助手”运行3例；不要重放旧live任务。完整新模型复验由Root查明当前Worker异常后再授权唯一新task。
