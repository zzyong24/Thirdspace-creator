# T-1136 SPEC 扩展独立复核

- 审查时间：2026-10-09T15:50:48Z
- 结论：**PASS**
- 复核种类：`recheck`，cycle 1 round 2
- 前轮正式收据：`PASS[REV:fd7aae91a084]`
- 当前 SPEC SHA256：`4e772799e2fb3ac36d7b06c534c38f787f5f3e858da02f5bdc86ac4dd624a423`
- modules SHA256：`7df176e7c073c20d3663bca523724c03d9b3f765d546c5b170dfcd093b84053d`
- constitution SHA256：`86bc2c8add6a01ebf5b2ecf9de05d448770ca14a4e0bdbbf376fffc6387e3800`

## 结论依据

当前扩展属于原 T-1136 已要求的 Esc/取消后焦点返回验收，不增加产品路径或业务权限。原真实 baseline 在冻结源码上于 `2026-10-09T15:45:37.897Z` 至 `15:48:57.238Z` 运行，`exitCode=1`、0 retry；失败停在 1366 视口 Esc 后触发器 120 秒仍未获得焦点。因此它是焦点链真实失败，不是四视口几何 RED，也不能代签其它布局、保存或共享消费者断言。

静态调用链与修法吻合：当前排期组件直接渲染 `Button` 并调用 `setOpen(true)`，没有注册 `DialogTrigger`；已安装 `@radix-ui/react-dialog@1.1.17` 的 modal close auto-focus 实现会 `preventDefault()` 后调用 `context.triggerRef.current?.focus()`。在同一路径导入既有 `DialogTrigger`，用 `asChild` 包裹原按钮，并删除冗余 `onClick`，可以让现有受控 `open/onOpenChange` 保持唯一状态入口，同时恢复 Radix 原生触发器引用。无需修改共享 Dialog、手动 `focus()`、重试或业务服务。

扩展保留原 Button 的文案、variant、size、图标以及 pending 期间的 `onOpenChange` 守卫；也保留原焦点断言和首次失败证据。T1137 只记录发现与闭环，不另开产品实现路径。

产品两文件仍为原冻结 SHA：

- `frontend/src/components/ui/dialog.tsx`：`05ef54740d8ebb6dc0628bb1a35caabc4445717dab8e6bf73ad1bff87323d21b`
- `frontend/src/features/content-calendar/group-calendar-planning-control.tsx`：`d0c060754341568d99f9671dadd785c033e24c2c8c1b81008d8f8c528a8d91e4`

## 证据边界

- baseline receipt SHA256：`59eb918da33cdd2c5e60680e9135d544a55e1e25cfb921b1efed7b21ec51554f`
- baseline log SHA256：`cff5d71f2a166eb97e43b476df91a824650f159aca5df993f57ae62f884ccfed`
- 原 1366 截图可作为溢出观察，但首 case 在焦点断言终止，不能称四视口几何用例已完成。
- 本 PASS 只批准明确的同路径焦点扩展和原 T-1136 后续实现；不代签 GREEN、视觉、保存链、全局39项、T1135、安装或全功能。

当前无新 finding。首轮 findings 原为空，因此 recheck packet 仍为空数组；新运行事实与扩展已完整写入摘要，而没有伪造一个需要“销账”的首轮问题。
