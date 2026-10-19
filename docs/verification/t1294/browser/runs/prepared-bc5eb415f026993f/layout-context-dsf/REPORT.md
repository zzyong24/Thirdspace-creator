# T1294 原生context三布局复验

实际 **3PASS / 0FAIL / retry0 / 10.7秒 / runner自然exit0**。仅grep“设置与助手”三例，未执行#10，无模型/资金提交。复用owned库/Root服务，不冒fresh首次聊天验收；原10项8P2F、第二轮布局2P1F均完整保留。

正式测试由Root采用每case describe内`test.use({viewport,deviceScaleFactor})`建立独立context，去掉CDP。本代理只执行，不改正式源码/测试/control。

|布局|实测CSS视口|DPR|zoom|scrollWidth|结果|
|---|---|---|---|---|---|
|desktop|1536×1024|1|1|1536|PASS|
|narrow|390×844|1|1|390|PASS|
|等效200%|640×450|2|1|640|PASS|

三例均保留原标题/输入/提交/关闭四控件完整视口ratio1、无横向溢出、无画布链接、无重复检查横条断言。等效200%沿原内部滚动后可操作，不用CSS html zoom冒浏览器缩放。

本代理额外从实际PNG头读取尺寸并断言`1280×900`；结果成功，记录在RESULT.json。已实际查看`assistant-equivalent200-after-original-scroll.png`，可见标题、输入区域、提交和关闭控件，未凭文件存在声称视觉通过。该证据说明CSS短高视口与DPR2模拟下的当前布局，不冒充原生App或用户实际浏览器UI缩放操作。

主图：`artifacts/e2e-t1294-model-settings-a-f1e6f-50-DSF2等效200-可读可操作且无画布-检查横条/assistant-equivalent200-after-original-scroll.png`。

`PROCESS.json`保测试SHA、原命令与本轮结束时间，`playwright.json`/`playwright-layout.log`保真实结果，`RESULT.json`保每例geometry及所有PNG尺寸/SHA。新binding只改evidenceRoot、state，表明复用ownedDB只测布局。

Runner91704和Worker91713自然退出（随后ps无对应PID），测试contexts/browser由Playwright关闭。本代理未再开其它浏览器，未停止Root87420服务；三例结束已立即通知Root，供其冷启动独立诊断继续，之后未保存来源或提交任务。
