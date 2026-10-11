# T1224 测试预算及证据归属前置独评

2026-10-11，只读正式 SPEC、Packet、当前公共雷达 spec 和 budget-recheck.config；未运行 Next/浏览器、测试或修改源/共享控制面。

**精确测试设施范围准入 PASS；未签实现或浏览器 GREEN。** SPEC SHA256 `7bee72dc29e67997174365ce1fd5fb9396b0489a35b67c94daad0a4acd57dc17`；Packet `0f6f7210a6108f918b862c7fac1b6798691d62e4ef60aa97c99e45ebf900ed55`；原 spec `a45ebb88512dcdab94cf540cbbcdea41df66cff9eb5245307c117f2ff18c04b7`。

当前事实：waitForRun 默认120000，waitForTransform 默认60000，waitForURL显式30000，dispatch APIRequestContext.post 没有显式timeout；test.setTimeout(300000)覆盖了诊断config的timeout=0，config只覆盖expect120000，不能替换上述消费者预算。旅程另含多次page.goto、networkidle、waitForResponse及操作/清理，串行有限观察可能超过300000；该外层不是产品任务deadline。

准入限定：

- 只改 `frontend/tests/e2e/content-radar-one-click-project.spec.ts` 与 `docs/verification/t1224/**`。dispatch 请求明确至少120000；transform、导航及其它实际page等待/操作消费者须核实达到120000，保waitForRun及已有更長值。仅改expect不足以覆盖请求、waitForResponse或navigation默认值；可在本用例设置实际page默认操作/导航预算，API request另单独设置。
- 移除本用例300000外层覆盖、使用已登记诊断config timeout=0；这取消独立测试总上限，内部有限观察和真实产品原task deadline/attempt/ID仍有效。不得改等待终态族、续期/重发产品任务、提高retry、skip或吞异常。原250ms轮询间隔是间隔，不是执行期限；不要机械提高成两分钟。
- writeVisibleCopy提供显式本轮目录且本次实际必须传入；原schema/task_id/commit/captures及文字不变，未提供时保持既有默认。只给新结果独立输出，不覆盖 T870/T893/T900 原receipt。报告明确其本轮归属，不能当旧审核收据再次签名。
- 原 fixture、账号初始化、公共请求、RSS URL、定位和本地模型响应、长逐字稿两种视口、真实点击升级、公共项目ID/title及同ID重复立项断言不变。模型仍是本地OpenAI兼容测试替身，服务端W3 RSS依赖公开外网，浏览器外网隔离及隔离库保持；不称真人模型或平台成功。
- HTML/trace/截图/visible copy使用新目录，单worker/零retry、唯一Next独占，在T1217稳定哈希及真实回归完成后运行。保原失败trace/图；旧hook图片覆盖风险由root按既有T1207证据保全授权串行处理，不能将T1224两路径写集当成任意编辑scenario-index/history授权。原行字节状态不洗绿，必要路径指向相同原图副本须有前后hash记录。
- 验收是类型、精确lint、diff检查和完整原公共旅程实测，不能只拿helper预算检查通过收口。当前Packet列出的type/diff两项不替代正式SPEC要求的实际浏览器链和截图；新失败原样保留、再定位。

本任务是既有测试真实消费者预算与证据输出校准，不是产品UI重设计或服务契约变化。用户持续验证授权覆盖此窄范围；未引入新确认点。后续实现diff及实测证据需再审，本文件不代签T1217及全局Gate。
