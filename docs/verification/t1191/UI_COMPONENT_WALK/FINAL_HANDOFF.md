# final-source 隔离组件入口与夹具说明

这是实际产品组件隔离 harness，不是生产安装或真实服务。产品 AICopilotContent SHA256：`60fe11f9b68530fbe22a0e282e1eca182659c5e917dba281a04d0eaaa9adc1da`。只有中性数据，不能产生真实后台成功。

原宿主入口支持外部条件切换：

- 准备失败：`http://127.0.0.1:31591/normal/index.html?scenario=prepare`，原话固定为“这次明确修改”，外部 EditorPort 初态准备拒绝。
- 引擎未就绪：`http://127.0.0.1:31591/normal/index.html?scenario=creation`，原话“生成原文章图文候选”，原冻结 creationTarget 自动交给实际组件，外部引擎初态不可用。

顶部明确标注“隔离夹具”的按钮只切换外部 save 准备拒绝/就绪、引擎不可用/就绪及检查中/检查结束，点击后标签会显示新状态。它们没有替代产品状态或恢复逻辑。夹具只读输出提供 prepareCalls、postCalls、creationSubmission 与 blockedNetwork 计数。reload/new tab 重置本页面夹具和证据；第二次尝试可用新的同场景页面，不连真实服务。

网络边界固定返回 503，没有“成功”或网络恢复开关。实际 SDK 的 POST 只记录在浏览器私有 fetch 边界，不发往后台；没有 conversation/sourceMessageId 回执。设置 href 是实际产品链接，最小 next/link 宿主只记录激活，不打开真实生产设置页。不能把这里的链接激活称为真实设置配置成功。

真实全局宿主入口：

- `http://127.0.0.1:31591/?scenario=prepare`
- `http://127.0.0.1:31591/?scenario=creation`

这些页面实际挂载 OverlayController+AICopilotDialog+AICopilotContent，保原宿主头部/尺寸/focus trap，没有私有 CSS 注入或条件切换按钮，用于窄窗和实际浏览器缩放下的正常键盘/滚轮可达任务。页面显示的固定夹具标签不占产品面板高度。200% 需用浏览器真实网页缩放，不能以 CSS zoom/deviceScaleFactor 代替。

用户目标与完成标准：

1. 准备失败后继续本轮原目标：首请求零提交；条件变好不自动提交；用户选择恢复后只提交一次原话/原 editorTarget。
2. 引擎未就绪时找到正确处理入口：原因可懂、入口 href 正确、未就绪不提交；条件变好不自动提交，用户恢复才一次同原话/creationTarget，回调应先 not-submitted、后 submitted-unknown。
3. 结果未知时判断如何核对并避免重发：无回执须诚实显示未知、不能造成功或自动重试。窄窗/第二次/键盘以及实际 200% 的正常键盘和滚轮均应能到达必要输入与可用动作，无水平溢出。

fresh 执行者自行发现产品动作，不读取 maker 源码、driver 或逐步走查报告来代替任务。本页说明仅是隔离边界与故障操作，不给产品按钮选择步骤。所有观察、卡住和未做须原样记录。
