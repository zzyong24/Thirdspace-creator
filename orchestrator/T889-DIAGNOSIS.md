# T-889 制作页“确认决策，进入渲染”按钮无法点击诊断

## 结论

不是 CreatorOS 按钮被业务状态禁用，也不是点击处理函数未接线。当前机器上腾讯会议创建了两层与
CreatorOS 窗口完全同尺寸的前置窗口；在按钮中心坐标做系统级命中测试时，命中对象是腾讯会议窗口，
鼠标事件没有到达 CreatorOS WebView。

## 现场证据

- CreatorOS Accessibility 树中的按钮：
  - 名称：`确认决策,进入渲染`
  - `enabled=true`
  - 位置：`x=847, y=594, w=141, h=33`
- 对按钮中心附近 `x=917, y=610` 执行只读 `AXUIElementCopyElementAtPosition`：返回
  `AXWindow / 腾讯会议`，不是 CreatorOS 按钮。
- 系统前后顺序中，腾讯会议有两层 `1728×994 @ (0,33)` 的窗口排在同尺寸 CreatorOS 窗口之前；
  另有一个 `layer=1001` 的腾讯会议浮层。
- 当前 CreatorOS 按钮实现只在保存/调整材料进行中或仍引用不可用素材时禁用；现场按钮没有进入这些
  状态，Accessibility 也确认启用。
- 最新安全日志没有该次点击对应的分镜确认/渲染任务创建调用，符合“点击未到应用”的现象。
- focused regression：

```text
pnpm -C frontend exec vitest run \
  src/features/production/video-decision-preview.test.tsx \
  src/features/production/production-workbench.test.tsx

2 files / 46 tests PASS
```

测试覆盖按钮启用/禁用、点击后保存分镜并创建 `video.render` 任务、立即反馈和刷新恢复。

## 用户恢复方式

先停止腾讯会议的屏幕共享、远程控制或标注浮层；如果仍无效，完全退出腾讯会议后再点。仅把会议主窗
最小化不一定会销毁这两层透明窗口。CreatorOS 无法越过其他应用的系统级前置窗口接收鼠标事件。

## 范围边界

本轮只读检查应用状态、系统窗口顺序和加密安全日志；没有触发按钮、创建渲染任务、修改项目数据或
修改产品代码。
