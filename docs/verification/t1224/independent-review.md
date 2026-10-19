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

## 2026-10-11 窄实现与静态结果复核

**T1224 测试设施实现静态PASS，允许进入已登记公共浏览器验收；尚未签E2E或T1217。** 当前测试SHA256 `c43fb5ff2aa3fe99aaef98a32568f3c3d2d1fff6f2d4bb068449d2477d728339` 与作者 implementation-report 一致。本次只读diff、实际代码、诊断config和报告，没有重跑tsc/lint、启动Next或修改产品/测试/索引/共享控制面，仅追加本评审。

当场用只读脚本将全部批准变更在内存中逆向恢复后，与真实 `9fde2af65` 原测试字节完全相同，恢复SHA256仍为原 `a45ebb88512dcdab94cf540cbbcdea41df66cff9eb5245307c117f2ff18c04b7`；脚本实际exit0。这证明差异仅请求timeout、transform默认期限、页面两项默认期限、URL显式期限、移除300秒覆盖及输出目录选择。原全部公共输入/fixture、RSS URL、模型替身、页面操作、终态判断/失败抛出、所有断言及两处250ms间隔逐字保留，没有放宽匹配、重试或skip。

预算数值均是 `120_000` **毫秒（120秒）**，不是120ms：dispatch的post选项明确请求timeout，page.setDefaultTimeout覆盖响应/动作，page.setDefaultNavigationTimeout覆盖goto/networkidle等导航观察，waitForURL另显式120000，transform观察默认提高至120000，waitForRun既有120000不改；expect仍由诊断config单独120000。轮询总观察按原Date.now有限deadline，单个在途HTTP也独立120000，完整串行链可更长，由测试外层覆盖。删除test.setTimeout(300000)后仅在实际使用已登记budget-recheck.config timeout=0时没有独立测试总上限；普通别的config仍取其自身timeout，不声称源码普遍无限等待。产品持久任务ID/attempt/deadline、取消及执行期限完全未触及。

writeVisibleCopy仅新增 `CREATOROS_T1224_EVIDENCE_DIR`：显式相对路径按repoRoot解析，绝对路径亦可；未设置仍原orchestrator/evidence默认。输出文件名和schema/task_id/commit/captures/文字保持。因此**本轮运行必须实际设置新独立目录并记录环境/输出锚**，静态代码本身不能证明将来绝不会落默认旧receipt。报告对此准确标待执行，未制造新回执。仍不得以T870/T893/T900同名文件冒充旧验收再签。

implementation-report记录作者当场frontend tsc、精确eslint和diff-check实际exit0；本独评读取报告及root提供的真实静态退出结论，未将空诊断当作独立再次运行的证据。报告清楚未启动浏览器、无新截图/trace/网络attempt、不证明端到端完成；现证据边界充分。后续须等T1217产品稳定最终hash及隔离回归完成，唯一Next串行按原完整旅程操作并公共回读/截图。当前无本测试实现阻断，但真实公共链通过仍待发生。

## 2026-10-11 T1223/T1224 界面合同 Gate 适用性独评

**适用性结论 PASS：这两个任务当前不激活新增产品 frontend-journey-contract 的验收义务，可将误登记的验收列“待验”校准为“—”，由 root 记录理由并仍通过原 taskctl 留审计；不改 Gate 或校验器。** 本评审只读取，不编辑 BACKLOG/SPEC/控制面，也不执行任务状态转换。T1223 SPEC SHA256 `ae169f103e5d7c8f2bc1d16b53a1276f4da59d46100266cd350cd0a178c506c9`；T1224 SPEC `7bee72dc29e67997174365ce1fd5fb9396b0489a35b67c94daad0a4acd57dc17`。

依据已加载技能 gates/_GATE_EVIDENCE.md 的明确规则：“未激活的条件不产生缺失工件义务”“未触发条件不是例外”；ui-implementation-rules 要求按当前页面规格及实际界面实现，而非给每个测试/报告工具强造页面。taskctl.mjs:102 的 hasJourneyContract 对看板文档列实际本地链接逐个读取并仅识别 frontend-journey-contract fenced block；两个实际正式 SPEC 均无该合同或 PAGE_SPEC 引用。taskctl:259 起，acceptance=待验会不分任务类型把 evidence 当 UI report 校验并执行；acceptance=—仅在实际链接含 journey contract 时拒绝。这不是绕过存在的合同，当前不存在该触发条件。程序 SHA256 `f5d9660c87023b1320ba3703bd3b7ef6df9044356b271f6751d0343ea366e65d`；技能公共约定 `5dff08e3af35d3bccac5d82f3532864aaee6596467c05ac668e618e6f9eda4d6`。

适用判断不只依赖“没有代码块”：T1223 精确范围是验证报告生成器和两份派生文档，未改 CreatorOS 页面/组件/交互合同；已实际有原生成器 RED、新 fixture/full 字节确定性 GREEN、345 历史记录/224 TestID、保旧失败及唯一锚点、file 页面两视口截图/跳转与独评，证据证明报告修复而非全产品。T1224 仅改既有 E2E 请求/观察预算及独立证据目录，原产品 UI、输入/断言、服务/权限均未改，不应为测试设施新增产品设计合同。它的类型/lint/静态消费者检查已实际通过，当前公共回归尚待 T1217 稳定后发生。

因此验收列校准不解除任何正式 SPEC 要求：T1224 必须原完整来源→逐字稿保存→选题→用户点击升级→公共同 ID 项目回读/重复立项旅程、真实截图/日志/visible copy 独立保存，外网 RSS 与本地模型替身边界准确；T1223 也保原状态/图路径/统计和报告确定性。任何范围内失败仍保留并阻断其验收，不能拿“—”当完成或删断言/洗红。现有 3914/60/76 未终态及全局历史债不得签绿；未来若实际扩张产品 UI 或新增 journey contract，应按原条件重新激活 Gate。
