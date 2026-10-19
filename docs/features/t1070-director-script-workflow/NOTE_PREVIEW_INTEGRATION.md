# T-1070：候选原生排版的完整可读性修复

原 SPEC 已要求独立只读候选能实际审读、翻页和导出。本补充落实同一要求，不增加能力、公共参数、数据写端或评审周期。原 93 路径合同与分镜消费者两路径保持；申请原挂载组件及其既有测试两路径的必要闭包，待独立范围复核后才准入。

## 当场独立视觉证据

`docs/verification/t1070/current-visual-review.json` 的 VIS-M02：1366×900 实际脚本/文章右栏中，原生图文卡片宽 450px，可见容器约 205–217px，横向 overflow hidden；文章正文 scrollHeight 6268/clientHeight 673，纵向 hidden，不能正常滚到后续章节。正常鼠标滚动和翻页均没有使全文/整卡可读。只完成“load/preview ready”不能签用户已看过完整候选。

现 `NativeEditorSurface` 创建实际原生容器，inline `overflow:hidden`；NoteRelay 原生 CSS `.creatoros-noterelay-native` 已定义 `overflow:auto`，被通用 inline 样式覆盖。这是实际挂载消费者的协议适配错误，不是新排版能力或语义选择。

```mermaid
flowchart LR
 C[候选卡点预览] --> R[隔离的原生排版实例]
 R --> S[完整正文可滚动，整卡可审读]
 S --> U[实际翻页与用户采纳]
```

## 两个精确消费者路径

- `frontend/src/features/reference-editors/native-editor-surface.tsx`：仅为已声明的 `noterelay` 编辑器恢复原生容器已有 auto overflow；其余 editor 类型保留原 hidden 及视频/画布生命周期。不穿透查询原生私有 DOM、不修改 native bundle/archive、不增加 request/update 或宿主 API。保持同一 owner/卸载/请求期限与对象引用。
- `frontend/src/features/reference-editors/native-editor-surface.test.tsx`：实际挂载 stub 模块与真实 ShadowRoot/容器，核 NoteRelay 正常滚动容器和其它原生消费者原策略；保存/卸载/取消旧回归保留。当场 RED→GREEN，单测只证明挂载策略，实际文章整章/图文全卡滚动仍需真实浏览器。

已准入 NoteRelayEditor 与两个候选卡可在原路径内改为有界宽屏预览弹层，使窄编导栏不成为作品页面的预览宽度；同一独立实例、原分页/导出/ready 与原采纳约束保留。弹层实际 Esc/焦点、200%/窄窗审读另取证；不得只通过隐藏滚动条、缩到不可读或 disabled/inert 伪造预览。

无新 API、表、权限、任务、owner、runtime、IPC、凭据或安装步骤。当前实现写集 95 加上述两个消费者为 97；旧四路径基础修复及原验收不变。未知原生/保存回执继续保 UNKNOWN，不以视觉加载改成保存成功。
