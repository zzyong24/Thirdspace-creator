# T1294 新绑定全10项真实执行

结论：**8 PASS / 2 FAIL / 0 skip / 0 retry**，runner自然exit1，总75.990秒。完整原日志、Playwright JSON、两个失败trace、截图均保留，未改正式源码/测试/control，也未重发或resume任何旧任务。本轮不声称T1294全验收通过。

Root服务为PID87420、127.0.0.1:55594；`server-acks.json`记录listening，UID501与owned marker一致。使用Root明确的新binding、原driver配置与原正式10项测试，1worker/retry0，没有另起Next或连接用户DB/真实资金。

```text
pnpm --dir frontend exec playwright test --config=/Users/zyongzhu/Workbase/Thirdspace-creator/docs/verification/t1294/browser/driver/playwright.config.cjs --workers=1 --retries=0
```

执行前4186源条目和11bundle比对全部一致；执行后同样无变动。test SHA `343ea6632ae7e4e0637b5375988d7e5e731d26a4c665356483a398726e2704c5`，config SHA `1ea6ae885878d0aa5be85225ee89d6fac3a783962c86b3edb57a78de0c26fad1`。完整绑定在FINAL_RUN_PREFLIGHT.json；不是只用旧HEAD签共享dirty。

|用例|实际结果|
|---|---|
|fresh官方默认/GET不自动写/四来源/唯一额度卡|PASS|
|自配与mixed图片重开保留/主动图片同CAS统一|PASS|
|真实CAS冲突不覆盖/草稿与失败提示|PASS|
|RedFox模型页保存掩码重开删除/旧深链|PASS|
|向量测试停用/资料创建修订与关键词搜索/错组隔离|PASS|
|常驻充值/原空body connect/未配置真实失败/零资金写|PASS|
|desktop助手与设置|PASS|
|narrow助手与设置|PASS|
|CSS640×450/DSF2等效200%|FAIL：DSF实1、期望2|
|唯一新Codex聊天与持久可读完成|FAIL：waiting_user，未完成|

## 第9项准确失败

`frontend/tests/e2e/t1294-model-settings-and-codex-chat.spec.ts:134` 的 `geometry.dsf` 期望2、实际1。前一行132的标题/输入/提交/关闭四控件`toBeInViewport({ratio:1})`全部已通过；因此本次没有证据证明这些控件仍越界。只读查看失败截图也能见四控件位于640×450画面。

`viewport-failure-trace-extract.json`保留原trace两层API记录：Emulation.setDeviceMetricsOverride调用无错误，稍后普通页面geometry的实际值为 `{width:640,height:450,dsf:1,zoom:"1",scrollWidth:640}`。override位于settings页，后续导航accounts，但具体为何override不保持仍需Root定位，不能只凭时序把浏览器机制当已证根因。本轮200%环境断言失败，不能声称200%视觉已验。

失败图：`artifacts/e2e-t1294-model-settings-a-b587a-50-DSF2等效200-可读可操作且无画布-检查横条/test-failed-1.png`。本代理已实际查看该图；不是仅检查文件存在。

## 第10项原任务保留

- group：`grp-f99a1af0-412`
- conversation：`ai-conv-f99a1af0-471`
- source：`ai-msg-f99a1af0-472`
- aiTask：`ai-task-06275463-1605-44b1-8d37-db3e4f0d9409`
- execution：`execution-task-d958f074-282f-4cf2-9692-9e5a3fbeda55`

公开观察终态为 `status=blocked / runtimeStatus=waiting_user / errorCode=CODEX_SESSION_PRECHECK_REJECTED`。原测试按已终态立即失败；未继续等成成功、未自动重试、未resume、未再开对话。不能用Root先前另一独立任务成功替代本次失败，也不从阶段码猜登录/参数/上游原因。

本次只有1次UI提交，3次HTTP POST为同任务流重连；3个200回执的conversation/source/AI/execution四ID逐项完全一致，`/api/chat/engines`请求0。没有触发工作台account-null的摘要查询去借其它账号绕过428。测试在断言`succeeded`时失败，尚未到持久assistant断言，因此本轮不签可读回复。`original-task-ids-final.json`及`original-task-final-observation-final.json`保原始公共回执，未改写。

## 证据与资源

`FINAL_RESULT.json`枚举全部10例、错误、26个PNG文件（13份唯一字节，含附件副本）、尺寸与SHA；`playwright.json`和`final-playwright.log`保原结果。截图不能把失败改成PASS。

Runner88778及最后Worker89313已无进程；全机进程只按Playwright临时profile特征机械检查，无残留对应浏览器进程。Playwright自然完成后关闭其owned contexts/browser，没有额外启动Ego/其它浏览器，没有关闭用户原浏览器。`FINAL_RESOURCE_SOURCE_CHECK.json`记录资源检查；Root服务87420仍监听55594，本代理未停止它，归还Root后续处理。

本轮真实验收仍有上述两个失败；不重跑第10模型。后续如果Root修夹具或生产，必须另存新运行证据，不覆盖本目录原失败。
