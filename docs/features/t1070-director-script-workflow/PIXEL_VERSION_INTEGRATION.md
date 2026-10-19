# T-1070：真实视频帧版本进入原渲染缓存

已在真实React同页新bundle复现：原画布先显示0秒，候选实际解码/Canvas像素已是1秒，但MediaBunny复用同Canvas身份，原Wasm外部纹理缓存误认为像素未变而不上传；首帧GPU沿用0秒。下帧换Canvas后恢复。根因日志见docs/verification/t1070/native-warm-root-cause.json。此前独立六族冷渲染PASS不能覆盖这个实际warm状态，原三次FAIL保留，revision4未CAS。

```mermaid
flowchart LR
 F[真实decoded frame timestamp] --> V[原内部texture内容版本]
 V --> G[相同Canvas但新帧重新上传GPU]
 G --> P[只读候选首帧对应真实1秒]
```

修复沿既有renderer/wasm缓存，不加公共API、owner、工具、runtime或依赖。仅把真实decoded timestamp机械传为内部contentVersion；同帧/同timestamp和静态图像继续原缓存。视频blur派生缓存也纳入实际source frame版本，防同族旧像素。代码不判断创作内容、不改变任何剪辑候选/时间或CAS基准。以下为必要source archive精确成员补充（原formal93不修改，不新评审轮次），待独立范围复核后才实现：

- apps/web/src/services/renderer/resolve.ts：实际frame timestamp传给原视觉/blur节点。
- apps/web/src/services/renderer/nodes/visual-node.ts：原纹理描述透传可选内容版本。
- apps/web/src/services/renderer/nodes/blur-background-node.ts：同一真实视频帧版本进入派生纹理contentHash。
- apps/web/src/services/renderer/compositor/types.ts：内部texture/cache DTO可选contentVersion，不改公共preview合同。
- apps/web/src/services/renderer/compositor/frame-descriptor.ts：机械生成原external descriptor时透传版本。
- apps/web/src/services/renderer/compositor/wasm-compositor.ts：identity/尺寸相同且内容版本也相同才缓存；上传后记录该版本。
- apps/web/src/services/renderer/compositor/__tests__/texture-content-version.test.ts：当场RED→GREEN原具体消费者：同池canvas0→1必须上传、重复1/static缓存保留、视频blur跟随版本；不以helper代签真实React暖画布首帧。

仅更新原7交付路径source archive、两累计patch、native.js、graph、manifest与原verifier（若它确需绑定新module）；CSS/许可不变则不写；新source成员无直接MAIN散落文件。固定源基点+完整patch重建零差异、锁依赖不变、源类型/tests、双构建byte等，最终再用原正确持久candidate97实际React暖画布→5秒MP4第一帧source24→CAS/Undo/保存切Tab/刷新/导出逐项验。原研究最多2最小实验，未完成验收不宣称全绿或完成。
