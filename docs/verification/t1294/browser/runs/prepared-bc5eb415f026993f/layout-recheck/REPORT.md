# T1294 三布局复验

实际 **2PASS / 1FAIL / retry0 / 10.6秒 / exit1**。只执行原正式spec中grep“设置与助手”三例，未执行第10 Codex、没有模型/资金提交。复用Root owned库/服务87420，不冒fresh库；新binding只改evidenceRoot和state，原10项目录及playwright.json/artifacts完整未覆盖。

本轮Root在/accounts新文档后再次发Emulation.setDeviceMetricsOverride，保原四控件ratio1和DSF=2断言。本代理未改正式测试或源。

Desktop1536×1024、narrow390×844均通过。等效200%一例四控件完整视口断言全部通过，随后在正式spec第138行因`devicePixelRatio`实际1、期望2失败。

`GEOMETRY_TRACE_EXTRACT.json`显示两次override无错误，但最终真实geometry仍为`{width:640,height:450,dsf:1,zoom:"1",scrollWidth:640}`。实际settings和助手失败PNG都是640×450，未取得请求的1280×900截图，不声称200%视觉验收成功。没有把断言改成1洗绿。浏览器框架与CDP设备模拟是否竞争尚需具体诊断，建议Root考虑从context原生deviceScaleFactor=2建立测试环境；本轮未验证该建议。

`PROCESS.json`保精确命令、当前测试SHA和自然退出码；`RESULT.json`保各例结果；`SCREENSHOTS.json`列所有PNG尺寸/哈希。Playwright runner90678和Worker90687均退出，contexts/browser由原框架关闭，Root服务仍监听55594、本代理未关服务，也未再打开其它浏览器。三例结束已立即通知Root，来源保存阶段已结束，供Root串行开始其独立RPC/UI诊断。
