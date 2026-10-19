# T-1117 SPEC 独立初审

- 评审时间（UTC）：`2026-10-09T09:45:27.017182+00:00`
- 结论：**CHANGES_REQUIRED**
- SPEC SHA-256：`3c7720477c882202f0971383405cd82e81c3bba3a0c782043e041dd62b90dc08`
- modules SHA-256：`10fb2d44b921dc0367817be075dfe6f49e0fd2531cc4c5b83738c5a034168a55`
- 产品宪法 SHA-256：`86bc2c8add6a01ebf5b2ecf9de05d448770ca14a4e0bdbbf376fffc6387e3800`

## 已成立的范围

这是一项既有画布局部一致性修复，不需要新视觉方向。保存失败继续保留真实失败状态和用户输入，只把未知英文错误交给现有 `describeUserError` 与中文兜底；HTTP 400/404/409及既有transport文案优先级不变。参考选择只在画布节点与详情传 `showIdentity=false`，共享flag覆盖可见列表、预览、已选字段和footer；默认true、ARIA/alt、搜索筛选、清除取消、busy、精确choiceKey/asset/file均保留。产品3路径与测试4路径足以实现，不需要改CanvasAssetPicker：它当前gallery已经传false。

现有真实截图证明缺口，SPEC也诚实区分隔离服务、网络/模型替身和原生UI人工眼验。normal/narrow视口、Enter确认、取消不采用、保存后get与重开构成有意义验收。

## REV-001（major，open）

SPEC AC03明确要求LED-047原174例，但 `T-1117.verify_commands.implementation` 目前没有运行该原8文件命令。完整reconcile不能替代一条精确、可计数的受影响回归。CanvasEditor错误状态与共享AssetPicker可能破坏本地弹层、按需渲染或迟到保护，而当前正式命令仍全部通过。

修订不需扩大写集：把 `reconcile.config.json` 中LED-047的原8文件Vitest命令逐字加入modules，保留 `--retry=0` 和现有预算；其它聚焦组件、真实Chrome、类型、三门卫及reconcile命令不变。修订后可按同一finding做recheck。

本初审不代签实现、前置RED、真实浏览器新截图、安装版、供应商生成或全局41项失败。
